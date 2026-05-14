import { createContext, useContext, useCallback } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'AtlasVet2026'
const STUDENT_PASS = 'vet2026'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useLocalStorage('vet_atlas_session', null)

  const login = useCallback((username, password, role) => {
    if (role === 'admin') {
      if (username === ADMIN_USER && password === ADMIN_PASS) {
        setUser({ role: 'admin', name: 'Administrador' })
        return { ok: true }
      }
      return { ok: false, error: 'Usuario o contraseña incorrectos.' }
    }

    if (role === 'student') {
      const name = username.trim()
      if (name.length < 2) {
        return { ok: false, error: 'El nombre debe tener al menos 2 caracteres.' }
      }
      if (password !== STUDENT_PASS) {
        return { ok: false, error: 'Contraseña de acceso incorrecta.' }
      }
      setUser({ role: 'student', name })
      return { ok: true }
    }

    return { ok: false, error: 'Rol desconocido.' }
  }, [setUser])

  const logout = useCallback(() => setUser(null), [setUser])

  const updateProfile = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev)
  }, [setUser])

  return (
    <AuthContext.Provider value={{ user, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
