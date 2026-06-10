import { useNavigate } from 'react-router-dom'
import Header from './Header'
import TabBar  from './TabBar'
import { useAuth } from '../../context/AuthContext'
import { TABS } from '../../data/tabs'
import { SunIcon, MoonIcon } from '../../Icons/Icons'

// Navegación lateral editorial (estilo prototipo AV): nombre corto + subtítulo + código.
// El icono y el rol se toman de TABS; el orden y los códigos definen la numeración 01–09.
const SIDEBAR_NAV = [
  { id: 'atlas',  name: 'Atlas',         sub: 'Fármacos · Especialidades',   code: '01' },
  { id: 'calc',   name: 'Calculadora',   sub: 'Dosis por peso',              code: '02' },
  { id: 'dil',    name: 'Dilución',      sub: 'Goteo · Infusión',            code: '03' },
  { id: 'inter',  name: 'Interacciones', sub: 'Seguridad por combinación',   code: '04' },
  { id: 'enf',    name: 'Protocolos',    sub: 'Enfermedades y especie',      code: '05' },
  { id: 'glos',   name: 'Glosario',      sub: 'Términos farmacológicos',     code: '06' },
  { id: 'receta', name: 'Recetas',       sub: 'Generador profesional',       code: '07' },
  { id: 'dashboard/recetas/historial', name: 'Historial', sub: 'Recetas previas', code: '08' },
  { id: 'audit',  name: 'Auditoría',     sub: 'Uso · Roles · Riesgo',        code: '09' },
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

  return (
    <>
      <div className="app-shell">
        {/* ── Desktop sidebar (editorial AV) ── */}
        <aside className="app-sidebar">
          {/* Brand */}
          <div className="asb-brand">
            <span className="asb-logo">AV</span>
            <div className="asb-brand-sub">Atlas Farmacológico<br />Veterinario</div>
          </div>

          {/* Nav */}
          <nav className="asb-nav" aria-label="Navegación principal">
            {SIDEBAR_NAV.map(({ id, name, sub, code }) => {
              const tab = visibleTabs.find(t => t.id === id)
              if (!tab) return null
              const Icon = tab.Icon
              const on = activeTab === id
              return (
                <button
                  key={id}
                  className={`asb-item${on ? ' on' : ''}`}
                  onClick={() => handleNav(id)}
                  aria-current={on ? 'page' : undefined}
                >
                  <span className="asb-item-ico"><Icon size={18} /></span>
                  <span className="asb-item-txt">
                    <span className="asb-item-name">{name}</span>
                    <span className="asb-item-sub">{sub}</span>
                  </span>
                  <span className="asb-item-code">{code}</span>
                </button>
              )
            })}
          </nav>

          {/* Footer — aviso clínico + tema */}
          <div className="asb-foot">
            <div className="asb-aviso">
              <span className="asb-aviso-kicker">Aviso</span>
              <p>Atlas es una herramienta educativa y de apoyo. No reemplaza el criterio del veterinario profesional.</p>
            </div>
            <button className="asb-foot-btn" onClick={onToggleDark}>
              {darkMode
                ? <><SunIcon size={14} /><span>Modo claro</span></>
                : <><MoonIcon size={14} /><span>Modo oscuro</span></>}
            </button>
            <div className="asb-meta"><span>AV · 2026</span><span>v1.1.0</span></div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="app-main">
          <Header
            onTabChange={onTabChange}
            darkMode={darkMode}
            onToggleDark={onToggleDark}
            onOpenLogin={onOpenLogin}
          />
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
            <h3>Atlas Farmacológico Veterinario · AV</h3>
            <p>
              Atlas AV — herramienta de referencia farmacológica veterinaria orientada a la
              formación y la práctica clínica. Información de apoyo académico, sobria y verificable.
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
