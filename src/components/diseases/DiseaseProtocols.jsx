import { useState, useMemo, useRef, useEffect } from 'react'
import { DISEASES } from '../../data/diseases'
import { SearchIcon, ActivityIcon, SparklesIcon, CloseIcon, AlertCircleIcon, GlobeIcon, BookOpenIcon } from '../../Icons/Icons'
import { searchDiseaseWithAI, buildLocalFallback } from '../../modules/diseases'
import { useAuth } from '../../context/AuthContext'
import AIDiseaseResult from './AIDiseaseResult'
import {
  validateAISearchInput, consumeClientRateLimit,
  getCachedAIResult, setCachedAIResult, findCatalogSuggestion,
  isAISearchAllowed,
} from '../../modules/aiSearch'
import { EXTENDED_DISEASE_NAMES, DISEASE_SUFFIX_PATTERNS } from '../../data/extendedDictionaries'
import { logAiConsultation } from '../../services/auditService'

const SEVERITY_COLOR  = { 'Muy Alta': '#CC0000', Alta: '#d97706', Media: '#003087' }
const CATALOG_NAMES   = DISEASES.map(d => d.name)
const FUZZY_DICTIONARY = [...new Set([...CATALOG_NAMES, ...EXTENDED_DISEASE_NAMES])]

