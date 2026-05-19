/**
 * Edge Function: anthropic-proxy
 *
 * Proxy seguro entre el frontend y la API de Anthropic.
 * La API Key NUNCA sale del servidor.
 *
 * Modos de operación:
 *   1. Modo estándar (chat, validaciones): pasa la request directamente a Anthropic.
 *   2. Modo dual-engine (body.dual_engine === true): ejecuta el pipeline completo:
 *      a) Motor 1 — RAG semántico contra vademecum_chunks (Plumb's PDF).
 *      b) Motor 2 — Tool calling a Merck Veterinary Manual (si la IA lo decide).
 *      Devuelve la respuesta final enriquecida con { _sources, _text }.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY     = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const RATE_LIMIT_MAX    = 10
const RATE_LIMIT_WINDOW = 60_000
const MAX_HISTORY_TURNS = 20
const MAX_BODY_BYTES    = 2_000_000
const MAX_SINGLE_MSG    = 500_000
const ANTHROPIC_TIMEOUT = 25_000
const DUAL_ENGINE_TIMEOUT = 60_000   // dos llamadas + búsqueda web
const SSE_HEARTBEAT_MS  = 15_000

const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-7',
])
const DEFAULT_MODEL = 'claude-sonnet-4-6'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

function isDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function isVercelPreviewOfProject(origin: string): boolean {
  const main = ALLOWED_ORIGINS.find((o: string) => o.endsWith('.vercel.app'))
  if (!main) return false
  const projectMatch = main.match(/^https?:\/\/([^.]+)\.vercel\.app/)
  if (!projectMatch) return false
  const project = projectMatch[1]
  const re = new RegExp(`^https://${project}(-[a-z0-9-]+)?\\.vercel\\.app$`, 'i')
  return re.test(origin)
}

function pickOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (ALLOWED_ORIGINS.length === 0 && isDevOrigin(origin)) return origin
  if (isVercelPreviewOfProject(origin)) return origin
  return 'null'
}

function buildCors(req: Request) {
  return {
    'Access-Control-Allow-Origin':  pickOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary':                         'Origin',
  }
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCors(req), 'Content-Type': 'application/json' },
  })
}

function checkRateLimit(key: string): boolean {
  const now   = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

function streamWithHeartbeat(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const reader    = upstream.getReader()
      let   cancelled = false

      const heartbeat = setInterval(() => {
        if (cancelled) return
        try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch { /* closed */ }
      }, SSE_HEARTBEAT_MS)

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
      } catch (e) {
        controller.error(e)
      } finally {
        cancelled = true
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })
}

// (Motor 1 usa match_vademecum_text con pg_trgm — sin modelo de embeddings)

