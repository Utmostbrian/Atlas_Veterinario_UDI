import { useState, useMemo } from 'react'
import { DRUGS, CATEGORIES } from '../../data/drugs'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import DrugCard from './DrugCard'
import { SearchIcon } from '../../Icons/Icons'

export default function DrugGrid({ onChatOpen, onLoginRequired }) {
  const [query,          setQuery]          = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')
  const [recentSearches, setRecentSearches] = useLocalStorage('vet_recent_searches', [])

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

  return (
    <div className="wrap">
      <div className="twocol">

        {/* ── Sidebar ── */}
        <aside className="sb">
          <div className="sbc">
            <div className="sbh">Categorías</div>
            <ul className="catlist">
              <li>
                <button
                  className={activeCategory === 'ALL' ? 'on' : ''}
                  onClick={() => setActiveCategory('ALL')}
                >
                  Todos los fármacos
                  <span className="ccnt">{DRUGS.length}</span>
                </button>
              </li>
              {CATEGORIES.map(cat => (
                <li key={cat.key}>
                  <button
                    className={activeCategory === cat.key ? 'on' : ''}
                    onClick={() => setActiveCategory(cat.key)}
                  >
                    {cat.label}
                    <span className="ccnt">
                      {DRUGS.filter(d => d.category === cat.key).length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

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
                    onClick={() => setQuery(s)}
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
                  onChange={e => setQuery(e.target.value)}
                  maxLength={80}
                />
              </div>
              {query && (
                <button id="sb" onClick={() => setQuery('')}>Limpiar</button>
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
              <h3>Sin resultados</h3>
              <p>No se encontraron fármacos para <strong>"{query}"</strong></p>
              <button
                className="btnp"
                onClick={() => { setQuery(''); setActiveCategory('ALL') }}
                style={{ marginTop: 12, width: 'auto', padding: '9px 24px' }}
              >
                Ver todos los fármacos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
