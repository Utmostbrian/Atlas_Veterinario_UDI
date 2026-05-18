/**
 * Edge Function: anthropic-proxy
 * Proxy seguro entre el frontend y la API de Anthropic.
 * La API Key NUNCA sale del servidor.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_URL    = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY    = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const RATE_LIMIT_MAX   = 10
const RATE_LIMIT_WINDOW = 60_000
const MAX_HISTORY_TURNS = 20
const MAX_BODY_BYTES    = 2_000_000        // 2 MB total
const MAX_SINGLE_MSG    = 500_000          // B4: 500 KB por mensaje individual
const ANTHROPIC_TIMEOUT = 25_000
const SSE_HEARTBEAT_MS  = 15_000           // B6: ping cada 15 s en SSE

// B1: allowlist de modelos. El cliente NO puede pedir uno fuera de esta lista.
// Si pide algo distinto, se reemplaza por el default.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-7',
])
const DEFAULT_MODEL = 'claude-sonnet-4-6'

// In-memory IP rate limit (fallback rápido por worker)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// CORS allowlist — incluye regex para previews de Vercel (V2)
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

function isDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

// V2: cualquier subdominio *.vercel.app del mismo proyecto (preview deployments).
// Extraemos el "proyecto" del primer ALLOWED_ORIGIN configurado.
function isVercelPreviewOfProject(origin: string): boolean {
  const main = ALLOWED_ORIGINS.find((o: string) => o.endsWith('.vercel.app'))
  if (!main) return false
  // De https://atlas-veterinario-udi.vercel.app extraemos "atlas-veterinario-udi"
  const projectMatch = main.match(/^https?:\/\/([^.]+)\.vercel\.app/)
  if (!projectMatch) return false
  const project = projectMatch[1]
  // Aceptamos atlas-veterinario-udi-git-*.vercel.app y -<hash>.vercel.app
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

// B6: wrappear SSE upstream con heartbeat para evitar timeouts intermedios
// de Vercel/CloudFlare (~30 s sin tráfico = conexión cerrada).
function streamWithHeartbeat(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader()
      let cancelled = false

      const heartbeat = setInterval(() => {
        if (cancelled) return
        try {
          // Comentario SSE: ignorado por el cliente, mantiene la conexión viva
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch { /* controller cerrado */ }
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

  // B2: rate limit por IP — además del Map en memoria, persistir en DB.
  // Sin user_id porque este check corre antes del JWT.
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

  // B2: rate limit persistente por user_id (sobrevive worker restart)
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

  let body: {
    messages: Array<{ role?: string; content?: unknown }>
    system?: string
    max_tokens?: number
    model?: string
    stream?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body JSON inválido.', code: 'INVALID_BODY' }, 400)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(req, { error: 'messages es requerido y debe ser un array.', code: 'INVALID_MESSAGES' }, 400)
  }

  // B4: validar tamaño individual de cada mensaje
  for (let i = 0; i < body.messages.length; i++) {
    const serialized = JSON.stringify(body.messages[i] ?? '')
    if (serialized.length > MAX_SINGLE_MSG) {
      return json(
        req,
        { error: `Mensaje #${i + 1} excede ${MAX_SINGLE_MSG} bytes.`, code: 'MESSAGE_TOO_LARGE' },
        413
      )
    }
  }

  const max_tokens = body.max_tokens ?? 1500
  if (max_tokens < 1 || max_tokens > 8192) {
    return json(req, { error: 'max_tokens debe estar entre 1 y 8192.', code: 'INVALID_TOKENS' }, 400)
  }

  // B1: forzar modelo a la allowlist. El cliente NO controla cuánto cuesta cada llamada.
  const requestedModel = typeof body.model === 'string' ? body.model : DEFAULT_MODEL
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL

  const messages = body.messages.slice(-MAX_HISTORY_TURNS)

  const anthropicController = new AbortController()
  const timeoutId = setTimeout(() => anthropicController.abort(), ANTHROPIC_TIMEOUT)

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
        system:  body.system,
        messages,
        stream:  body.stream ?? false,
      }),
    })
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError'
    console.error('[anthropic-proxy] Fetch error:', e)
    return json(
      req,
      isTimeout
        ? { error: 'Tiempo de espera agotado con Anthropic.', code: 'TIMEOUT' }
        : { error: 'Error al conectar con Anthropic.', code: 'UPSTREAM_ERROR' },
      isTimeout ? 504 : 502
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (body.stream && anthropicRes.body) {
    // B6: envolver el stream con heartbeat para sobrevivir timeouts intermedios.
    return new Response(streamWithHeartbeat(anthropicRes.body), {
      status:  anthropicRes.status,
      headers: {
        ...buildCors(req),
        'Content-Type':              'text/event-stream',
        'Cache-Control':             'no-cache, no-transform',
        'Connection':                'keep-alive',
        'X-Accel-Buffering':         'no',  // disable nginx buffering
      },
    })
  }

  const data = await anthropicRes.json().catch(() => ({ error: 'Respuesta inválida de Anthropic.' }))
  return json(req, data, anthropicRes.status)
}

// Top-level wrapper: garantiza headers CORS aún en errores inesperados.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req)
  } catch (e) {
    console.error('[anthropic-proxy] Unhandled error:', e)
    return json(req, { error: 'Error interno inesperado.', code: 'INTERNAL_ERROR' }, 500)
  }
})
