import { useState, lazy, Suspense, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import MainLayout from './components/layout/MainLayout'
import AIChatFloating from './components/chat/AIChatFloating'
import LoginModal from './components/auth/Login'
import { useLocalStorage } from './hooks/useLocalStorage'

const DrugGrid           = lazy(() => import('./components/atlas/DrugGrid'))
const DosageCalculator   = lazy(() => import('./components/calculator/DosageCalculator'))
const DilutionCalculator = lazy(() => import('./components/calculator/DilutionCalculator'))
const InteractionChecker = lazy(() => import('./components/interactions/InteractionChecker'))
const DiseaseProtocols   = lazy(() => import('./components/diseases/DiseaseProtocols'))
const Glossary           = lazy(() => import('./components/glossary/Glossary'))
const ConsultationHistory= lazy(() => import('./components/audit/ConsultationHistory'))
const Prescription       = lazy(() => import('./components/prescription/Prescription'))

// Estas pestañas son completamente libres — sin sesión requerida
const FREE_TABS = new Set(['calc', 'glos', 'dil'])

function TabLoader() {
  return (
    <div className="ld" style={{ padding: '64px 20px' }}>
      <div className="sp" />
      <p>Cargando...</p>
    </div>
  )
}

function AuthLoader() {
  return (
    <div className="ld" style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="sp" />
      <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.9rem' }}>Restaurando sesión...</p>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const activeTab  = location.pathname.slice(1) || 'atlas'
  const setActiveTab = (tab) => navigate(`/${tab}`)
  const [chatOpen,  setChatOpen]  = useState(false)
  const [darkMode,  setDarkMode]  = useLocalStorage('vet_dark_mode', false)
  const [loginOpen, setLoginOpen] = useState(false)

  // N11: limpiamos restos de la API key del localStorage (feature retirada).
  // El proxy con JWT cubre el caso de uso; admin ya no necesita guardar key.
  useEffect(() => {
    try { localStorage.removeItem('vet_atlas_api_key') } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', Boolean(darkMode))
  }, [darkMode])

  // Cierra el modal al iniciar sesión exitosamente
  useEffect(() => {
    if (user && loginOpen) setLoginOpen(false)
  }, [user, loginOpen])

  // Redirige al estudiante si queda en un tab restringido
  useEffect(() => {
    if (user?.role === 'student' && activeTab === 'audit') navigate('/atlas')
  }, [user, activeTab, navigate])

  // Mientras Supabase restaura la sesión, mostrar pantalla de carga
  if (loading) return <AuthLoader />

  function openLogin() { setLoginOpen(true) }

  // ¿El tab actual requiere autenticación para interactuar?
  const gated = !user && !FREE_TABS.has(activeTab)
  // El atlas permite buscar y filtrar sin sesión; solo bloquea al abrir una tarjeta
  const overlayGated = gated && activeTab !== 'atlas'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <MainLayout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(v => !v)}
        onOpenLogin={openLogin}
      >
        <div style={{ position: 'relative' }}>
          <Suspense fallback={<TabLoader />}>
            {activeTab === 'atlas'  && <DrugGrid onChatOpen={user ? setChatOpen : undefined} onLoginRequired={!user ? openLogin : undefined} />}
            {activeTab === 'calc'   && <DosageCalculator onLoginRequired={!user ? openLogin : undefined} />}
            {activeTab === 'dil'    && <DilutionCalculator />}
            {activeTab === 'inter'  && <InteractionChecker />}
            {activeTab === 'enf'    && <DiseaseProtocols />}
            {activeTab === 'glos'   && <Glossary />}
            {activeTab === 'receta' && <Prescription />}
            {activeTab === 'audit'  && user?.role === 'admin' && <ConsultationHistory />}
          </Suspense>

          {/* Capa invisible que intercepta clics solo en tabs completamente restringidos */}
          {overlayGated && (
            <div
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, zIndex: 10 }}
              onClick={openLogin}
            />
          )}
        </div>
      </MainLayout>

      {/* Badge flotante — solo visible en tabs que requieren sesión */}
      {gated && (
        <button
          onClick={openLogin}
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 22px',
            background: 'rgba(10, 18, 32, 0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,.18)',
            borderRadius: 26,
            color: '#fff',
            fontSize: '.84rem',
            fontWeight: 600,
            fontFamily: 'Source Sans 3, sans-serif',
            cursor: 'pointer',
            boxShadow: '0 4px 28px rgba(0,0,0,.45)',
            whiteSpace: 'nowrap',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Inicia sesión para usar esta herramienta
        </button>
      )}

      {/* Chat IA — FAB visible para todos; gate screen si no hay sesión activa */}
      <AIChatFloating
        open={chatOpen}
        onToggle={() => setChatOpen(v => !v)}
        onOpenLogin={openLogin}
      />

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