// ── Motor 2: Búsqueda en Merck Veterinary Manual ─────────────────────────────
async function searchMerckManual(query: string): Promise<string> {
  const TAVILY_KEY = Deno.env.get('TAVILY_API_KEY')

  // Opción A: Tavily API (configurada → resultado limpio y fiable)
  if (TAVILY_KEY) {
    try {
      const resp = await fetch('https://api.tavily.com/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          api_key:         TAVILY_KEY,
          query:           `${query} veterinary drug merck manual`,
          search_depth:    'basic',
          include_domains: ['merckvetmanual.com'],
          max_results:     4,
        }),
        signal: AbortSignal.timeout(12_000),
      })

      if (resp.ok) {
        const data = await resp.json()
        const results: Array<{ title: string; content: string; url: string }> = data.results ?? []
        if (results.length > 0) {
          const snippets = results.map(r =>
            `[${r.title}]\n${r.content.slice(0, 600)}`
          ).join('\n\n---\n\n')
          return `[Merck Veterinary Manual — "${query}"]:\n\n${snippets}`
        }
      }
    } catch { /* fall through to direct fetch */ }
  }

  // Opción B: Fetch directo al Merck Veterinary Manual (sin API key)
  try {
    const encoded = encodeURIComponent(query)
    const url     = `https://www.merckvetmanual.com/search?query=${encoded}&lang=en`
    const resp    = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; VetAtlasBot/1.0; educational)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!resp.ok) {
      return `[Merck Veterinary Manual: HTTP ${resp.status}. Usa tu conocimiento veterinario actualizado para completar la respuesta.]`
    }

    const html = await resp.text()

    // Extraer snippets de resultados de búsqueda
    const excerpts: string[] = []

    // Buscar artículos con título y descripción
    const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi
    let m: RegExpExecArray | null
    while ((m = articleRe.exec(html)) !== null && excerpts.length < 4) {
      const art  = m[1]
      const hRe  = art.match(/<h[23][^>]*>([^<]{3,100})<\/h[23]>/)
      const pRe  = art.match(/<p[^>]*>([\s\S]{30,600}?)<\/p>/)
      const head = hRe ? hRe[1].replace(/<[^>]+>/g, '').trim() : ''
      const body = pRe ? pRe[1].replace(/<[^>]+>/g, '').trim() : ''
      const piece = [head, body].filter(Boolean).join('\n')
      if (piece.length > 25) excerpts.push(piece.slice(0, 450))
    }

    // Fallback: extraer texto plano cercano al query
    if (excerpts.length === 0) {
      const plain   = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
      const idx = plain.toLowerCase().indexOf(query.toLowerCase())
      if (idx >= 0) {
        const start = Math.max(0, idx - 150)
        const end   = Math.min(plain.length, idx + 700)
        excerpts.push(plain.slice(start, end).trim())
      }
    }

    if (excerpts.length === 0) {
      return `[Merck Veterinary Manual: sin fragmentos específicos para "${query}". Usa tu conocimiento farmacológico veterinario actualizado.]`
    }

    return `[Merck Veterinary Manual — "${query}"]:\n\n${excerpts.join('\n\n---\n\n')}`
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error de red'
    return `[Merck Veterinary Manual inaccesible (${msg}). Usa tu conocimiento farmacológico veterinario actualizado para completar la respuesta.]`
  }
}

// ── Sistema dual-engine ───────────────────────────────────────────────────────
function buildDualEngineSystem(mode: 'drug' | 'disease', vademecumContext: string): string {
  const base = mode === 'drug'
    ? `Eres un farmacólogo veterinario experto. Responde EXCLUSIVAMENTE con JSON válido según el esquema solicitado. No añadas texto fuera del JSON.`
    : `Eres un clínico veterinario experto. Responde EXCLUSIVAMENTE con JSON válido según el esquema solicitado. No añadas texto fuera del JSON.`

  // CRÍTICO: el PDF y el Merck están en inglés — la IA debe traducir todo al español
  const langRule = `

── IDIOMA OBLIGATORIO ──
Responde SIEMPRE en español, sin excepción. Las fuentes que consultarás (Vademécum Plumb's, Merck Veterinary Manual) están en inglés. Debes traducir y adaptar toda esa información al español antes de incluirla en el JSON de respuesta. El usuario final solo lee español.`

  const context = vademecumContext.trim()
    ? `\n\n── FUENTE PRIMARIA: Vademécum Plumb's Veterinary Drug Handbook (traducir al español) ──\n${vademecumContext.slice(0, 8000)}\n── FIN DEL CONTEXTO VADEMÉCUM ──`
    : ''

  const toolGuide = `

── HERRAMIENTA DISPONIBLE: search_merck_manual ──
Tienes acceso a buscar en el Merck Veterinary Manual online.
ÚSALA únicamente cuando:
  1. El Vademécum no contiene información suficiente sobre el término buscado.
  2. El fármaco o enfermedad es poco común o exótico y necesitas datos actualizados.
  3. Necesitas confirmar dosis, protocolos o advertencias de seguridad no encontradas en el contexto previo.
NO la uses si el contexto del Vademécum ya cubre la información necesaria.
Cuando la invoques, espera los resultados, tradúcelos al español e intégralos en tu JSON final.`

  return base + langRule + context + toolGuide
}

