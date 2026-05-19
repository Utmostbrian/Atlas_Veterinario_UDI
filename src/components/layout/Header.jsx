import { useState } from 'react'
import { TABS } from '../../data/tabs'
import { useAuth } from '../../context/AuthContext'
import ProfileMenu, { Avatar } from './ProfileMenu'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'
import { MenuIcon, CloseIcon, SunIcon, MoonIcon } from '../../Icons/Icons'

const ROLE_LABEL_SHORT = {
  admin:   'Admin',
  docente: 'Docente',
  student: 'Estudiante',
}

export default function Header({ onTabChange, darkMode, onToggleDark, onOpenLogin }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen]   = useState(false)
  const roleBadge = ROLE_LABEL_SHORT[user?.role] ?? 'Estudiante'

  const visibleTabs = user
    ? TABS.filter(tab => tab.roles.includes(user.role))
    : TABS.filter(tab => tab.roles.includes('student'))

  return (
    <>
      <header>
        <div className="htop">
          Universidad para el Desarrollo y la Innovación · Sede Santa Cruz · 2026
        </div>

        <div className="hmain">
          {/* Logo */}
          <div className="hlogo">
            <img src={udiLogo} alt="UDI" />
          </div>

          {/* Title */}
          <div className="htext">
            <h1>Atlas Farmacológico Veterinario</h1>
            <p>Guía de referencia clínica con IA · UDI 2026</p>
            <span className="badge">Carrera de Veterinaria</span>
          </div>

          {/* Desktop utility nav */}
          <nav className="hnav">
            <button onClick={onToggleDark} title="Cambiar tema" style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
              {darkMode ? <><SunIcon size={14} /> Claro</> : <><MoonIcon size={14} /> Oscuro</>}
            </button>
          </nav>

          {/* Perfil autenticado o botón de login */}
          {user ? (
            <ProfileMenu />
          ) : (
            <LoginButton onClick={onOpenLogin} />
          )}

          {/* Mobile hamburger */}
          <button className="hburger" onClick={() => setMenuOpen(v => !v)} aria-label="Menú">
            {menuOpen ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile overlay menu */}
      <div className={`mobnav ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
        <div className="mobpanel" onClick={e => e.stopPropagation()}>

          {/* Info de usuario o botón de login */}
          <div style={{
            padding: '4px 14px 14px',
            borderBottom: '1px solid rgba(255,255,255,.15)',
            marginBottom: 8,
          }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar user={user} size={40} />
                <div>
                  <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#fff' }}>
                    {user.name}
                  </div>
                  <span style={{
                    background: 'rgba(255,255,255,.2)', fontSize: '.62rem', padding: '1px 6px',
                    borderRadius: 3, fontWeight: 700, textTransform: 'uppercase',
                    color: 'rgba(255,255,255,.9)',
                  }}>
                    {roleBadge}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); onOpenLogin() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 14px',
                  background: '#CC0000', color: '#fff',
                  border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: '.88rem',
                  fontFamily: 'Source Sans 3, sans-serif',
                  cursor: 'pointer',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Iniciar sesión
              </button>
            )}
          </div>

          {visibleTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { onTabChange(id); setMenuOpen(false) }}
            >
              <Icon size={17} style={{ marginRight: 8, verticalAlign: 'middle', opacity: .85 }} />
              {label}
            </button>
          ))}

          <button onClick={() => { onToggleDark(); setMenuOpen(false) }} style={{ display:'flex', alignItems:'center', gap:6 }}>
            {darkMode ? <><SunIcon size={16} /> Modo claro</> : <><MoonIcon size={16} /> Modo oscuro</>}
          </button>

          {user && (
            <button
              onClick={() => { setMenuOpen(false); logout() }}
              style={{ color: 'rgba(255,200,200,.9)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="17" height="17"
                style={{ marginRight: 8, verticalAlign: 'middle', opacity: .85 }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Cerrar sesión
            </button>
          )}

          <button className="mobclose" onClick={() => setMenuOpen(false)} style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
            <CloseIcon size={15} /> Cerrar menú
          </button>
        </div>
      </div>
    </>
  )
}

function LoginButton({ onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 15px',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,.35)',
        background: hover ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.1)',
        color: '#fff',
        fontWeight: 700,
        fontSize: '.82rem',
        cursor: 'pointer',
        transition: 'background .2s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      Iniciar sesión
    </button>
  )
}
