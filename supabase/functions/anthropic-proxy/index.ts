/**
 * Edge Function: anthropic-proxy
 * Proxy seguro entre el frontend y la API de Anthropic.
 * La API Key NUNCA sale del servidor.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// In-memory fallback (used only when DB rate-limit check fails)
const rateLimitMap  = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 10
const RATE_LIMIT_WINDOW = 60_000

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function checkRateLimit(userId: string): boolean {
  const now   = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

Deno.serve(async (req: Request) => {
  // Preflight CORS — always allow, no JWT needed
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  // Verificar API Key configurada
  if (!ANTHROPIC_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY no configurada.', code: 'KEY_MISSING' }, 500)
  }

  // Autenticación JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Autenticación requerida.', code: 'UNAUTHORIZED' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ error: 'Token inválido o expirado.', code: 'INVALID_TOKEN' }, 401)
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
    return json({ error: 'Límite de solicitudes alcanzado. Espera un minuto.', code: 'RATE_LIMITED' }, 429)
  }

  // Validar body
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
    return json({ error: 'Body JSON inválido.', code: 'INVALID_BODY' }, 400)
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages es requerido y debe ser un array.', code: 'INVALID_MESSAGES' }, 400)
  }

  const max_tokens = body.max_tokens ?? 1500
  if (max_tokens < 1 || max_tokens > 8192) {
    return json({ error: 'max_tokens debe estar entre 1 y 8192.', code: 'INVALID_TOKENS' }, 400)
  }

  // Llamar a Anthropic con manejo de errores para garantizar CORS headers siempre
  let anthropicRes: Response
  try {
    anthropicRes = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      body.model ?? 'claude-sonnet-4-6',
        max_tokens,
        system:     body.system,
        messages:   body.messages,
        stream:     body.stream ?? false,
      }),
    })
  } catch (e) {
    console.error('[anthropic-proxy] Fetch error:', e)
    return json({ error: 'Error al conectar con Anthropic.', code: 'UPSTREAM_ERROR' }, 502)
  }

  // Streaming
  if (body.stream) {
    return new Response(anthropicRes.body, {
      status:  anthropicRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    })
  }

  // Respuesta normal
  const data = await anthropicRes.json().catch(() => ({ error: 'Respuesta inválida de Anthropic.' }))
  return json(data, anthropicRes.status)
})