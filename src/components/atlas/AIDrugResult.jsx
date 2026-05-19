import { useRef, useEffect } from 'react'
import { SparklesIcon } from '../../Icons/Icons'

export default function AIDrugResult({ query, aiData, loading, error, onClose, onAskAI }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [])

  const shown        = aiData?.nombre || query
  const wasCorrected = aiData?.encontrado && aiData?.nombreCorregido &&
    aiData.nombreCorregido.trim().toLowerCase() !== query.trim().toLowerCase()

  return (
    <div ref={panelRef} className="aip" style={{ gridColumn: '1 / -1', marginTop: 12 }}>
      <div className="aiph">
        <button className="aiclose" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="ainame">{shown}</div>
        {aiData?.nombreCientifico && <div className="ailat">{aiData.nombreCientifico}</div>}
        <div className="aitags">
          <span className="aitag ia">✦ IA</span>
          {aiData?.categoria && <span className="aitag">{aiData.categoria}</span>}
        </div>
      </div>

      <div className="aibody">
        {loading ? (
          <div className="ld">
            <div className="sp" />
            <p>Consultando con IA sobre "{query}"...</p>
          </div>

        ) : error ? (
          <div className="abox rr" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: '.86rem' }}>{error}</p>
          </div>

        ) : aiData?.encontrado ? (
          <>
            {wasCorrected && (
              <div className="abox b" style={{ marginBottom: 12 }}>
                <p style={{ fontSize: '.85rem' }}>
                  Mostrando resultados para <strong>{aiData.nombreCorregido}</strong> (corregido desde "{query}").
                </p>
              </div>
            )}

            {aiData.descripcion && (
              <div className="aisec">
                <h3>Descripción</h3>
                <p>{aiData.descripcion}</p>
              </div>
            )}

            {aiData.mecanismo && (
              <div className="aisec">
                <h3>Mecanismo de Acción</h3>
                <p>{aiData.mecanismo}</p>
              </div>
            )}

            <div className="a2col">
              {aiData.indicaciones?.length > 0 && (
                <div className="aisec">
                  <h3>Indicaciones</h3>
                  <ul>{aiData.indicaciones.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
              {aiData.contraindicaciones?.length > 0 && (
                <div className="aisec">
                  <h3>Contraindicaciones</h3>
                  <ul>{aiData.contraindicaciones.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}
            </div>

            {aiData.efectosAdversos?.length > 0 && (
              <div className="aisec">
                <h3>Efectos Adversos</h3>
                <ul>{aiData.efectosAdversos.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </div>
            )}

            {aiData.dosis?.length > 0 && (
              <div className="aisec">
                <h3>Dosis por especie</h3>
                <table className="dtbl">
                  <thead>
                    <tr>
                      <th>Especie</th><th>Dosis</th><th>Vía</th><th>Frecuencia</th><th>Duración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiData.dosis.map((d, i) => (
                      <tr key={i}>
                        <td>{d.especie}</td>
                        <td><strong>{d.dosis}</strong></td>
                        <td>{d.via}</td>
                        <td>{d.frecuencia}</td>
                        <td>{d.duracion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="a2col">
              {aiData.interacciones && (
                <div className="abox o">
                  <div className="aisec">
                    <h3>Interacciones</h3>
                    <p>{aiData.interacciones}</p>
                  </div>
                </div>
              )}
              {aiData.supresion && (
                <div className="abox b">
                  <div className="aisec">
                    <h3>Período de Supresión</h3>
                    <p>{aiData.supresion}</p>
                  </div>
                </div>
              )}
            </div>

            {aiData.avisoClinico && (
              <div className="wbox">
                <span>⚠</span>
                <span>{aiData.avisoClinico}</span>
              </div>
            )}

            <div className="wbox">
              <span>!</span>
              <span>Información generada por IA. Verifica siempre con literatura clínica antes de prescribir.</span>
            </div>

            {onAskAI && (
              <button
                onClick={() => onAskAI(shown)}
                style={{
                  alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 20px', background: 'var(--blue)', color: '#fff',
                  border: 'none', borderRadius: 'var(--rs)',
                  fontWeight: 700, fontSize: '.86rem', cursor: 'pointer', transition: '.2s',
                }}
              >
                <SparklesIcon size={15} /> Profundizar en el chat
              </button>
            )}
          </>

        ) : (
          <div className="abox rr">
            <p style={{ fontSize: '.86rem' }}>
              {aiData?.mensaje || `"${query}" no fue reconocido como un fármaco veterinario válido. Verifica la ortografía o usa un nombre comercial / DCI.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
