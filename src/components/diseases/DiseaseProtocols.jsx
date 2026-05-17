import { useState, useMemo, useRef, useEffect } from 'react'
import { DISEASES } from '../../data/diseases'
import { SearchIcon, ActivityIcon } from '../../Icons/Icons'
import { searchDiseaseWithAI, buildLocalFallback } from '../../modules/diseases'

const SEVERITY_COLOR = { 'Muy Alta': '#CC0000', Alta: '#d97706', Media: '#003087' }

export default function DiseaseProtocols() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const matches = DISEASES.filter(
      d => !q || d.name.toLowerCase().startsWith(q) || d.species.toLowerCase().includes(q)
    )
    if (!q) return matches
    return [...matches].sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
      return aStarts - bStarts
    })
  }, [query])

  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ActivityIcon size={20} style={{ color: 'var(--blue)' }} /> Protocolos por Enfermedad
        </span>
        <span className="scnt">{filtered.length} enfermedad{filtered.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="sbar" style={{ marginBottom: 20 }}>
        <div className="srow">
          <div className="swrap">
            <SearchIcon size={15} className="sic" style={{ left: 12, color: 'var(--gray)', pointerEvents: 'none' }} />
            <input
              id="enfSearch"
              placeholder="Buscar enfermedad o especie..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              maxLength={80}
            />
          </div>
          {query && <button id="btnEnfSearch" onClick={() => setQuery('')}>Limpiar</button>}
        </div>
      </div>

      <div className="egrid">
        {filtered.map(d => (
          <DiseaseCard key={d.id} disease={d} />
        ))}
      </div>
    </div>
  )
}

function DiseaseCard({ disease }) {
  const [expanded,  setExpanded]  = useState(false)
  const [aiData,    setAiData]    = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const panelRef = useRef(null)

  async function handleExpand() {
    if (expanded) {
      setExpanded(false)
      setAiData(null)
      return
    }
    setExpanded(true)
    setAiLoading(true)
    setAiData(null)
    const result = await searchDiseaseWithAI(disease.name)
    setAiData(result)
    setAiLoading(false)
  }

  useEffect(() => {
    if (expanded && panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [expanded])

  return (
    <>
      <div className="ecard" onClick={handleExpand}>
        <div className="ech" style={{ background: disease.color || 'var(--blue)' }}>{disease.name}</div>
        <div className="ecb">
          {disease.description && disease.description.length > 90
            ? disease.description.slice(0, 90) + '...'
            : disease.description}
        </div>
        <div className="ecf">
          <span>{disease.species}</span>
          <span style={{ color: SEVERITY_COLOR[disease.severity] || 'var(--soft)', fontWeight: 700 }}>
            ● {disease.severity}
          </span>
        </div>
      </div>

      {expanded && (
        <div ref={panelRef} className="aip" style={{ gridColumn: '1 / -1' }}>
          <div className="aiph">
            <button className="aiclose" onClick={() => { setExpanded(false); setAiData(null) }}>✕</button>
            <div className="ainame">{disease.name}</div>
            <div className="ailat">{disease.species}</div>
            <div className="aitags">
              <span className="aitag">{disease.severity}</span>
              {aiData?.status === 'ok' && <span className="aitag ia">✦ IA</span>}
            </div>
          </div>

          <div className="aibody">
            {aiLoading ? (
              <div className="ld">
                <div className="sp" />
                <p>Cargando protocolo para {disease.name}...</p>
              </div>

            ) : aiData?.status === 'ok' ? (
              <>
                {aiData.diagnostico && (
                  <div className="aisec">
                    <h3>Diagnóstico y Etiología</h3>
                    <p>{aiData.diagnostico}</p>
                  </div>
                )}

                {aiData.signosClinicos?.length > 0 && (
                  <div className="aisec">
                    <h3>Signos Clínicos</h3>
                    <ul>
                      {aiData.signosClinicos.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
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
                    <ul>
                      {aiData.medidasSoporte.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}

                {aiData.pronostico && (
                  <div className="aisec">
                    <h3>Pronóstico y Prevención</h3>
                    <p>{aiData.pronostico}</p>
                  </div>
                )}

                <div className="wbox">
                  <span>!</span>
                  <span>Este protocolo es orientativo. El diagnóstico definitivo debe realizarlo un veterinario profesional.</span>
                </div>
              </>

            ) : aiData?.status === 'not-found' ? (
              <>
                <div className="abox rr" style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: '.86rem', color: 'var(--red-dark)' }}>
                    El término &quot;{disease.name}&quot; no corresponde a una enfermedad veterinaria válida en nuestra base de conocimiento.
                  </p>
                </div>
                <div className="wbox">
                  <span>!</span>
                  <span>Verifica el nombre de la enfermedad y consulta con un profesional veterinario.</span>
                </div>
              </>

            ) : aiData?.status === 'bad-format' ? (
              <>
                <div className="abox o" style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: '.84rem' }}>No se pudo estructurar el protocolo de IA. Mostrando datos del catálogo local.</p>
                </div>
                <LocalFallback disease={disease} />
              </>

            ) : aiData?.status === 'error' ? (
              <>
                <div className="abox rr" style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: '.84rem', color: 'var(--red-dark)' }}>
                    {aiData.mensaje || 'Error al conectar con la IA.'}
                  </p>
                </div>
                <LocalFallback disease={disease} />
              </>

            ) : null}
          </div>
        </div>
      )}
    </>
  )
}

function LocalFallback({ disease }) {
  const fallback = buildLocalFallback(disease.name)
  return (
    <>
      <p style={{ marginBottom: 12, fontSize: '.86rem', color: 'var(--soft)' }}>{disease.species}</p>
      <p style={{ marginBottom: 16, fontSize: '.88rem' }}>{disease.description}</p>

      {fallback.protocol && (
        <div style={{ marginBottom: 14 }}>
          <div className="crtitle">Protocolo terapéutico</div>
          <div className="abox b" style={{ marginTop: 6 }}>
            <p style={{ fontSize: '.85rem' }}>{fallback.protocol}</p>
          </div>
        </div>
      )}

      {fallback.drugs?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="crtitle">Fármacos recomendados</div>
          <div className="dtags" style={{ marginTop: 6 }}>
            {fallback.drugs.map(drug => (
              <span key={drug} className="tg tc2">{drug}</span>
            ))}
          </div>
        </div>
      )}

      <div className="wbox">
        <span>!</span>
        <span>Este protocolo es orientativo. El diagnóstico definitivo debe realizarlo un veterinario profesional.</span>
      </div>
    </>
  )
}
