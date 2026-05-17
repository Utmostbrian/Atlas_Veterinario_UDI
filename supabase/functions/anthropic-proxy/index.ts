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
const MAX_HISTORY_TURNS = 20   // B-04: cap conversation history sent to Anthropic
const MAX_BODY_BYTES    = 2_000_000 // B-03: 2 MB payload limit
const ANTHROPIC_TIMEOUT = 25_000   // B-05: 25 s upstream timeout

// In-memory fallback (used when DB rate-limit check fails, and for IP-based check)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// A-02: CORS allowlist — varios dominios separados por coma en ALLOWED_ORIGIN.
// Si la var no está seteada, en dev permitimos * (con warning), en prod debe estar definida.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

function pickOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.length === 0) return '*'
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCors(req) })
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'Método no permitido' }, 405)
  }

  // B-03: Reject oversized payloads before any parsing
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json(req, { error: 'Payload demasiado grande.', code: 'PAYLOAD_TOO_LARGE' }, 413)
  }

  // B-06: IP-based rate limit (protects shared student account; checked before JWT)
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(`ip:${clientIp}`)) {
    return json(req, { error: 'Límite de IP alcanzado. Espera un minuto.', code: 'RATE_LIMITED' }, 429)
  }

  if (!ANTHROPIC_KEY) {
    return json(req, { error: 'ANTHROPIC_API_KEY no configurada.', code: 'KEY_MISSING' }, 500)
  }

  // Autenticación JWT
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

  // Rate limiting persistente via PostgreSQL (sobrevive reinicios del worker)
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
    messages: unknown[]
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

  const max_tokens = body.max_tokens ?? 1500
  if (max_tokens < 1 || max_tokens > 8192) {
    return json(req, { error: 'max_tokens debe estar entre 1 y 8192.', code: 'INVALID_TOKENS' }, 400)
  }

  // B-04: Truncate history to prevent token overflow on long conversations
  const messages = body.messages.slice(-MAX_HISTORY_TURNS)

  // B-05: Explicit timeout for the Anthropic upstream call
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
        model:      body.model ?? 'claude-sonnet-4-6',
        max_tokens,
        system:     body.system,
        messages,
        stream:     body.stream ?? false,
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

  if (body.stream) {
    return new Response(anthropicRes.body, {
      status:  anthropicRes.status,
      headers: {
        ...buildCors(req),
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    })
  }

  const data = await anthropicRes.json().catch(() => ({ error: 'Respuesta inválida de Anthropic.' }))
  return json(req, data, anthropicRes.status)
})
