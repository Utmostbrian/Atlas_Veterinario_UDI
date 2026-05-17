import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cleanEnv } from '../lib/envUtils'

const AuthContext = createContext(null)

const AUTH_ERROR_MESSAGES = {
  'Invalid login credentials':                   'Correo o contraseña incorrectos.',
  'Email not confirmed':                         'Verifica tu correo antes de iniciar sesión.',
  'Too many requests':                           'Demasiados intentos. Espera un momento e intenta de nuevo.',
  'User already registered':                     'Este correo ya está registrado.',
  'Password should be at least 6 characters':   'La contraseña debe tener al menos 6 caracteres.',
}

function friendlyError(message) {
  return AUTH_ERROR_MESSAGES[message] ?? message
}

const ANON_KEY_CLEAN   = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)
const PROXY_BASE_CLEAN = cleanEnv(import.meta.env.VITE_SUPABASE_URL)

function withTimeout(promise, ms, msg = 'Tiempo de espera agotado. Intenta de nuevo.') {
  const timer = new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  return Promise.race([promise, timer])
}

// ── Caché de rol por sesión de pestaña ───────────────────────────────────────
// Guarda {userId, role} en sessionStorage — sobrevive recargas de página dentro
// de la misma pestaña pero se limpia al cerrar el navegador.
const ROLE_CACHE_KEY = 'vet_role_cache'

function getCachedRole(userId) {
  try {
    const raw = sessionStorage.getItem(ROLE_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    return cached?.userId === userId ? cached.role : null
  } catch {
    return null
  }
}

function setCachedRole(userId, role) {
  try { sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role })) } catch { /* ignore */ }
}

function clearRoleCache() {
  try { sessionStorage.removeItem(ROLE_CACHE_KEY) } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  // Evita que getSession() y onAuthStateChange llamen loadProfile simultáneamente
  const profileLock = useRef(false)

  // Backstop absoluto: jamás colgar en loading más de 8 s
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 8000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) loadProfile(session.user)
        else setLoading(false)
      })
      .catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) await loadProfile(session.user)
        else {
          clearRoleCache()
          setUser(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(authUser) {
    // Bug 3 fix: deduplicar llamadas concurrentes (getSession + onAuthStateChange)
    if (profileLock.current) return
    profileLock.current = true

    try {
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      // Bug 4 fix: timeout 10 s (era 6 s — insuficiente para cold-start de Supabase)
      const { data: profile } = await withTimeout(query, 10000)

      const role = profile?.role ?? authUser.user_metadata?.role ?? 'student'

      // Bug 5 fix: guardar el rol verificado en caché de sesión
      setCachedRole(authUser.id, role)

      // Bug 2 fix: vet_student_name solo aplica a estudiantes; limpiar si es admin
      const storedStudentName = localStorage.getItem('vet_student_name')
      if (role !== 'student' && storedStudentName) {
        localStorage.removeItem('vet_student_name')
      }

      setUser({
        id:            authUser.id,
        email:         authUser.email,
        name:          (role === 'student' ? storedStudentName : null)
                        ?? profile?.name
                        ?? authUser.email?.split('@')[0]
                        ?? authUser.id,
        role,
        licenseNumber: profile?.license_number ?? null,
        institution:   profile?.institution ?? 'UDI',
      })
    } catch {
      // Bug 1 fix: no asumir 'student' si la query falla.
      // Orden de confianza: caché de sesión > user_metadata del JWT > 'student'
      const fallbackRole = getCachedRole(authUser.id)
                        ?? authUser.user_metadata?.role
                        ?? 'student'

      setUser({
        id:            authUser.id,
        email:         authUser.email,
        name:          authUser.email?.split('@')[0] ?? authUser.id,
        role:          fallbackRole,
        licenseNumber: null,
        institution:   'UDI',
      })
    } finally {
      setLoading(false)
      profileLock.current = false
    }
  }

  const login = useCallback(async (email, password) => {
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        10000
      )
      if (error) return { ok: false, error: friendlyError(error.message) }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message ?? 'Error de conexión. Verifica tu internet.' }
    }
  }, [])

  const loginStudent = useCallback(async (name, classCode) => {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(
        `${PROXY_BASE_CLEAN}/functions/v1/student-login`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${ANON_KEY_CLEAN}`,
          },
          body:   JSON.stringify({ name: name.trim(), classCode: classCode.trim() }),
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      const data = await response.json()
      if (!response.ok) return { ok: false, error: data.error ?? 'Error al iniciar sesión.' }

      localStorage.setItem('vet_student_name', data.studentName)

      const { error: sessionError } = await withTimeout(
        supabase.auth.setSession({
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
        8000
      )

      if (sessionError) {
        localStorage.removeItem('vet_student_name')
        return { ok: false, error: 'Error al establecer sesión.' }
      }
      return { ok: true }
    } catch (e) {
      clearTimeout(timeoutId)
      const msg = e?.name === 'AbortError'
        ? 'La solicitud tardó demasiado. Verifica tu internet.'
        : 'Error de conexión. Verifica tu internet.'
      return { ok: false, error: msg }
    }
  }, [])

  const logout = useCallback(async () => {
    localStorage.removeItem('vet_student_name')
    clearRoleCache()
    setUser(null)
    setLoading(false)
    try { await supabase.auth.signOut() } catch { /* ignore */ }
  }, [])

  const updateProfile = useCallback(async (updates) => {
    if (!user?.id) return
    const dbUpdates = {}
    if (updates.name)          dbUpdates.name           = updates.name
    if (updates.licenseNumber) dbUpdates.license_number = updates.licenseNumber
    if (updates.institution)   dbUpdates.institution    = updates.institution

    const { error } = await supabase
      .from('profiles')
      .update(dbUpdates)
      .eq('id', user.id)

    if (!error) {
      setUser(prev => {
        if (!prev) return prev
        const next = { ...prev, ...updates }
        setCachedRole(prev.id, next.role)
        return next
      })
    }
  }, [user?.id])

  return (
    <AuthContext.Provider value={{ user, login, loginStudent, logout, updateProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
