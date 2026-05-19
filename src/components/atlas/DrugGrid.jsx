import { useState, useMemo } from 'react'
import { DRUGS, CATEGORIES } from '../../data/drugs'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useAuth } from '../../context/AuthContext'
import DrugCard from './DrugCard'
import AIDrugResult from './AIDrugResult'
import { SearchIcon, SparklesIcon } from '../../Icons/Icons'
import { searchDrugWithAI } from '../../modules/atlas'
import {
  validateAISearchInput, consumeClientRateLimit,
  getCachedAIResult, setCachedAIResult, findCatalogSuggestion,
  isAISearchAllowed, isExactInDictionary,
} from '../../modules/aiSearch'
import { EXTENDED_DRUG_NAMES, DRUG_SUFFIX_PATTERNS } from '../../data/extendedDictionaries'
import { logAiConsultation } from '../../services/auditService'

const CATALOG_NAMES   = DRUGS.flatMap(d => [d.name, d.latin]).filter(Boolean)
const FUZZY_DICTIONARY = [...new Set([...CATALOG_NAMES, ...EXTENDED_DRUG_NAMES])]

export default function DrugGrid({ onChatOpen, onLoginRequired }) {
  const { user } = useAuth()
  const [query,          setQuery]          = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [recentSearches, setRecentSearches] = useLocalStorage('vet_recent_searches', [])

  // Estado de búsqueda IA (empty-state)
  const [aiTerm,    setAiTerm]    = useState(null)   // término que se está consultando
  const [aiData,    setAiData]    = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState(null)

  function addRecent(name) {
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== name)
      return [name, ...filtered].slice(0, 6)
    })
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const matches = DRUGS.filter(d => {
      const matchCat = activeCategory === 'ALL' || d.category === activeCategory
      if (!q) return matchCat
      const matchQ =
        d.name.toLowerCase().startsWith(q) ||
        d.latin.toLowerCase().startsWith(q) ||
        d.species.toLowerCase().includes(q)
      return matchCat && matchQ
    })
    if (!q) return matches
    return [...matches].sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
      return aStarts - bStarts
    })
  }, [query, activeCategory])

  function closeAI() {
    setAiTerm(null)
    setAiData(null)
    setAiError(null)
    setAiLoading(false)
  }

  // Limpiar resultado IA cuando el usuario cambia el query
  function handleQueryChange(newValue) {
    setQuery(newValue)
    if (aiTerm) closeAI()
  }

  async function handleAISearch() {
    const term = query.trim()
    setAiError(null)

    // 1. Validar input (longitud, charset, anti-injection, anti-spam)
    const validation = validateAISearchInput(term)
    if (!validation.ok) {
      setAiTerm(term)
      setAiError(validation.reason)
      return
    }

    // 2. Auth: la IA requiere sesión activa (el proxy devuelve 401 si no hay JWT)
    if (!user) {
      if (onLoginRequired) onLoginRequired()
      return
    }

    // 3. Caché (24h por término)
    const cached = getCachedAIResult('drug', term)
    if (cached) {
      setAiTerm(term)
      setAiData(cached)
      addRecent(cached.nombre || term)
      return
    }

    // 4. Rate limit cliente: 5 búsquedas IA por minuto
    const rl = consumeClientRateLimit('drug')
    if (!rl.ok) {
      setAiTerm(term)
      setAiError(`Demasiadas consultas. Espera ${rl.retryInSec}s antes de buscar de nuevo.`)
      return
    }

    // 5. Llamada a la IA
    setAiTerm(term)
    setAiLoading(true)
    setAiData(null)
    try {
      const result = await searchDrugWithAI(term)
      setAiData(result)
      if (result?.encontrado) {
        setCachedAIResult('drug', term, result)
        addRecent(result.nombre || term)
        logAiConsultation(term, `Búsqueda IA fármaco: ${result.nombre || term}`)
      }
    } catch (e) {
      setAiError(e.message || 'Error al consultar con la IA.')
    } finally {
      setAiLoading(false)
    }
  }

  const trimmedQuery = query.trim()
  const canSearchAI  = trimmedQuery.length >= 3

  // Capa 1: fuzzy match contra catálogo + diccionario extendido (typo detection).
  const fuzzySuggestion = useMemo(() => {
    if (filtered.length > 0 || !canSearchAI) return null
    const name = findCatalogSuggestion(trimmedQuery, FUZZY_DICTIONARY)
    if (!name) return null
    const inCatalog = CATALOG_NAMES.some(n => n.toLowerCase() === name.toLowerCase())
    return { name, inCatalog }
  }, [trimmedQuery, canSearchAI, filtered.length])

  // Capa 2: si no hay sugerencia, validar que el término encaje con un nombre
  // conocido del diccionario o con un patrón farmacéutico típico. Si no, bloquear.
  const aiGate = useMemo(() => {
    if (fuzzySuggestion || !canSearchAI || filtered.length > 0) return null
    return isAISearchAllowed(trimmedQuery, EXTENDED_DRUG_NAMES, DRUG_SUFFIX_PATTERNS)
  }, [trimmedQuery, canSearchAI, filtered.length, fuzzySuggestion])

  return (
    <div className="wrap">
      <div className="twocol">

        {/* ── Sidebar ── */}
        <aside className="sb">
          <div className="sbc">
            <div className="sbh red">⚠ Aviso Clínico</div>
            <div className="sbb">
              Las dosis son <strong>orientativas</strong>. Ajustar siempre según especie,
              peso, estado clínico y criterio veterinario. No reemplaza la prescripción profesional.
            </div>
          </div>

          {recentSearches.length > 0 && (
            <div className="sbc">
              <div className="sbh">Búsquedas recientes</div>
              <div className="sbb" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentSearches.map(s => (
                  <button
                    key={s}
                    onClick={() => handleQueryChange(s)}
                    style={{
                      background: 'none', border: 'none', textAlign: 'left',
                      padding: '4px 0', fontSize: '.8rem',
                      color: 'var(--blue)', cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <div>
          {/* Search bar */}
          <div className="sbar">
            <label htmlFor="si" className="slbl2">Buscar fármaco</label>
            <div className="srow">
              <div className="swrap">
                <SearchIcon size={15} className="sic" style={{ left: 12, color: 'var(--gray)', pointerEvents: 'none' }} />
                <input
                  id="si"
                  type="text"
                  placeholder="Nombre, especie, indicación..."
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  maxLength={60}
                />
              </div>
              {query && (
                <button id="sb" onClick={() => handleQueryChange('')}>Limpiar</button>
              )}
            </div>

            {/* Category chips */}
            <div className="chips">
              <button
                className={`chip${activeCategory === 'ALL' ? ' on' : ''}`}
                onClick={() => setActiveCategory('ALL')}
              >
                Todos
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  className={`chip${activeCategory === cat.key ? ' on' : ''}`}
                  onClick={() => setActiveCategory(cat.key)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results header */}
          <div className="shdr">
            <span className="stitle">Fármacos</span>
            <span className="scnt">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Grid */}
          {filtered.length > 0 ? (
            <div className="dgrid">
              {filtered.map(drug => (
                <DrugCard
                  key={drug.id}
                  drug={drug}
                  onChatOpen={onChatOpen}
                  onAskAI={() => addRecent(drug.name)}
                  onLoginRequired={onLoginRequired}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>Sin resultados en el catálogo</h3>
              <p>No se encontraron fármacos para <strong>"{query}"</strong> en la base local.</p>

              {fuzzySuggestion ? (
                /* Typo detectado contra catálogo o diccionario extendido — sin tokens */
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
                /* Pasa el gate: es un nombre conocido o encaja con patrón farmacéutico */
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
                    onClick={() => { handleQueryChange(''); setActiveCategory('ALL') }}
                    style={{ width: 'auto', padding: '10px 22px', background: 'var(--gray-light)' }}
                  >
                    Ver todos los fármacos
                  </button>
                </div>

              ) : (
                /* No matchea diccionario ni patrón: bloqueo duro, sin tokens */
                <div style={{ marginTop: 12 }}>
                  <div className="abox rr" style={{ display: 'inline-block', textAlign: 'left', maxWidth: 480 }}>
                    <p style={{ fontSize: '.86rem', margin: 0 }}>
                      <strong>"{trimmedQuery}"</strong> no parece un fármaco reconocido. Verifica la ortografía o usa el nombre genérico / DCI (ej. <em>Amoxicilina</em>, <em>Meloxicam</em>, <em>Ivermectina</em>).
                    </p>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btnp"
                      onClick={() => { handleQueryChange(''); setActiveCategory('ALL') }}
                      style={{ width: 'auto', padding: '9px 22px', background: 'var(--gray-light)' }}
                    >
                      Ver todos los fármacos
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resultado IA inline */}
          {aiTerm && (
            <AIDrugResult
              query={aiTerm}
              aiData={aiData}
              loading={aiLoading}
              error={aiError}
              onClose={closeAI}
              onAskAI={user && onChatOpen ? (name => { addRecent(name); onChatOpen(true) }) : null}
            />
          )}
        </div>
      </div>
    </div>
  )
}
