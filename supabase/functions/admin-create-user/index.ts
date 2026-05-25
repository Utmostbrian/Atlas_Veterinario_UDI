import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCors, json } from '../_shared/cors.ts'

const CORS_METHODS = 'POST, OPTIONS'

// Rate limit en memoria (por IP) — un admin no debería crear más de 20 usuarios/min
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 20
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

// Validación mínima de email/contraseña/rol
const VALID_ROLES = ['admin', 'docente', 'student'] as const
type Role = typeof VALID_ROLES[number]

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCors(req, CORS_METHODS) })
  if (req.method !== 'POST')    return json(req, { error: 'method_not_allowed' }, 405, CORS_METHODS)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return json(req, { error: 'Demasiados intentos. Espera un minuto.' }, 429, CORS_METHODS)
  }

  // 1) Extraer JWT del caller
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(req, { error: 'unauthorized' }, 401, CORS_METHODS)

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
  const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!serviceRoleKey) {
    console.error('[admin-create-user] SUPABASE_SERVICE_ROLE_KEY no configurado')
    return json(req, { error: 'server_misconfigured' }, 500, CORS_METHODS)
  }

  // 2) Validar token y obtener identidad del caller
  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token)
  if (authError || !caller) return json(req, { error: 'invalid_session' }, 401, CORS_METHODS)

  // 3) Verificar que el caller es admin
  const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: profile, error: profileError } = await supabaseService
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return json(req, { error: 'forbidden_admin_only' }, 403, CORS_METHODS)
  }

  // 4) Parsear body
  let body: { email?: string; password?: string; name?: string; role?: Role }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_json' }, 400, CORS_METHODS)
  }

  const email    = typeof body.email    === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name     = typeof body.name     === 'string' ? body.name.trim() : ''
  const role     = (typeof body.role    === 'string' ? body.role : null) as Role | null

  if (!email || !isValidEmail(email)) return json(req, { error: 'invalid_email' }, 400, CORS_METHODS)
  if (!password || password.length < 8) return json(req, { error: 'password_too_short' }, 400, CORS_METHODS)
  if (!name || name.length < 2 || name.length > 80) return json(req, { error: 'invalid_name' }, 400, CORS_METHODS)
  if (!role || !VALID_ROLES.includes(role)) return json(req, { error: 'invalid_role' }, 400, CORS_METHODS)

  // 5) Crear usuario (Admin API — auto-confirma)
  const { data: created, error: createError } = await supabaseService.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (createError || !created.user) {
    const msg = createError?.message ?? 'create_user_failed'
    // Si el usuario ya existe, dar mensaje específico
    if (msg.toLowerCase().includes('already')) {
      return json(req, { error: 'email_already_exists' }, 409, CORS_METHODS)
    }
    console.error('[admin-create-user] createUser error:', msg)
    return json(req, { error: msg }, 500, CORS_METHODS)
  }

  const newUserId = created.user.id

  // 6) Actualizar role + name en el profile (el trigger handle_new_user lo creó como 'student')
  const { error: updateError } = await supabaseService
    .from('profiles')
    .update({ role, name })
    .eq('id', newUserId)

  if (updateError) {
    console.error('[admin-create-user] profile update error:', updateError.message)
    // El usuario quedó creado pero con role default; igual reportar éxito parcial
    return json(req, {
      ok:    true,
      user:  { id: newUserId, email, name, role: 'student' },
      warning: `Usuario creado pero el rol quedó como 'student'. Actualízalo manualmente. Causa: ${updateError.message}`,
    }, 200, CORS_METHODS)
  }

  return json(req, {
    ok:   true,
    user: { id: newUserId, email, name, role },
  }, 200, CORS_METHODS)
})
