import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '2rem',
          textAlign: 'center', fontFamily: 'Source Sans 3, sans-serif', background: '#f9f5f0',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CC0000"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2 style={{ color: '#1a2535', fontFamily: 'Playfair Display, serif', marginBottom: '.5rem' }}>
            Algo salió mal
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem', maxWidth: '360px', lineHeight: 1.6 }}>
            {this.state.error?.message ?? 'Error inesperado en la aplicación.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '10px 28px', background: '#CC0000', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '.9rem',
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
