import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', padding: '2rem',
      textAlign: 'center', fontFamily: 'Source Sans 3, sans-serif',
    }}>
      <div style={{
        fontFamily: 'Playfair Display, serif',
        fontSize: '5rem', fontWeight: 800,
        color: 'var(--blue, #CC0000)', marginBottom: '0.5rem', lineHeight: 1,
      }}>404</div>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.5rem', color: 'var(--dark, #1a2535)', marginBottom: '0.75rem' }}>
        Página no encontrada
      </h2>
      <p style={{ color: 'var(--soft, #6b7280)', maxWidth: 420, lineHeight: 1.6, marginBottom: '1.5rem' }}>
        La sección que intentas abrir no existe o fue movida. Vuelve al Atlas Farmacológico para continuar.
      </p>
      <button
        onClick={() => navigate('/atlas')}
        style={{
          padding: '10px 28px', background: 'var(--blue, #CC0000)', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: '.9rem',
          fontWeight: 700, cursor: 'pointer',
        }}
      >
        Ir al Atlas
      </button>
    </div>
  )
}
