import { useState, useEffect, useRef } from 'react'
import { CATEGORY_MAP } from '../../data/drugs'
import { logDrugSearch } from '../../services/auditService'
import { SparklesIcon } from '../../Icons/Icons'
import { searchDrugWithAI, relatedDrugs } from '../../modules/atlas'

const STRIPE_CLASS = { AB: 'ab', AP: 'ap', AI: 'ai', AN: 'an', AF: 'af', HO: 'ho' }

export default function DrugCard({ drug, onChatOpen, onAskAI, onLoginRequired }) {
  const [expanded,  setExpanded]  = useState(false)
  const [aiData,    setAiData]    = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const panelRef = useRef(null)

  const cat    = CATEGORY_MAP[drug.category] || {}
  const stripe = STRIPE_CLASS[drug.category] || 'ab'

  async function handleExpand() {
    if (expanded) {
      setExpanded(false)
      setAiData(null)
      return
    }
    if (onLoginRequired) {
      onLoginRequired()
      return
    }
    logDrugSearch(drug.name, drug.species)
    setExpanded(true)
    setAiLoading(true)
    setAiData(null)
    const result = await searchDrugWithAI(drug.name)
    setAiData(result)
    setAiLoading(false)
  }

  useEffect(() => {
    if (expanded && panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [expanded])

  function handleAskAI(e) {
    e.stopPropagation()
    if (onAskAI) onAskAI(drug.name)
    if (onChatOpen) onChatOpen(true)
  }

  const related = aiData?.encontrado ? relatedDrugs(drug.name) : []

  return (
    <>
      <div className="dcard" onClick={handleExpand}>
        <div className="dct">
          <div className={`ds ${stripe}`} />
          <div className="dn">{drug.name}</div>
          <div className="dl">{drug.latin}</div>
          <div className="dtags">
            <span className="tg tc2">{cat.label}</span>
            <span className="tg tv">{drug.routes}</span>
          </div>
          <div className="dd">{drug.description}</div>
        </div>
        <div className="dcb">
          <div className="dp">
            {drug.dosages[0] && (
              <>
                <strong>{drug.dosages[0][1]}</strong> · {drug.dosages[0][0]}
              </>
            )}
          </div>
          <span className="darr">{expanded ? '↑' : '→'}</span>
        </div>
      </div>

      {expanded && (
        <div ref={panelRef} className="aip" style={{ gridColumn: '1 / -1' }}>
          {/* Header — siempre datos locales para respuesta inmediata */}
          <div className="aiph">
            <button className="aiclose" onClick={() => { setExpanded(false); setAiData(null) }}>✕</button>
            <div className="ainame">{drug.name}</div>
            <div className="ailat">{drug.latin}</div>
            <div className="aitags">
              <span className="aitag">{cat.label}</span>
              <span className="aitag">{drug.routes}</span>
              <span className="aitag">{drug.species}</span>
              {aiData?.encontrado && <span className="aitag ia">✦ IA</span>}
            </div>
          </div>

          <div className="aibody">
            {aiLoading ? (
              /* Estado de carga */
              <div className="ld">
                <div className="sp" />
                <p>Consultando con IA...</p>
              </div>
            ) : aiData?.encontrado ? (
              /* Resultado IA exitoso */
              <>
                {aiData.descripcion && (
                  <div className="aisec">
                    <h3>Descripción</h3>
                    <p>{aiData.descripcion}</p>
                  </div>
                )}

                {aiData.historia && (
                  <div className="aisec">
                    <h3>Historia</h3>
                    <p>{aiData.historia}</p>
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
                      <ul>
                        {aiData.indicaciones.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiData.contraindicaciones?.length > 0 && (
                    <div className="aisec">
                      <h3>Contraindicaciones</h3>
                      <ul>
                        {aiData.contraindicaciones.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                {aiData.efectosAdversos?.length > 0 && (
                  <div className="aisec">
                    <h3>Efectos Adversos</h3>
                    <ul>
                      {aiData.efectosAdversos.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                )}

                {aiData.dosis?.length > 0 && (
                  <div className="aisec">
                    <h3>Dosis por especie</h3>
                    <table className="dtbl">
                      <thead>
                        <tr>
                          <th>Especie</th>
                          <th>Dosis</th>
                          <th>Vía</th>
                          <th>Frecuencia</th>
                          <th>Duración</th>
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

                {related.length > 0 && (
                  <div className="aisec">
                    <h3>Fármacos relacionados</h3>
                    <div className="dtags" style={{ marginTop: 6 }}>
                      {related.map(r => (
                        <span key={r.id} className="tg tc2">{r.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleAskAI}
                  style={{
                    alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 20px', background: 'var(--blue)', color: '#fff',
                    border: 'none', borderRadius: 'var(--rs)',
                    fontWeight: 700, fontSize: '.86rem', cursor: 'pointer', transition: '.2s',
                  }}
                >
                  <SparklesIcon size={15} /> Consultar con IA
                </button>
              </>
            ) : (
              /* Error / sin API key — fallback a datos locales */
              <>
                {aiData === null ? (
                  <div className="abox b" style={{ marginBottom: 14, fontSize: '.84rem' }}>
                    Error con la configuracion de API Key de Anthropic. No es posible ampliar tu consulta sobre este fármaco con IA por el error mencionado.
                  </div>
                ) : aiData?.mensaje ? (
                  <div className="abox rr" style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: '.84rem' }}>{aiData.mensaje}</p>
                  </div>
                ) : null}

                <div className="aisec">
                  <h3>Descripción</h3>
                  <p>{drug.description}</p>
                </div>

                <div className="aisec">
                  <h3>Dosis por especie</h3>
                  <table className="dtbl">
                    <thead>
                      <tr>
                        <th>Especie</th>
                        <th>Dosis</th>
                        <th>Vía</th>
                        <th>Frecuencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drug.dosages.map(([sp, dose, via, freq], i) => (
                        <tr key={i}>
                          <td>{sp}</td>
                          <td><strong>{dose}</strong></td>
                          <td>{via}</td>
                          <td>{freq}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(drug.warnings || drug.interactions) && (
                  <div className="a2col">
                    {drug.warnings && (
                      <div className="abox rr">
                        <div className="aisec">
                          <h3>Advertencias</h3>
                          <p>{drug.warnings}</p>
                        </div>
                      </div>
                    )}
                    {drug.interactions && (
                      <div className="abox o">
                        <div className="aisec">
                          <h3>Interacciones</h3>
                          <p>{drug.interactions}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleAskAI}
                  style={{
                    alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 20px', background: 'var(--blue)', color: '#fff',
                    border: 'none', borderRadius: 'var(--rs)',
                    fontWeight: 700, fontSize: '.86rem', cursor: 'pointer', transition: '.2s',
                  }}
                >
                  <SparklesIcon size={15} /> Consultar con IA
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
