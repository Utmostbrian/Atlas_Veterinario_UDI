import { useState, useMemo } from 'react'
import { GLOSSARY } from '../../data/glossary'
import { SearchIcon, BookIcon } from '../../Icons/Icons'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function Glossary() {
  const [query,   setQuery]   = useState('')
  const [letter,  setLetter]  = useState(null)
  const [openTerm, setOpenTerm] = useState(null)

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

  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookIcon size={20} style={{ color: 'var(--blue)' }} /> Glosario Farmacológico
        </span>
        <span className="scnt">{filtered.length} términos</span>
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
          style={{ paddingLeft: 40 }}
        />
      </div>

      {/* Alphabet filter */}
      <div className="galpha">
        <button
          className={`abtn${!letter ? ' on' : ''}`}
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
