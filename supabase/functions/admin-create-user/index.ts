import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

const cors = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN.split(',')[0]?.trim() ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Validación mínima de email/contraseña/rol
const VALID_ROLES = ['admin', 'docente', 'student'] as const
type Role = typeof VALID_ROLES[number]

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')    return json({ error: 'method_not_allowed' }, 405)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return json({ error: 'Demasiados intentos. Espera un minuto.' }, 429)
  }

  // 1) Extraer JWT del caller
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
  const anonKey         = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!serviceRoleKey) {
    console.error('[admin-create-user] SUPABASE_SERVICE_ROLE_KEY no configurado')
    return json({ error: 'server_misconfigured' }, 500)
  }

  // 2) Validar token y obtener identidad del caller
  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token)
  if (authError || !caller) return json({ error: 'invalid_session' }, 401)

  // 3) Verificar que el caller es admin
  const supabaseService = createClient(supabaseUrl, serviceRoleKey)
  const { data: profile, error: profileError } = await supabaseService
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    return json({ error: 'forbidden_admin_only' }, 403)
  }

  // 4) Parsear body
  let body: { email?: string; password?: string; name?: string; role?: Role }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const email    = typeof body.email    === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const name     = typeof body.name     === 'string' ? body.name.trim() : ''
  const role     = (typeof body.role    === 'string' ? body.role : null) as Role | null

  if (!email || !isValidEmail(email)) return json({ error: 'invalid_email' }, 400)
  if (!password || password.length < 8) return json({ error: 'password_too_short' }, 400)
  if (!name || name.length < 2 || name.length > 80) return json({ error: 'invalid_name' }, 400)
  if (!role || !VALID_ROLES.includes(role)) return json({ error: 'invalid_role' }, 400)

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
      return json({ error: 'email_already_exists' }, 409)
    }
    console.error('[admin-create-user] createUser error:', msg)
    return json({ error: msg }, 500)
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
    return json({
      ok:    true,
      user:  { id: newUserId, email, name, role: 'student' },
      warning: `Usuario creado pero el rol quedó como 'student'. Actualízalo manualmente. Causa: ${updateError.message}`,
    })
  }

  return json({
    ok:   true,
    user: { id: newUserId, email, name, role },
  })
})
