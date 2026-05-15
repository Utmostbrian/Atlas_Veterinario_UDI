import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const AUTH_ERROR_MESSAGES = {
  'Invalid login credentials':        'Correo o contraseña incorrectos.',
  'Email not confirmed':              'Verifica tu correo antes de iniciar sesión.',
  'Too many requests':                'Demasiados intentos. Espera un momento e intenta de nuevo.',
  'User already registered':          'Este correo ya está registrado.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
}

function friendlyError(message) {
  return AUTH_ERROR_MESSAGES[message] ?? message
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restaurar sesión existente (JWT en localStorage gestionado por Supabase)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user)
      else setLoading(false)
    })

    // Escuchar cambios de estado de autenticación
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

      if (error && error.code !== 'PGRST116') throw error

      setUser({
        id:             authUser.id,
        email:          authUser.email,
        name:           profile?.name ?? authUser.email.split('@')[0],
        role:           profile?.role ?? 'student',
        licenseNumber:  profile?.license_number ?? null,
        institution:    profile?.institution ?? 'UDI',
      })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const login = useCallback(async (email, password) => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      return { ok: false, error: friendlyError(error.message) }
    }
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
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
    <AuthContext.Provider value={{ user, login, logout, updateProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
