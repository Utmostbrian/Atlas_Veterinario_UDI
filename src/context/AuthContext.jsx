import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const AUTH_ERROR_MESSAGES = {
  'Invalid login credentials':                   'Correo o contraseña incorrectos.',
  'Email not confirmed':                         'Verifica tu correo antes de iniciar sesión.',
  'Too many requests':                           'Demasiados intentos. Espera un momento e intenta de nuevo.',
  'User already registered':                     'Este correo ya está registrado.',
  'Password should be at least 6 characters':    'La contraseña debe tener al menos 6 caracteres.',
}

function friendlyError(message) {
  return AUTH_ERROR_MESSAGES[message] ?? message
}

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
  // Evita que dos eventos de auth disparen loadProfile en paralelo.
  const profileLock = useRef(false)

  // Backstop absoluto: jamás colgar en loading más de 8 s
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 8000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // N5: usamos sólo onAuthStateChange. Supabase dispara el evento
    // 'INITIAL_SESSION' inmediatamente al suscribirse, lo que cubre el caso
    // del getSession() inicial sin la condición de carrera anterior.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await loadProfile(session.user)
        } else {
          clearRoleCache()
          setUser(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(authUser) {
    // A-05: lock atómico ANTES de cualquier await. JS single-threaded garantiza
    // que entre el check y el set no se cuela otra invocación.
    if (profileLock.current) return
    profileLock.current = true

    try {
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      const { data: profile } = await withTimeout(query, 10000)

      const role = profile?.role ?? authUser.user_metadata?.role ?? 'student'

      setCachedRole(authUser.id, role)

      // Limpieza one-shot: vet_student_name del flujo legacy de código de clase
      try { localStorage.removeItem('vet_student_name') } catch { /* ignore */ }

      setUser({
        id:            authUser.id,
        email:         authUser.email,
        name:          profile?.name
                        ?? authUser.email?.split('@')[0]
                        ?? authUser.id,
        role,
        licenseNumber: profile?.license_number ?? null,
        institution:   profile?.institution ?? 'UDI',
        // N1: persistir foto de perfil desde la DB
        photo:         profile?.photo ?? null,
      })
    } catch {
      // No asumir 'student' si la query falla.
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
        photo:         null,
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
      if (error) {
        // Registrar fallo en login_failures (best-effort, no bloquea UI)
        supabase.rpc('log_login_failure', {
          p_email:      email,
          p_reason:     error.message?.slice(0, 200) ?? 'unknown',
          p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }).catch(err => console.warn('[auth] log_login_failure falló:', err?.message ?? err))
        return { ok: false, error: friendlyError(error.message) }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message ?? 'Error de conexión. Verifica tu internet.' }
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
    if (updates.name !== undefined)          dbUpdates.name           = updates.name
    if (updates.licenseNumber !== undefined) dbUpdates.license_number = updates.licenseNumber
    if (updates.institution !== undefined)   dbUpdates.institution    = updates.institution
    // N1: persistir photo (puede ser null para borrar)
    if (updates.photo !== undefined)         dbUpdates.photo          = updates.photo

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
    return { ok: !error, error: error?.message ?? null }
  }, [user?.id])

  // Helpers de rol: admin = superusuario, docente = elevado, student = básico
  const isAdmin    = user?.role === 'admin'
  const isDocente  = user?.role === 'docente'
  const isStudent  = user?.role === 'student'
  // Acceso a herramientas elevadas (auditoría, etc.)
  const isElevated = isAdmin || isDocente

  return (
    <AuthContext.Provider value={{
      user, isAdmin, isDocente, isStudent, isElevated,
      login, logout, updateProfile, loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
