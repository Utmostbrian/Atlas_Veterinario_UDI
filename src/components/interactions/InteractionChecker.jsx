import { useState } from 'react'
import { checkInteractions } from '../../services/anthropicService'
import { ZapIcon, SparklesIcon } from '../../Icons/Icons'

export default function InteractionChecker() {
  const [input,   setInput]   = useState('')
  const [drugs,   setDrugs]   = useState([])
  const [result,  setResult]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function addDrug() {
    const name = input.trim()
    if (!name || drugs.includes(name)) return
    setDrugs(prev => [...prev, name])
    setInput('')
    setResult('')
  }

  function removeDrug(name) {
    setDrugs(prev => prev.filter(d => d !== name))
    setResult('')
  }

  async function handleCheck() {
    if (drugs.length < 2) return
    setLoading(true); setError(''); setResult('')
    try {
      const text = await checkInteractions(drugs)
      setResult(text)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addDrug() }
  }

  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ZapIcon size={20} style={{ color: 'var(--blue)' }} /> Verificador de Interacciones
        </span>
        <span className="scnt">Análisis con IA</span>
      </div>

      <div className="cgrid">
        {/* Left: input */}
        <div className="card2">
          <div className="ch">Fármacos a verificar</div>
          <div className="cb">
            <div className="iarow">
              <input
                placeholder="Nombre del fármaco..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button onClick={addDrug} disabled={!input.trim()}>
                + Agregar
              </button>
            </div>

            <div className="idlist">
              {drugs.length === 0 && (
                <span style={{ fontSize: '.79rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                  Agrega al menos 2 fármacos...
                </span>
              )}
              {drugs.map(d => (
                <div key={d} className="idc">
                  {d}
                  <button onClick={() => removeDrug(d)}>×</button>
                </div>
              ))}
            </div>

            {drugs.length < 2 && drugs.length > 0 && (
              <p style={{ fontSize: '.79rem', color: 'var(--soft)', marginBottom: 8 }}>
                Agrega al menos un fármaco más para analizar.
              </p>
            )}

            <button
              className="btnp"
              onClick={handleCheck}
              disabled={drugs.length < 2 || loading}
            >
              <SparklesIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {loading
                ? 'Analizando interacciones...'
                : `Analizar ${drugs.length} fármaco${drugs.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

        {/* Right: result */}
        <div className="card2">
          <div className="ch">Resultado del Análisis</div>
          <div className="cb">
            {!result && !loading && !error && (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--soft)' }}>
                <div style={{ fontSize: 2.5 + 'rem', marginBottom: 12, color: 'var(--blue)' }}><ZapIcon size={40} /></div>
                <p style={{ fontSize: '.88rem', marginBottom: 8 }}>El análisis de interacciones aparecerá aquí.</p>
                <p style={{ fontSize: '.79rem' }}>
                  Sin interacción &nbsp;|&nbsp; Precaución &nbsp;|&nbsp; Contraindicada
                </p>
              </div>
            )}

            {loading && (
              <div className="ld">
                <div className="sp" />
                <p>Analizando {drugs.length} fármacos con IA...</p>
              </div>
            )}

            {error && (
              <div className="wbox" style={{ marginBottom: 0 }}>
                <span>!</span>
                <span><strong>Error:</strong> {error}</span>
              </div>
            )}

            {result && (
              <div>
                <div className="crtitle">Análisis: {drugs.join(' + ')}</div>
                <div
                  className="ai-response"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(result) }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function markdownToHtml(md) {
  return md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
