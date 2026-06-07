import { useMemo } from 'react'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { GLOSSARY } from '../../data/glossary'
import { SearchIcon, BookIcon } from '../../Icons/Icons'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function Glossary() {
  const [query,   setQuery]   = useLocalStorage('vet_memory_glossary_query', '')
  const [letter,  setLetter]  = useLocalStorage('vet_memory_glossary_letter', null)
  const [openTerm, setOpenTerm] = useLocalStorage('vet_memory_glossary_open_term', null)

  const availableLetters = useMemo(
    () => new Set(GLOSSARY.map(g => g.term[0].toUpperCase())),
    []
  )

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return GLOSSARY.filter(g => {
      const matchQ = !q || g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q)
      const matchL = !letter || g.term.toUpperCase().startsWith(letter)
      return matchQ && matchL
    })
  }, [query, letter])

  function toggleTerm(term) {
    setOpenTerm(prev => prev === term ? null : term)
  }

  function handleClearMemory() {
    setQuery('')
    setLetter(null)
    setOpenTerm(null)
  }

  return (
    <div className="page-inner">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookIcon size={20} style={{ color: 'var(--blue)' }} /> Glosario Farmacológico
        </span>
        <div className="memory-actions">
          <span className="scnt">{filtered.length} términos</span>
          <button type="button" className="memory-clear-btn" onClick={handleClearMemory}>Limpiar</button>
        </div>
      </div>

      {/* Search */}
      <div className="gsearch">
        <SearchIcon size={15} className="sic" style={{ top: '50%', left: 12, position: 'absolute', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }} />
        <input
          id="gsearch"
          type="text"
          placeholder="Buscar término..."
          value={query}
          onChange={e => { setQuery(e.target.value); setLetter(null) }}
          maxLength={80}
          style={{ paddingLeft: 40 }}
        />
      </div>

      {/* Alphabet filter */}
      <div className="galpha">
        <button
          className={`abtn abtn-all${!letter ? ' on' : ''}`}
          onClick={() => setLetter(null)}
        >
          Todos
        </button>
        {ALPHABET.map(l => (
          <button
            key={l}
            className={`abtn${letter === l ? ' on' : ''}`}
            disabled={!availableLetters.has(l)}
            onClick={() => availableLetters.has(l) && setLetter(l === letter ? null : l)}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Term list */}
      <div className="glist">
        {filtered.length === 0 ? (
          <div className="empty">
            <h3>Sin resultados</h3>
            <p>No se encontraron términos para "{query}"</p>
          </div>
        ) : (
          filtered.map(g => (
            <div key={g.term} className="gi">
              <div className="gterm" onClick={() => toggleTerm(g.term)}>
                {g.term}
                <span className="gar">{openTerm === g.term ? '▲' : '▼'}</span>
              </div>
              <div className={`gdef${openTerm === g.term ? ' open' : ''}`}>
                {g.definition}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
