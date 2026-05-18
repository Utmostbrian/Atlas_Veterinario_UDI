import { Component, Suspense } from 'react'

// F5: ErrorBoundary local para chunks lazy. Si un chunk falla al cargar
// (típico después de un deploy mientras el usuario tiene la pestaña abierta),
// ofrece un reload en vez de romper toda la app.
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[LazyBoundary]', error?.message, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '40vh', padding: '2rem',
          textAlign: 'center', gap: 14,
        }}>
          <h3 style={{ color: 'var(--dark, #1a2535)', fontFamily: 'Playfair Display, serif' }}>
            No se pudo cargar esta sección
          </h3>
          <p style={{ color: 'var(--soft, #6b7280)', maxWidth: 380, fontSize: '.9rem' }}>
            Quizá hubo un cambio reciente en la aplicación. Recarga la página para obtener la última versión.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '9px 22px', background: 'var(--blue, #CC0000)', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function LazyBoundary({ fallback, children }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}
