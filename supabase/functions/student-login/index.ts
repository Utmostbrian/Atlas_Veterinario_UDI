import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCors, json } from '../_shared/cors.ts'

const CORS_METHODS = 'POST, OPTIONS'

// Rate limit en memoria — ver migración 20260516000001 para variante persistente.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60_000

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCors(req, CORS_METHODS) })
  if (req.method !== 'POST')    return json(req, { error: 'method_not_allowed' }, 405, CORS_METHODS)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    console.warn('[student-login] Rate limit hit for IP:', ip)
    return json(req, { error: 'Demasiados intentos. Espera un minuto.' }, 429, CORS_METHODS)
  }

  try {
    const { name, classCode } = await req.json()

    if (!name?.trim() || !classCode?.trim()) {
      return json(req, { error: 'Nombre y código de clase son requeridos.' }, 400, CORS_METHODS)
    }

    const expectedCode = Deno.env.get('STUDENT_CLASS_CODE')
    if (!expectedCode || classCode.trim() !== expectedCode) {
      return json(req, { error: 'Código de clase incorrecto.' }, 401, CORS_METHODS)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    'estudiante@udi.edu.bo',
      password: Deno.env.get('STUDENT_ACCOUNT_PASSWORD')!,
    })

    if (error) {
      console.error('[student-login] Supabase auth error:', error.message)
      return json(req, { error: 'Error interno. Contacta al administrador.' }, 500, CORS_METHODS)
    }

    // B3: registrar quién accedió (nombre real + IP + cuándo) en audit_logs.
    // Como SP es SECURITY DEFINER, no necesita JWT del estudiante.
    // No bloqueamos la respuesta si falla — best effort.
    if (data.user?.id) {
      try {
        await supabase.rpc('sp_insert_audit_log', {
          p_event_id:    `STUDENT_LOGIN-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          p_user_id:     data.user.id,
          p_event_type:  'AUTH_LOGIN',
          p_summary:     `Login estudiante: ${name.trim()}`,
          p_ip_address:  ip,
          p_metadata:    { kind: 'student_login', name: name.trim() },
          p_actor_name:  name.trim(),
        })
      } catch (e) {
        console.warn('[student-login] audit log failed:', e)
      }
    }

    return json(req, { session: data.session, studentName: name.trim() }, 200, CORS_METHODS)
  } catch (e) {
    console.error('[student-login] Unexpected error:', e)
    return json(req, { error: 'Error del servidor.' }, 500, CORS_METHODS)
  }
})
