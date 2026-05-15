import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) await loadProfile(session.user)
        else { setUser(null); setLoading(false) }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(authUser) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.warn('[Auth] Profile fetch warning:', error.message)
      }

      const storedStudentName = localStorage.getItem('vet_student_name')
      setUser({
        id:            authUser.id,
        email:         authUser.email,
        name:          storedStudentName ?? profile?.name ?? authUser.email.split('@')[0],
        role:          profile?.role ?? 'student',
        licenseNumber: profile?.license_number ?? null,
        institution:   profile?.institution ?? 'UDI',
      })
    } catch (e) {
      console.warn('[Auth] Profile fetch failed, using auth defaults:', e?.message)
      setUser({
        id:            authUser.id,
        email:         authUser.email,
        name:          authUser.email.split('@')[0],
        role:          'student',
        licenseNumber: null,
        institution:   'UDI',
      })
    } finally {
      setLoading(false)
    }
  }

  // Admin login — does NOT touch global loading so the modal stays mounted
  const login = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: friendlyError(error.message) }
    return { ok: true }
    // onAuthStateChange fires → loadProfile → setUser + setLoading(false)
  }, [])

  // Student login via secure Edge Function (class code validated server-side)
  const loginStudent = useCallback(async (name, classCode) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/student-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ name: name.trim(), classCode: classCode.trim() }),
        }
      )

      const data = await response.json()
      if (!response.ok) return { ok: false, error: data.error ?? 'Error al iniciar sesión.' }

      // Store name BEFORE setSession so loadProfile picks it up
      localStorage.setItem('vet_student_name', data.studentName)

      const { error: sessionError } = await supabase.auth.setSession({
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
      })

      if (sessionError) {
        localStorage.removeItem('vet_student_name')
        return { ok: false, error: 'Error al establecer sesión.' }
      }

      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión. Verifica tu internet.' }
    }
  }, [])

  const logout = useCallback(async () => {
    localStorage.removeItem('vet_student_name')
    await supabase.auth.signOut()
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

    if (!error) setUser(prev => prev ? { ...prev, ...updates } : prev)
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
