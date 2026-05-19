import { useState, lazy, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import MainLayout from './components/layout/MainLayout'
import AIChatFloating from './components/chat/AIChatFloating'
import LoginModal from './components/auth/Login'
import LazyBoundary from './components/LazyBoundary'
import NotFound from './components/NotFound'
import { useLocalStorage } from './hooks/useLocalStorage'

const DrugGrid           = lazy(() => import('./components/atlas/DrugGrid'))
const DosageCalculator   = lazy(() => import('./components/calculator/DosageCalculator'))
const DilutionCalculator = lazy(() => import('./components/calculator/DilutionCalculator'))
const InteractionChecker = lazy(() => import('./components/interactions/InteractionChecker'))
const DiseaseProtocols   = lazy(() => import('./components/diseases/DiseaseProtocols'))
const Glossary           = lazy(() => import('./components/glossary/Glossary'))
const AdminDashboard     = lazy(() => import('./components/admin/AdminDashboard'))
const Prescription       = lazy(() => import('./components/prescription/Prescription'))

// Tabs que no requieren sesión para interactuar
const FREE_TABS = new Set(['calc', 'glos', 'dil'])
// Tabs válidos — todo lo demás cae en NotFound
const VALID_TABS = new Set(['atlas', 'calc', 'dil', 'inter', 'enf', 'glos', 'receta', 'audit'])

function TabLoader() {
  return (
    <div className="ld" style={{ padding: '64px 20px' }} aria-busy="true" aria-live="polite">
      <div className="sp" />
      <p>Cargando...</p>
    </div>
  )
}

function AuthLoader() {
  return (
    <div className="ld"
      style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}
      aria-busy="true" aria-live="polite">
      <div className="sp" />
      <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.9rem' }}>Restaurando sesión...</p>
    </div>
  )
}

function AppContent() {
  const { user, loading, isElevated } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const activeTab  = location.pathname.slice(1) || 'atlas'
  const setActiveTab = (tab) => navigate(`/${tab}`)
  const [chatOpen,  setChatOpen]  = useState(false)
  // F12: prefers-color-scheme como default; luego respeta la preferencia del usuario
  const systemDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const [darkMode,  setDarkMode]  = useLocalStorage('vet_dark_mode', systemDark)
  const [loginOpen, setLoginOpen] = useState(false)
  // Hint de "Inicia sesión" se oculta al primer scroll/click/tap del usuario
  // y no vuelve a aparecer en la sesión de la pestaña (sessionStorage).
  const [loginHintDismissed, setLoginHintDismissed] = useState(() => {
    try { return sessionStorage.getItem('vet_login_hint_dismissed') === '1' }
    catch { return false }
  })

  // Limpieza one-shot de la API key obsoleta del localStorage
  useEffect(() => {
    try { localStorage.removeItem('vet_atlas_api_key') } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', Boolean(darkMode))
  }, [darkMode])

  // Cierra el modal al iniciar sesión
  useEffect(() => {
    if (user && loginOpen) setLoginOpen(false)
  }, [user, loginOpen])

  // Redirige a quien no tenga acceso elevado si queda en un tab restringido
  useEffect(() => {
    if (user && !isElevated && activeTab === 'audit') navigate('/atlas')
  }, [user, isElevated, activeTab, navigate])

  // Auto-dismiss del hint de login al primer scroll, click o tecla.
  // Una vez descartado, no vuelve a aparecer durante la sesión.
  useEffect(() => {
    if (loginHintDismissed) return
    function dismiss() {
      setLoginHintDismissed(true)
      try { sessionStorage.setItem('vet_login_hint_dismissed', '1') } catch { /* ignore */ }
    }
    const opts = { once: true, passive: true }
    window.addEventListener('scroll',      dismiss, opts)
    window.addEventListener('pointerdown', dismiss, opts)
    window.addEventListener('keydown',     dismiss, opts)
    window.addEventListener('touchstart',  dismiss, opts)
    return () => {
      window.removeEventListener('scroll',      dismiss)
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown',     dismiss)
      window.removeEventListener('touchstart',  dismiss)
    }
  }, [loginHintDismissed])

  if (loading) return <AuthLoader />

  function openLogin() { setLoginOpen(true) }

  const isValidTab  = VALID_TABS.has(activeTab)
  const gated       = isValidTab && !user && !FREE_TABS.has(activeTab)
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
          {/* F4 + F5: NotFound para rutas inválidas; cada tab con su Suspense+ErrorBoundary */}
          {!isValidTab ? (
            <NotFound />
          ) : (
            <LazyBoundary fallback={<TabLoader />}>
              {activeTab === 'atlas'  && <DrugGrid onChatOpen={user ? setChatOpen : undefined} onLoginRequired={!user ? openLogin : undefined} />}
              {activeTab === 'calc'   && <DosageCalculator onLoginRequired={!user ? openLogin : undefined} />}
              {activeTab === 'dil'    && <DilutionCalculator />}
              {activeTab === 'inter'  && <InteractionChecker />}
              {activeTab === 'enf'    && <DiseaseProtocols onLoginRequired={!user ? openLogin : undefined} />}
              {activeTab === 'glos'   && <Glossary />}
              {activeTab === 'receta' && <Prescription />}
              {activeTab === 'audit'  && isElevated && <AdminDashboard />}
            </LazyBoundary>
          )}

          {/* Capa invisible que intercepta clics en tabs restringidos */}
          {overlayGated && (
            <div
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, zIndex: 10 }}
              onClick={openLogin}
            />
          )}
        </div>
      </MainLayout>

      {gated && !loginHintDismissed && (
        <button
          onClick={openLogin}
          aria-label="Inicia sesión para usar esta herramienta"
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
            strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Inicia sesión para usar esta herramienta
        </button>
      )}

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