export default function DiseaseProtocols({ onLoginRequired }) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')

  // Estado de búsqueda IA (empty-state)
  const [aiTerm,    setAiTerm]    = useState(null)
  const [aiData,    setAiData]    = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState(null)

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

  function closeAI() {
    setAiTerm(null)
    setAiData(null)
    setAiError(null)
    setAiLoading(false)
  }

  function handleQueryChange(newValue) {
    setQuery(newValue)
    if (aiTerm) closeAI()
  }

  async function handleAISearch() {
    const term = query.trim()
    setAiError(null)

    const validation = validateAISearchInput(term)
    if (!validation.ok) {
      setAiTerm(term)
      setAiError(validation.reason)
      return
    }

    if (!user) {
      if (onLoginRequired) onLoginRequired()
      return
    }

    const cached = getCachedAIResult('disease', term)
    if (cached) {
      setAiTerm(term)
      setAiData(cached)
      return
    }

    const rl = consumeClientRateLimit('disease')
    if (!rl.ok) {
      setAiTerm(term)
      setAiError(`Demasiadas consultas. Espera ${rl.retryInSec}s antes de buscar de nuevo.`)
      return
    }

    setAiTerm(term)
    setAiLoading(true)
    setAiData(null)
    try {
      const result = await searchDiseaseWithAI(term)
      setAiData(result)
      if (result?.status === 'ok') {
        setCachedAIResult('disease', term, result)
        logAiConsultation(term, `Búsqueda IA enfermedad: ${result.nombre || term}`)
      }
    } catch (e) {
      setAiError(e.message || 'Error al consultar con la IA.')
    } finally {
      setAiLoading(false)
    }
  }

  const trimmedQuery = query.trim()
  const canSearchAI  = trimmedQuery.length >= 3

  // Capa 1: coincidencia aproximada (Levenshtein) contra catálogo + diccionario extendido
  const fuzzySuggestion = useMemo(() => {
    if (filtered.length > 0 || !canSearchAI) return null
    const name = findCatalogSuggestion(trimmedQuery, FUZZY_DICTIONARY)
    if (!name) return null
    const inCatalog = CATALOG_NAMES.some(n => n.toLowerCase() === name.toLowerCase())
    return { name, inCatalog }
  }, [trimmedQuery, canSearchAI, filtered.length])

  // Capa 2: gate de IA — solo se muestra el botón si el término es reconocible
  const aiGate = useMemo(() => {
    if (fuzzySuggestion || !canSearchAI || filtered.length > 0) return null
    return isAISearchAllowed(trimmedQuery, EXTENDED_DISEASE_NAMES, DISEASE_SUFFIX_PATTERNS)
  }, [trimmedQuery, canSearchAI, filtered.length, fuzzySuggestion])

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
              onChange={e => handleQueryChange(e.target.value)}
              maxLength={60}
            />
          </div>
          {query && <button id="btnEnfSearch" onClick={() => handleQueryChange('')}>Limpiar</button>}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="egrid">
          {filtered.map(d => (
            <DiseaseCard key={d.id} disease={d} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>Sin resultados en el catálogo</h3>
          <p>No se encontró la enfermedad <strong>"{query}"</strong> en la base local.</p>

          {fuzzySuggestion ? (
            /* Typo detectado — no se consumen tokens */
            <>
              <p style={{ marginTop: 10, fontSize: '.92rem' }}>
                ¿Quisiste decir <strong>{fuzzySuggestion.name}</strong>?
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="btnp"
                  onClick={() => handleQueryChange(fuzzySuggestion.name)}
                  style={{ width: 'auto', padding: '10px 22px', background: 'var(--blue)', color: '#fff' }}
                >
                  Sí, buscar {fuzzySuggestion.name}
                </button>
                <button
                  className="btnp"
                  onClick={() => handleQueryChange('')}
                  style={{ width: 'auto', padding: '10px 22px', background: 'var(--gray-light)' }}
                >
                  No, limpiar búsqueda
                </button>
              </div>
            </>

          ) : !canSearchAI ? (
            <p style={{ marginTop: 10, fontSize: '.82rem', color: 'var(--soft)' }}>
              Escribe al menos 3 caracteres para buscar con IA.
            </p>

          ) : aiGate?.allowed ? (
            /* El término pasa el gate — mostrar botón de búsqueda IA */
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btnp"
                onClick={handleAISearch}
                disabled={aiLoading}
                style={{
                  width: 'auto', padding: '10px 22px',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'var(--blue)', color: '#fff',
                }}
              >
                <SparklesIcon size={15} />
                {aiLoading ? 'Consultando IA...' : `Buscar "${trimmedQuery}" con IA`}
              </button>
              <button
                className="btnp"
                onClick={() => handleQueryChange('')}
                style={{ width: 'auto', padding: '10px 22px', background: 'var(--gray-light)' }}
              >
                Ver todas las enfermedades
              </button>
            </div>

          ) : (
            /* No reconocido — bloqueo duro sin consumir tokens */
            <div style={{ marginTop: 12 }}>
              <div className="abox rr" style={{ display: 'inline-block', textAlign: 'left', maxWidth: 480 }}>
                <p style={{ fontSize: '.86rem', margin: 0 }}>
                  <strong>"{trimmedQuery}"</strong> no parece una enfermedad reconocida. Verifica la ortografía o usa el nombre clínico correcto (ej. <em>Parvovirosis</em>, <em>Leptospirosis</em>, <em>Moquillo</em>).
                </p>
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  className="btnp"
                  onClick={() => handleQueryChange('')}
                  style={{ width: 'auto', padding: '9px 22px', background: 'var(--gray-light)' }}
                >
                  Ver todas las enfermedades
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {aiTerm && (
        <AIDiseaseResult
          query={aiTerm}
          aiData={aiData}
          loading={aiLoading}
          error={aiError}
          onClose={closeAI}
        />
      )}
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
            <button className="aiclose" onClick={() => { setExpanded(false); setAiData(null) }} aria-label="Cerrar"><CloseIcon size={14} /></button>
            <div className="ainame">{disease.name}</div>
            <div className="ailat">{disease.species}</div>
            <div className="aitags">
              <span className="aitag">{disease.severity}</span>
              {aiData?.status === 'ok' && <span className="aitag ia" style={{ display:'inline-flex', alignItems:'center', gap:3 }}><SparklesIcon size={10} /> IA</span>}
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
                  <span>Este protocolo es orientativo. Usar siempre bajo supervisión veterinaria profesional.</span>
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
                  <AlertCircleIcon size={16} style={{ flexShrink: 0 }} />
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
        <AlertCircleIcon size={16} style={{ flexShrink: 0 }} />
        <span>Este protocolo es orientativo. El diagnóstico definitivo debe realizarlo un veterinario profesional.</span>
      </div>
    </>
  )
}