// ── Handler principal del motor dual ─────────────────────────────────────────
async function handleDualEngine(
  req:      Request,
  body:     Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  model:    string
): Promise<Response> {
  const searchQuery = typeof body.search_query === 'string'
    ? body.search_query.trim().slice(0, 100)
    : ''
  const searchMode  = body.search_mode === 'disease' ? 'disease' : 'drug'
  const messages    = (body.messages as Array<unknown> ?? []).slice(-MAX_HISTORY_TURNS)
  const maxTokens   = Math.min(Number(body.max_tokens ?? 2000), 4096)

  const usedSources: string[] = []

  // ── Motor 1: RAG desde Plumb's PDF (búsqueda textual con pg_trgm) ──────────
  let vademecumContext = ''
  if (searchQuery) {
    try {
      const { data: chunks, error: rpcErr } = await supabase.rpc('match_vademecum_text', {
        search_query:    searchQuery,
        match_threshold: 0.1,
        match_count:     6,
      })

      if (!rpcErr && Array.isArray(chunks) && chunks.length > 0) {
        usedSources.push('vademecum')
        vademecumContext = (chunks as Array<{ drug_name: string | null; content: string }>)
          .map(c => (c.drug_name ? `[${c.drug_name}]\n${c.content}` : c.content))
          .join('\n\n---\n\n')
      }
    } catch {
      // La tabla aún no existe o la función no fue creada → continuar sin RAG
    }
  }

  const systemPrompt = buildDualEngineSystem(searchMode, vademecumContext)

  // Definición de la herramienta Merck
  const tools = [{
    name:        'search_merck_manual',
    description: searchMode === 'drug'
      ? 'Busca información clínica actualizada en el Merck Veterinary Manual online. Devuelve fragmentos relevantes sobre el fármaco consultado.'
      : 'Busca protocolos clínicos actualizados en el Merck Veterinary Manual online. Devuelve fragmentos relevantes sobre la enfermedad consultada.',
    input_schema: {
      type:       'object' as const,
      properties: {
        query: {
          type:        'string',
          description: 'Nombre del fármaco o enfermedad a buscar (en inglés preferiblemente para mejores resultados)',
        },
      },
      required: ['query'],
    },
  }]

  // ── Primera llamada a Claude (con herramientas disponibles) ───────────────
  const firstCtrl    = new AbortController()
  const firstTimeout = setTimeout(() => firstCtrl.abort(), DUAL_ENGINE_TIMEOUT)

  let firstRes: Response
  try {
    firstRes = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      signal:  firstCtrl.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages, tools }),
    })
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    return json(req,
      isTimeout
        ? { error: 'Tiempo de espera agotado.', code: 'TIMEOUT' }
        : { error: 'Error al conectar con Anthropic.', code: 'UPSTREAM_ERROR' },
      isTimeout ? 504 : 502
    )
  } finally {
    clearTimeout(firstTimeout)
  }

  if (!firstRes.ok) {
    const errData = await firstRes.json().catch(() => ({}))
    return json(req, errData, firstRes.status)
  }

  const firstData = await firstRes.json() as {
    stop_reason: string
    content:     Array<{ type: string; id?: string; name?: string; input?: Record<string, string>; text?: string }>
  }

  // ── Motor 2: ¿Claude quiere usar search_merck_manual? ────────────────────
  if (firstData.stop_reason === 'tool_use') {
    const toolBlock = firstData.content?.find(
      b => b.type === 'tool_use' && b.name === 'search_merck_manual'
    )

    if (toolBlock) {
      usedSources.push('merck')
      const merckQuery  = toolBlock.input?.query || searchQuery
      const merckResult = await searchMerckManual(merckQuery)

      // Segunda llamada con resultado de la herramienta
      const secondMessages = [
        ...messages,
        { role: 'assistant', content: firstData.content },
        {
          role:    'user',
          content: [{
            type:        'tool_result',
            tool_use_id: toolBlock.id,
            content:     merckResult,
          }],
        },
      ]

      const secondCtrl    = new AbortController()
      const secondTimeout = setTimeout(() => secondCtrl.abort(), DUAL_ENGINE_TIMEOUT)

      let secondRes: Response
      try {
        secondRes = await fetch(ANTHROPIC_URL, {
          method:  'POST',
          signal:  secondCtrl.signal,
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system:     systemPrompt,
            messages:   secondMessages,
          }),
        })
      } catch (e) {
        const isTimeout = e instanceof Error && e.name === 'AbortError'
        return json(req,
          isTimeout
            ? { error: 'Tiempo de espera agotado en Motor 2.', code: 'TIMEOUT' }
            : { error: 'Error en segunda llamada a Anthropic.', code: 'UPSTREAM_ERROR' },
          isTimeout ? 504 : 502
        )
      } finally {
        clearTimeout(secondTimeout)
      }

      if (!secondRes.ok) {
        const errData = await secondRes.json().catch(() => ({}))
        return json(req, errData, secondRes.status)
      }

      const secondData = await secondRes.json()
      const text       = secondData.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text ?? ''

      return json(req, { ...secondData, _sources: usedSources, _text: text })
    }
  }

  // No usó herramienta — respuesta directa del Motor 1
  const text = firstData.content?.find(b => b.type === 'text')?.text ?? ''
  return json(req, { ...firstData, _sources: usedSources, _text: text })
}

