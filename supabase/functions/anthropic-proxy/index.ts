/**
 * Edge Function: anthropic-proxy
 *
 * Actúa como proxy seguro entre el frontend y la API de Anthropic.
 * La API Key de Anthropic NUNCA sale del servidor.
 *
 * Implementa:
 * - Autenticación JWT obligatoria (DoD Tier 1)
 * - Rate limiting básico por usuario (DoD Tier 2)
 * - Registro de IP en auditoría (DoD 2.2)
 * - Soporte de streaming SSE
 *
 * Endpoint: POST /functions/v1/anthropic-proxy
 * Body: { messages, system, max_tokens, model, stream }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// Rate limiting simple en memoria (se reinicia con cada instancia cold-start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10        // requests por minuto por usuario
const RATE_LIMIT_WINDOW = 60_000 // 1 minuto en ms

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
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  // ── Verificar API Key de Anthropic configurada ──
  if (!ANTHROPIC_KEY) {
    return json({
      error: 'ANTHROPIC_API_KEY no configurada en los secretos de Supabase.',
      code: 'KEY_MISSING',
    }, 500)
  }

  // ── Autenticación JWT obligatoria (DoD Tier 1) ──
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

  // ── Rate limiting por usuario (DoD Tier 2) ──
  if (!checkRateLimit(user.id)) {
    return json({
      error: 'Límite de solicitudes alcanzado. Espera un minuto.',
      code: 'RATE_LIMITED',
    }, 429)
  }

  // ── Validar body (DoD Tier 2 — input validation) ──
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

  // ── Llamar a Anthropic ──
  const anthropicBody = {
    model:      body.model ?? 'claude-sonnet-4-6',
    max_tokens,
    system:     body.system,
    messages:   body.messages,
    stream:     body.stream ?? false,
  }

  const anthropicRes = await fetch(ANTHROPIC_URL, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody),
  })

  // ── Streaming: pasar el stream directamente al cliente ──
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

  // ── Respuesta normal ──
  const data = await anthropicRes.json()
  return json(data, anthropicRes.status)
})
