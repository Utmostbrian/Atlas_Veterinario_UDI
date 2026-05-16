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

// BOM-clean env vars resolved once at module load
const BOM = '﻿'
const ANON_KEY_CLEAN   = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').replace(new RegExp('^' + BOM), '').trim()
const PROXY_BASE_CLEAN = (import.meta.env.VITE_SUPABASE_URL      ?? '').replace(new RegExp('^' + BOM), '').trim()

// Wraps a promise with a rejection after `ms` milliseconds
function withTimeout(promise, ms, msg = 'Tiempo de espera agotado. Intenta de nuevo.') {
  const timer = new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  return Promise.race([promise, timer])
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Absolute backstop: never hang on loading longer than 5 s
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 5000)
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
        else { setUser(null); setLoading(false) }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(authUser) {
    try {
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      const { data: profile } = await withTimeout(query, 6000)

      const storedStudentName = localStorage.getItem('vet_student_name')
      setUser({
        id:            authUser.id,
        email:         authUser.email,
        name:          storedStudentName ?? profile?.name ?? authUser.email.split('@')[0],
        role:          profile?.role ?? 'student',
        licenseNumber: profile?.license_number ?? null,
        institution:   profile?.institution ?? 'UDI',
      })
    } catch {
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