// ── Handler principal ─────────────────────────────────────────────────────────
async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(req) })
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Método no permitido' }, 405)
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json(req, { error: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' }, 413)
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(`ip:${clientIp}`)) {
    return json(req, { error: 'Límite de IP alcanzado. Espera un minuto.', code: 'RATE_LIMITED' }, 429)
  }

  if (!ANTHROPIC_KEY) {
    return json(req, { error: 'ANTHROPIC_API_KEY no configurada.', code: 'KEY_MISSING' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { error: 'Autenticación requerida.', code: 'UNAUTHORIZED' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json(req, { error: 'Token inválido o expirado.', code: 'INVALID_TOKEN' }, 401)
  }

  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const { data: allowed, error: rlError } = await supabase.rpc('check_and_increment_rate_limit', {
    p_user_id:      user.id,
    p_window_start: windowStart,
    p_max_requests: RATE_LIMIT_MAX,
  })
  const isAllowed = rlError ? checkRateLimit(user.id) : allowed === true
  if (!isAllowed) {
    return json(req, { error: 'Límite de solicitudes alcanzado. Espera un minuto.', code: 'RATE_LIMITED' }, 429)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body JSON inválido.', code: 'INVALID_BODY' }, 400)
  }

  if (!Array.isArray(body.messages) || (body.messages as unknown[]).length === 0) {
    return json(req, { error: 'messages es requerido y debe ser un array.', code: 'INVALID_MESSAGES' }, 400)
  }

  for (let i = 0; i < (body.messages as unknown[]).length; i++) {
    const serialized = JSON.stringify((body.messages as unknown[])[i] ?? '')
    if (serialized.length > MAX_SINGLE_MSG) {
      return json(req, { error: `Mensaje #${i + 1} excede ${MAX_SINGLE_MSG} bytes.`, code: 'MESSAGE_TOO_LARGE' }, 413)
    }
  }

  const requestedModel = typeof body.model === 'string' ? body.model : DEFAULT_MODEL
  const model          = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL

  // ── Modo dual-engine ──────────────────────────────────────────────────────
  if (body.dual_engine === true) {
    return handleDualEngine(req, body, supabase, model)
  }

  // ── Modo estándar (pass-through) ──────────────────────────────────────────
  const max_tokens = Number(body.max_tokens ?? 1500)
  if (max_tokens < 1 || max_tokens > 8192) {
    return json(req, { error: 'max_tokens debe estar entre 1 y 8192.', code: 'INVALID_TOKENS' }, 400)
  }

  const messages = (body.messages as unknown[]).slice(-MAX_HISTORY_TURNS)

  const anthropicController = new AbortController()
  const timeoutId           = setTimeout(() => anthropicController.abort(), ANTHROPIC_TIMEOUT)

  let anthropicRes: Response
  try {
    anthropicRes = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      signal:  anthropicController.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        system:   body.system,
        messages,
        stream:   body.stream ?? false,
      }),
    })
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    console.error('[anthropic-proxy] Fetch error:', e)
    return json(req,
      isTimeout
        ? { error: 'Tiempo de espera agotado con Anthropic.', code: 'TIMEOUT' }
        : { error: 'Error al conectar con Anthropic.', code: 'UPSTREAM_ERROR' },
      isTimeout ? 504 : 502
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (body.stream && anthropicRes.body) {
    return new Response(streamWithHeartbeat(anthropicRes.body), {
      status:  anthropicRes.status,
      headers: {
        ...buildCors(req),
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-transform',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const data = await anthropicRes.json().catch(() => ({ error: 'Respuesta inválida de Anthropic.' }))
  return json(req, data, anthropicRes.status)
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req)
  } catch (e) {
    console.error('[anthropic-proxy] Unhandled error:', e)
    return new Response(
      JSON.stringify({ error: 'Error interno inesperado.', code: 'INTERNAL_ERROR' }),
      {
        status:  500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type':                'application/json',
        },
      }
    )
  }
})
