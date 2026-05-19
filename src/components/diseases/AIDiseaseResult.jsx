import { useRef, useEffect } from 'react'
import { CloseIcon, AlertCircleIcon, SparklesIcon } from '../../Icons/Icons'

export default function AIDiseaseResult({ query, aiData, loading, error, onClose }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [])

  const shown        = aiData?.nombre || query
  const wasCorrected = aiData?.status === 'ok' && aiData?.nombreCorregido &&
    aiData.nombreCorregido.trim().toLowerCase() !== query.trim().toLowerCase()

  return (
    <div ref={panelRef} className="aip" style={{ gridColumn: '1 / -1', marginTop: 12 }}>
      <div className="aiph">
        <button className="aiclose" onClick={onClose} aria-label="Cerrar"><CloseIcon size={14} /></button>
        <div className="ainame">{shown}</div>
        <div className="aitags">
          <span className="aitag ia" style={{ display:'inline-flex', alignItems:'center', gap:3 }}><SparklesIcon size={10} /> IA</span>
        </div>
      </div>

      <div className="aibody">
        {loading ? (
          <div className="ld">
            <div className="sp" />
            <p>Consultando protocolo para "{query}"...</p>
          </div>

        ) : error ? (
          <div className="abox rr" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: '.86rem' }}>{error}</p>
          </div>

        ) : aiData?.status === 'ok' ? (
          <>
            {wasCorrected && (
              <div className="abox b" style={{ marginBottom: 12 }}>
                <p style={{ fontSize: '.85rem' }}>
                  Mostrando protocolo para <strong>{aiData.nombreCorregido}</strong> (corregido desde "{query}").
                </p>
              </div>
            )}

            {aiData.diagnostico && (
              <div className="aisec">
                <h3>Diagnóstico y Etiología</h3>
                <p>{aiData.diagnostico}</p>
              </div>
            )}

            {aiData.signosClinicos?.length > 0 && (
              <div className="aisec">
                <h3>Signos Clínicos</h3>
                <ul>{aiData.signosClinicos.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}

            {aiData.fases?.map((fase, i) => (
              <div key={i} className="aisec">
                <h3>{fase.titulo}</h3>
                {fase.objetivo && (
                  <p style={{ fontSize: '.84rem', color: 'var(--soft)', marginBottom: 8 }}>{fase.objetivo}</p>
                )}
                {fase.farmacos?.length > 0 && (
                  <table className="dtbl" style={{ marginTop: 6 }}>
                    <thead>
                      <tr>
                        <th>Fármaco</th><th>Dosis</th><th>Vía</th><th>Frecuencia</th><th>Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fase.farmacos.map((f, j) => (
                        <tr key={j}>
                          <td>{f.nombre}</td>
                          <td><strong>{f.dosis}</strong></td>
                          <td>{f.via}</td>
                          <td>{f.frecuencia}</td>
                          <td>{f.duracion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}

            {aiData.medidasSoporte?.length > 0 && (
              <div className="aisec">
                <h3>Medidas de Soporte</h3>
                <ul>{aiData.medidasSoporte.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}

            {aiData.pronostico && (
              <div className="aisec">
                <h3>Pronóstico y Prevención</h3>
                <p>{aiData.pronostico}</p>
              </div>
            )}

            <div className="wbox">
              <AlertCircleIcon size={16} style={{ flexShrink: 0 }} />
              <span>Protocolo generado por IA. El diagnóstico definitivo debe realizarlo un veterinario profesional.</span>
            </div>
          </>

        ) : aiData?.status === 'not-found' ? (
          <div className="abox rr">
            <p style={{ fontSize: '.86rem' }}>
              "{query}" no fue reconocido como una enfermedad veterinaria válida. Verifica la ortografía o usa el nombre clínico correcto.
            </p>
          </div>

        ) : aiData?.status === 'bad-format' ? (
          <div className="abox o">
            <p style={{ fontSize: '.86rem' }}>La IA no pudo estructurar el protocolo. Intenta de nuevo o reformula el término.</p>
          </div>

        ) : (
          <div className="abox rr">
            <p style={{ fontSize: '.86rem' }}>{aiData?.mensaje || 'Sin información disponible.'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
