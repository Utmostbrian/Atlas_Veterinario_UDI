import { TABS } from '../../data/tabs'
import styles from './WelcomeScreen.module.css'

const publicTabs = TABS.filter(tab => tab.roles.includes('student'))

export default function WelcomeScreen({ onLogin }) {
  return (
    <div className={styles.wrap}>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" width="38" height="38">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>
        <h2 className={styles.heroTitle}>
          Bienvenido al Atlas Farmacológico Veterinario
        </h2>
        <p className={styles.heroSub}>
          Herramienta clínica de referencia con asistencia por IA para estudiantes y
          docentes de la Carrera de Veterinaria · UDI 2026
        </p>
        <button className={styles.loginBtn} onClick={onLogin}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="17" height="17">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Iniciar sesión para acceder
        </button>
      </div>

      {/* Feature grid */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Herramientas disponibles</p>
        <div className={styles.grid}>
          {publicTabs.map(({ id, label, Icon }) => (
            <button key={id} className={styles.featureCard} onClick={onLogin}>
              <div className={styles.featureIcon}>
                <Icon size={20} />
              </div>
              <span className={styles.featureLabel}>{label}</span>
              <div className={styles.featureLock}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Nota */}
      <p className={styles.notice}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" width="14" height="14"
          style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Inicia sesión con la clave de acceso proporcionada por tu docente para utilizar las herramientas.
      </p>

    </div>
  )
}
