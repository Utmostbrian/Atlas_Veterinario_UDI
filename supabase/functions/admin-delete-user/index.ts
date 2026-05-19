import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

const cors = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN.split(',')[0]?.trim() ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'DELETE')  return json({ error: 'method_not_allowed' }, 405)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return json({ error: 'Demasiados intentos. Espera un minuto.' }, 429)
  }

  // 1) Extraer JWT del caller
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'unauthorized' }, 401)

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!serviceRoleKey) {
    console.error('[admin-delete-user] SUPABASE_SERVICE_ROLE_KEY no configurado')
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
  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const userId = body.userId?.trim()
  if (!userId) return json({ error: 'missing_user_id' }, 400)

  // 5) Prevenir auto-borrado
  if (userId === caller.id) {
    return json({ error: 'cannot_delete_self' }, 400)
  }

  // 6) Borrar usuario — Admin API, cascada a profiles por FK
  const { error: deleteError } = await supabaseService.auth.admin.deleteUser(userId)

  if (deleteError) {
    console.error('[admin-delete-user] deleteUser error:', deleteError.message)
    if (deleteError.message?.toLowerCase().includes('not found')) {
      return json({ error: 'user_not_found' }, 404)
    }
    return json({ error: deleteError.message }, 500)
  }

  return json({ ok: true })
})
