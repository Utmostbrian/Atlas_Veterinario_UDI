import { useState, useEffect, useRef } from 'react'
import { CATEGORY_MAP } from '../../data/drugs'
import { logDrugCardOpen } from '../../services/auditService'
import { SparklesIcon, CloseIcon, WarningIcon, AlertCircleIcon, GlobeIcon, BookOpenIcon } from '../../Icons/Icons'
import { searchDrugWithAI, relatedDrugs } from '../../modules/atlas'
import { getCachedAIResult, setCachedAIResult } from '../../modules/aiSearch'

const STRIPE_CLASS = { AB: 'ab', AP: 'ap', AI: 'ai', AN: 'an', AF: 'af', HO: 'ho' }

export default function DrugCard({ drug, expanded: controlledExpanded, onExpandedChange, onChatOpen, onAskAI, onLoginRequired }) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [aiData, setAiData] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const panelRef = useRef(null)
  const expanded = controlledExpanded ?? internalExpanded

  const cat = CATEGORY_MAP[drug.category] || {}
  const stripe = STRIPE_CLASS[drug.category] || 'ab'

  async function handleExpand() {
    if (expanded) {
      setInternalExpanded(false)
      onExpandedChange?.(false)
      setAiData(null)
      return
    }
    if (onLoginRequired) {
      onLoginRequired()
      return
    }
    // Registrar en búsquedas recientes al abrir la carta (no solo al click de IA)
    if (onAskAI) onAskAI()
    logDrugCardOpen(drug.name, drug.species)
    setInternalExpanded(true)
    onExpandedChange?.(true)

    const cached = getCachedAIResult('drug', drug.name)
    if (cached) {
      setAiData(cached)
      setAiLoading(false)
      return
    }

    setAiLoading(true)
    setAiData(null)
    try {
      const result = await searchDrugWithAI(drug.name)
      setAiData(result)
      if (result?.encontrado) setCachedAIResult('drug', drug.name, result)
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded || aiData || aiLoading) return
    const cached = getCachedAIResult('drug', drug.name)
    if (cached) setAiData(cached)
  }, [expanded, aiData, aiLoading, drug.name])

  function handleAskAI(e) {
    e.stopPropagation()
    if (onAskAI) onAskAI(drug.name)
    if (onChatOpen) onChatOpen(true)
  }

  const related = aiData?.encontrado ? relatedDrugs(drug.name) : []

  return (
    <>
      {/* ── Collapsed row (iOS list style) ── */}
      <div className="drow" onClick={handleExpand}>
        <div className={`drow-dot ${stripe}`} />
        <div className="drow-body">
          <div className="drow-name">{drug.name}</div>
          <div className="drow-latin">{drug.latin}</div>
        </div>
        <div className="drow-meta">
          <span className="tg tc2">{cat.label}</span>
          {drug.dosages[0] && (
            <span className="drow-dose">{drug.dosages[0][1]} · {drug.dosages[0][2]}</span>
          )}
        </div>
        <span className="drow-arr">{expanded ? '↑' : '›'}</span>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div ref={panelRef} className="drow-panel">
          <div className="aip" style={{ margin: 0, borderRadius: 0, border: 'none', boxShadow: 'none' }}>
            {/* Header — siempre datos locales para respuesta inmediata */}
            <div className="aiph">
              <button className="aiclose" onClick={() => { setInternalExpanded(false); onExpandedChange?.(false); setAiData(null) }} aria-label="Cerrar"><CloseIcon size={14} /></button>
              <div className="ainame">{drug.name}</div>
              <div className="ailat">{drug.latin}</div>
              <div className="aitags">
                <span className="aitag">{cat.label}</span>
                <span className="aitag">{drug.routes}</span>
                <span className="aitag">{drug.species}</span>
                {aiData?.encontrado && <span className="aitag ia" style={{ display:'inline-flex', alignItems:'center', gap:3 }}><SparklesIcon size={10} /> IA</span>}
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
                      <WarningIcon size={16} style={{ flexShrink: 0 }} />
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

                  {aiData?._sources?.length > 0 && (
                    <div style={{ fontSize: '.78rem', color: 'var(--muted,#6b7280)', borderTop: '1px solid var(--border,#e5e7eb)', paddingTop: 10, marginTop: 4 }}>
                      <strong style={{ display: 'block', marginBottom: 4 }}>Fuentes consultadas:</strong>
                      {aiData._sources.includes('vademecum') && (
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}><BookOpenIcon size={13} /> Plumb&apos;s Veterinary Drug Handbook, 10.ª ed.</div>
                      )}
                      {aiData._sources.includes('merck') && (
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}><GlobeIcon size={13} /> Merck Veterinary Manual (merckvetmanual.com)</div>
                      )}
                    </div>
                  )}

                  <div className="wbox">
                    <AlertCircleIcon size={16} style={{ flexShrink: 0 }} />
                    <span>Información generada por IA. Usar siempre bajo supervisión veterinaria profesional.</span>
                  </div>

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
                /* Fármaco no encontrado o error de IA — fallback a datos locales */
                <>
                  {aiData?.mensaje && (
                    <div className="abox rr" style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: '.84rem' }}>{aiData.mensaje}</p>
                    </div>
                  )}

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
        </div>
      )}
    </>
  )
}
