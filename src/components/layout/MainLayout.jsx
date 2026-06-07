import { useNavigate } from 'react-router-dom'
import Header from './Header'
import TabBar  from './TabBar'
import { useAuth } from '../../context/AuthContext'
import { TABS } from '../../data/tabs'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'
import { SunIcon, MoonIcon } from '../../Icons/Icons'

// Tabs visible in the sidebar (all tabs available to all students)
const SIDEBAR_GROUPS = [
  {
    label: 'Referencia',
    tabs: ['atlas', 'glos', 'enf'],
  },
  {
    label: 'Cálculo clínico',
    tabs: ['calc', 'dil', 'inter'],
  },
  {
    label: 'Herramientas',
    tabs: ['receta', 'dashboard/recetas/historial'],
  },
]

const MOB_TABS = [
  { id: 'atlas',  label: 'Atlas',       Icon: TABS.find(t => t.id === 'atlas').Icon  },
  { id: 'calc',   label: 'Calculadora', Icon: TABS.find(t => t.id === 'calc').Icon   },
  { id: 'inter',  label: 'Interacc.',   Icon: TABS.find(t => t.id === 'inter').Icon  },
  { id: 'glos',   label: 'Glosario',    Icon: TABS.find(t => t.id === 'glos').Icon   },
]

export default function MainLayout({
  activeTab,
  onTabChange,
  darkMode,
  onToggleDark,
  onOpenLogin,
  children,
}) {
  const navigate = useNavigate()
  const { user } = useAuth()

  function handleNav(id) {
    onTabChange(id)
    navigate(`/${id}`)
  }

  // Build visible tabs for sidebar based on role
  const visibleTabs = user
    ? TABS.filter(t => t.roles.includes(user.role))
    : TABS.filter(t => t.roles.includes('student'))

  const visibleIds = new Set(visibleTabs.map(t => t.id))

  return (
    <>
      <Header
        onTabChange={onTabChange}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
        onOpenLogin={onOpenLogin}
      />

      <div className="app-shell">
        {/* ── Desktop sidebar ── */}
        <aside className="app-sidebar">
          {/* Brand */}
          <div className="asb-brand">
            <img src={udiLogo} alt="UDI" />
            <div>
              <div className="asb-title">Atlas Farmacológico</div>
              <div className="asb-sub">Veterinaria · UDI 2026</div>
            </div>
          </div>

          {/* Nav */}
          <nav className="asb-nav" aria-label="Navegación principal">
            {SIDEBAR_GROUPS.map(group => {
              const groupTabs = group.tabs
                .map(id => visibleTabs.find(t => t.id === id))
                .filter(Boolean)
              if (groupTabs.length === 0) return null
              return (
                <div key={group.label}>
                  <div className="asb-sect">{group.label}</div>
                  {groupTabs.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      className={`asb-btn${activeTab === id ? ' on' : ''}`}
                      onClick={() => handleNav(id)}
                      aria-current={activeTab === id ? 'page' : undefined}
                    >
                      <span className="asb-btn-icon"><Icon size={15} /></span>
                      {label}
                    </button>
                  ))}
                  <div className="asb-divider" />
                </div>
              )
            })}

            {/* Admin-only tab */}
            {visibleIds.has('audit') && (
              <button
                className={`asb-btn${activeTab === 'audit' ? ' on' : ''}`}
                onClick={() => handleNav('audit')}
              >
                <span className="asb-btn-icon">
                  {TABS.find(t => t.id === 'audit').Icon && (
                    (() => { const I = TABS.find(t => t.id === 'audit').Icon; return <I size={15} /> })()
                  )}
                </span>
                Dashboard Admin
              </button>
            )}
          </nav>

          {/* Footer */}
          <div className="asb-foot">
            <button className="asb-foot-btn" onClick={onToggleDark}>
              {darkMode
                ? <><SunIcon size={14} /><span>Modo claro</span></>
                : <><MoonIcon size={14} /><span>Modo oscuro</span></>}
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="app-main">
          <TabBar activeTab={activeTab} onTabChange={onTabChange} />
          <main style={{ minHeight: '60vh' }}>
            {children}
          </main>
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="mobile-nav" aria-label="Navegación principal">
        {MOB_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`mnav-btn${activeTab === id ? ' on' : ''}`}
            onClick={() => handleNav(id)}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <span className="mnav-ico"><Icon size={20} /></span>
            <span className="mnav-lbl">{label}</span>
          </button>
        ))}
      </nav>

      <footer>
        <div className="fstripe" />
        <div className="fbody">
          <div className="fbrand">
            <h3>Atlas Farmacológico Veterinario</h3>
            <p>
              Herramienta docente de referencia farmacológica para la Facultad de Veterinaria
              de la Universidad UDI. Orientada a la formación clínica integral del
              médico veterinario.
            </p>
            <p style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.35)' }}>
              Dosis orientativas. Consulte siempre con un veterinario profesional antes de administrar cualquier fármaco.
            </p>
          </div>
          <div className="fcol">
            <h4>Secciones</h4>
            <ul>
              <li><button onClick={() => navigate('/atlas')} className="footer-link">Atlas Farmacológico</button></li>
              <li><button onClick={() => navigate('/calc')} className="footer-link">Calculadora de Dosis</button></li>
              <li><button onClick={() => navigate('/inter')} className="footer-link">Interacciones</button></li>
              <li><button onClick={() => navigate('/enf')} className="footer-link">Protocolos</button></li>
              <li><button onClick={() => navigate('/glos')} className="footer-link">Glosario</button></li>
            </ul>
          </div>
          <div className="fcol">
            <h4>Información</h4>
            <ul>
              <li><button onClick={() => navigate('/receta')} className="footer-link">Generador de Recetas</button></li>
              <li><button onClick={() => navigate('/audit')} className="footer-link">Historial de Consultas</button></li>
            </ul>
            <h4 style={{ marginTop: 14 }}>Aviso Legal</h4>
            <p style={{ fontSize: '.73rem', lineHeight: 1.5 }}>
              Uso exclusivo con fines académicos. No reemplaza el juicio clínico profesional.
            </p>
          </div>
        </div>
        <div className="fbot">
          <span>Atlas Farmacológico Veterinario © {new Date().getFullYear()} · Facultad de Veterinaria – UDI</span>
          <span>Dosis orientativas · Consulta siempre con un veterinario profesional</span>
        </div>
      </footer>
    </>
  )
}
