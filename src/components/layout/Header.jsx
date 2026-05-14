import { useState } from 'react'
import { TABS } from '../../data/tabs'
import { useAuth } from '../../context/AuthContext'
import ProfileMenu, { Avatar } from './ProfileMenu'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'

export default function Header({ activeTab, onTabChange, darkMode, onToggleDark, apiKey, onApiKeyChange, onOpenLogin }) {
  const { user, logout } = useAuth()
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyDraft,     setKeyDraft]     = useState(apiKey || '')

  const isAdmin = user?.role === 'admin'
  const visibleTabs = user
    ? TABS.filter(tab => tab.roles.includes(user.role))
    : TABS.filter(tab => tab.roles.includes('student'))

  function saveKey(e) {
    e.preventDefault()
    onApiKeyChange(keyDraft.trim())
    setShowKeyInput(false)
  }

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
            {isAdmin && (
              <button
                onClick={() => setShowKeyInput(v => !v)}
                title="Configurar API Key de Anthropic"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" width="14" height="14"
                  style={{ marginRight: 5, verticalAlign: 'middle' }}>
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
                {apiKey ? 'API ✓' : 'API Key'}
              </button>
            )}
            <button onClick={onToggleDark} title="Cambiar tema">
              {darkMode ? '☀ Claro' : '◑ Oscuro'}
            </button>
          </nav>

          {/* Perfil autenticado o botón de login */}
          {user ? (
            <ProfileMenu />
          ) : (
            <button
              onClick={onOpenLogin}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 15px',
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,.35)',
                background: 'rgba(255,255,255,.1)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '.82rem',
                cursor: 'pointer',
                transition: 'background .2s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.1)'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Iniciar sesión
            </button>
          )}

          {/* Mobile hamburger */}
          <button className="hburger" onClick={() => setMenuOpen(v => !v)} aria-label="Menú">
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* API Key panel — solo admin */}
        {isAdmin && showKeyInput && (
          <div style={{
            borderTop: '1px solid rgba(255,255,255,.15)',
            background: 'rgba(0,0,0,.25)',
            padding: '14px 36px',
          }}>
            <form onSubmit={saveKey} style={{ maxWidth: 580, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.8)', whiteSpace: 'nowrap' }}>
                API Key Anthropic:
              </label>
              <input
                type="password"
                placeholder="sk-ant-api03-..."
                value={keyDraft}
                onChange={e => setKeyDraft(e.target.value)}
                autoFocus
                style={{
                  flex: 1, minWidth: 200, padding: '7px 12px',
                  borderRadius: 6, border: '1px solid rgba(255,255,255,.3)',
                  background: 'rgba(255,255,255,.1)', color: '#fff',
                  fontSize: '.86rem', outline: 'none',
                }}
              />
              <button type="submit" style={{
                padding: '7px 16px', background: 'var(--red)', color: '#fff',
                border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '.82rem',
              }}>Guardar</button>
              {apiKey && (
                <button type="button" style={{
                  padding: '7px 12px', background: 'rgba(255,255,255,.1)', color: '#fff',
                  border: '1px solid rgba(255,255,255,.25)', borderRadius: 6, fontSize: '.82rem',
                }} onClick={() => { onApiKeyChange(''); setKeyDraft(''); setShowKeyInput(false) }}>
                  Borrar
                </button>
              )}
            </form>
            <p style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)', marginTop: 6 }}>
              La clave se guarda solo en tu navegador (localStorage). No se envía a nuestros servidores.
            </p>
          </div>
        )}
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
                    {isAdmin ? 'Admin' : 'Estudiante'}
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

          {isAdmin && (
            <button onClick={() => { setShowKeyInput(v => !v); setMenuOpen(false) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="17" height="17"
                style={{ marginRight: 8, verticalAlign: 'middle', opacity: .85 }}>
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {apiKey ? 'API Key ✓' : 'Configurar API Key'}
            </button>
          )}

          <button onClick={() => { onToggleDark(); setMenuOpen(false) }}>
            {darkMode ? '☀ Modo claro' : '◑ Modo oscuro'}
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

          <button className="mobclose" onClick={() => setMenuOpen(false)}>
            ✕ Cerrar menú
          </button>
        </div>
      </div>
    </>
  )
}
