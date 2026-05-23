import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW = 60_000
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

function isDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function pickOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (ALLOWED_ORIGINS.length === 0 && isDevOrigin(origin)) return origin
  return ALLOWED_ORIGINS[0] || 'null'
}

function buildCors(req: Request) {
  return {
    'Access-Control-Allow-Origin': pickOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCors(req), 'Content-Type': 'application/json' },
  })
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

function extFromType(type: string): string {
  if (type.includes('mp4')) return 'mp4'
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('wav')) return 'wav'
  return 'webm'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) return json(req, { error: 'Demasiados intentos. Espera un minuto.' }, 429)

  if (!OPENAI_API_KEY) {
    console.error('[transcribe-audio] OPENAI_API_KEY no configurada')
    return json(req, { error: 'server_misconfigured' }, 500)
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(req, { error: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token)
  if (authError || !user) return json(req, { error: 'invalid_session' }, 401)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json(req, { error: 'invalid_form_data' }, 400)
  }

  const audio = form.get('audio')
  const language = String(form.get('language') || 'es').slice(0, 8)

  if (!(audio instanceof File)) return json(req, { error: 'audio_required' }, 400)
  if (audio.size <= 0) return json(req, { error: 'audio_empty' }, 400)
  if (audio.size > MAX_AUDIO_BYTES) return json(req, { error: 'audio_too_large' }, 413)
  if (!audio.type.startsWith('audio/')) return json(req, { error: 'invalid_audio_type' }, 400)

  const upstreamForm = new FormData()
  upstreamForm.append('model', 'whisper-1')
  upstreamForm.append('language', language)
  upstreamForm.append('response_format', 'json')
  upstreamForm.append('temperature', '0')
  upstreamForm.append('file', audio, `voice.${extFromType(audio.type)}`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45_000)

  let upstream: Response
  try {
    upstream = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: upstreamForm,
      signal: controller.signal,
    })
  } catch (e) {
    clearTimeout(timeoutId)
    console.error('[transcribe-audio] fetch error:', e)
    return json(req, { error: 'transcription_unavailable' }, 503)
  }
  clearTimeout(timeoutId)

  const data = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    console.error('[transcribe-audio] upstream error:', upstream.status, data?.error?.message)
    return json(req, { error: data?.error?.message || 'transcription_failed' }, upstream.status)
  }

  return json(req, { text: typeof data.text === 'string' ? data.text.trim() : '' })
})
