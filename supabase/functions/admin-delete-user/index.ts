import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCors, json } from '../_shared/cors.ts'

const CORS_METHODS = 'DELETE, OPTIONS'

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 10
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
  if (req.method !== 'DELETE')  return json(req, { error: 'method_not_allowed' }, 405, CORS_METHODS)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return json(req, { error: 'Demasiados intentos. Espera un minuto.' }, 429, CORS_METHODS)
  }

  // 1) Extraer JWT del caller
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(req, { error: 'unauthorized' }, 401, CORS_METHODS)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!serviceRoleKey) {
    console.error('[admin-delete-user] SUPABASE_SERVICE_ROLE_KEY no configurado')
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
  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_json' }, 400, CORS_METHODS)
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : null
  if (!userId) return json(req, { error: 'missing_user_id' }, 400, CORS_METHODS)

  // 5) Prevenir auto-borrado
  if (userId === caller.id) {
    return json(req, { error: 'cannot_delete_self' }, 400, CORS_METHODS)
  }

  // 6) Borrar usuario — Admin API, cascada a profiles por FK
  const { error: deleteError } = await supabaseService.auth.admin.deleteUser(userId)

  if (deleteError) {
    console.error('[admin-delete-user] deleteUser error:', deleteError.message)
    if (deleteError.message?.toLowerCase().includes('not found')) {
      return json(req, { error: 'user_not_found' }, 404, CORS_METHODS)
    }
    return json(req, { error: deleteError.message }, 500, CORS_METHODS)
  }

  return json(req, { ok: true }, 200, CORS_METHODS)
})
