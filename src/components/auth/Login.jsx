import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'
import styles from './Login.module.css'

const EyeOpen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

export default function LoginModal({ onClose }) {
  const { login, loginStudent } = useAuth()

  const [mode,     setMode]    = useState('admin')  // 'admin' | 'student'
  const [email,    setEmail]   = useState('')
  const [password, setPassword]= useState('')
  const [name,     setName]    = useState('')
  const [code,     setCode]    = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]   = useState('')
  const [busy,     setBusy]    = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function switchMode(m) { setMode(m); setError(''); setShowPass(false) }

  async function handleAdminSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (result.ok) {
        // onAuthStateChange → loadProfile → App.jsx useEffect closes modal
        // setBusy stays true until modal unmounts; reset defensively on timeout
        setTimeout(() => setBusy(false), 5000)
      } else {
        setError(result.error)
        setBusy(false)
      }
    } catch {
      setError('Error inesperado. Intenta de nuevo.')
      setBusy(false)
    }
  }

  async function handleStudentSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await loginStudent(name.trim(), code.trim())
      if (result.ok) {
        setTimeout(() => setBusy(false), 5000)
      } else {
        setError(result.error)
        setBusy(false)
      }
    } catch {
      setError('Error inesperado. Intenta de nuevo.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>

        <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className={styles.cardHead}>
          <img src={udiLogo} alt="UDI" className={styles.logo} />
          <div className={styles.cardHeadText}>
            <h1 className={styles.title}>Atlas Farmacológico Veterinario</h1>
            <p className={styles.subtitle}>Guía de referencia clínica con IA · UDI 2026</p>
            <span className={styles.badge}>Carrera de Veterinaria</span>
          </div>
        </div>

        {/* Role toggle */}
        <div className={styles.roleToggle}>
          <button
            type="button"
            className={`${styles.roleBtn} ${mode === 'admin' ? styles.roleBtnActive : ''}`}
            onClick={() => switchMode('admin')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Administrador
          </button>
          <button
            type="button"
            className={`${styles.roleBtn} ${mode === 'student' ? styles.roleBtnActive : ''}`}
            onClick={() => switchMode('student')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            Estudiante
          </button>
        </div>

        {/* ── Admin form ── */}
        {mode === 'admin' && (
          <form onSubmit={handleAdminSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="lm-email">
                Correo electrónico institucional
              </label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" width="16" height="16">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="lm-email" type="email" className={styles.input}
                  placeholder="admin@udi.edu.bo"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email" autoFocus required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="lm-pass">Contraseña</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" width="16" height="16">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="lm-pass" type={showPass ? 'text' : 'password'} className={styles.input}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password" required
                />
                <button type="button" className={styles.eyeBtn}
                  onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPass ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
            </div>

            {error && (
              <div className={styles.error} role="alert">
                <AlertIcon />{error}
              </div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={busy}>
              {busy
                ? <span className={styles.spinnerWrap}><span className={styles.spinner} />Verificando...</span>
                : 'Iniciar sesión'}
            </button>
          </form>
        )}

        {/* ── Student form ── */}
        {mode === 'student' && (
          <form onSubmit={handleStudentSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="lm-name">Tu nombre completo</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" width="16" height="16">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="lm-name" type="text" className={styles.input}
                  placeholder="Nombre Apellido"
                  value={name}
                  onChange={e => { setName(e.target.value); setError('') }}
                  autoComplete="name" autoFocus required minLength={2}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="lm-code">Código de clase</label>
              <div className={styles.inputWrap}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  strokeLinejoin="round" width="16" height="16">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="lm-code" type={showPass ? 'text' : 'password'} className={styles.input}
                  placeholder="••••••••"
                  value={code}
                  onChange={e => { setCode(e.target.value); setError('') }}
                  autoComplete="off" required
                />
                <button type="button" className={styles.eyeBtn}
                  onClick={() => setShowPass(v => !v)} tabIndex={-1}
                  aria-label={showPass ? 'Ocultar código' : 'Mostrar código'}>
                  {showPass ? <EyeOff /> : <EyeOpen />}
                </button>
              </div>
            </div>

            {error && (
              <div className={styles.error} role="alert">
                <AlertIcon />{error}
              </div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={busy}>
              {busy
                ? <span className={styles.spinnerWrap}><span className={styles.spinner} />Verificando...</span>
                : 'Entrar como Estudiante'}
            </button>
          </form>
        )}

        <p className={styles.hint}>
          {mode === 'admin'
            ? 'Acceso con correo institucional. Contacta al administrador si no tienes cuenta.'
            : 'Usa tu nombre real y el código de clase proporcionado por tu docente.'}
        </p>
      </div>
    </div>
  )
}
