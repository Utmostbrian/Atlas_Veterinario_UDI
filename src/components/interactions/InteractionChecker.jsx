import { useState } from 'react'
import { checkInteractions } from '../../services/anthropicService'
import { logInteractionCheck } from '../../services/auditService'
import { ZapIcon, SparklesIcon } from '../../Icons/Icons'
import { DRUGS } from '../../data/drugs'
import { DRUGS_DATABASE } from '../../data/drugsDatabase'

// ── Validador de nombres de fármacos (sin IA, sin costo) ──────────────────

// Sufijos exclusivos de nombres farmacéuticos — uno solo basta para aceptar
const STRONG_SUFFIXES = [
  'floxacina','floxacin','oxacina','cilina','micina','ciclina','cicline',
  'conazol','dazol','bendazol','nazol','trazol',
  'azepam','azolam','olam',
  'bital','arbital',
  'caína','caina','caine',
  'setron','pitant','prant',
  'ectina','antel',
  'tidina',
  'omidina','etomidina',
  'icam','coxib','oxib','fenac',
  'pril','sartan',
  'mab','nib',
  'glitazona','gliptin','vastatin','statina','fibrato',
  'ciclovir','avir',
]

// Sufijos comunes en fármacos (requieren longitud mínima o prefijo conocido)
const MEDIUM_SUFFIXES = [
  'ina','ine','ino',
  'ol','dol',
  'am','pam','lam',
  'ona','one',
  'ida','ide',
  'ato','ate',
  'uro','ure',
  'ilo','ile','il',
  'al','ital',
  'in','ur','ium',
]

// Prefijos de familias farmacológicas conocidas
const PHARMA_PREFIXES = [
  'cefal','cefa','cefo','cefti','ceftri','cefov','cefpod',
  'amox','ampi','diclox','oxacil','piperac',
  'enro','cipro','marbo','orbi','prado','dano','levo',
  'doxici','oxitetra','oxytetra','tetraci',
  'predni','dexa','betameta','flunix','flumeta','triamci','cortis','meto',
  'flucon','itracon','vorico','griseo','ketocon',
  'iver','fenbend','albend','prazic','nitazo','moxidec','eprinomec',
  'xilaci','xylaci','detomi','romifi','medetomi','dexmedeto',
  'ketami','tiopent','propo','alfaxa',
  'butorfa','buprenorf','fentani','morfin','tramad','codein','codeí',
  'lidoca','bupiva','mepiva',
  'ibupro','meloxic','carpro','firocox','robenacox','ketopro',
  'furosem','torsem','espiron',
  'maropita','ondanse','dolase',
  'omepra','pantopra','raniti','famoti','cimeti','sucral',
  'genta','tobra','amikaci','neomici',
  'linco','clinda','espira','tilmico','tilosi','eritromi',
  'digox','atropin','adrenal','epinef','norepin','dopami','dobuta',
  'enalapri','benazepri','amlodip',
  'progester','testoster','estradio','estrog','oxitoci','insuli',
  'fenobarb','fenobarbita',
  'aciclo','valaciclo','ganciclo','famciclo',
  'ciclospo','azatiopri','micophen',
  'aspiri','hepari','warfar','acenocum',
  'difenhidra','clorfenira','hidroxici',
  'paracetam','acetamino','metamizo',
  'ampro','toltraz','acepro','fluma',
]

// Palabras comunes que pasarían los filtros pero NO son fármacos
const NON_DRUG_WORDS = new Set([
  'medicina','vitamina','vitaminas','proteina','proteinas',
  'enzima','hormona','bacteria','pastilla','tableta',
  'capsula','inyeccion','solucion','persona','gallina',
  'cocina','vecina','gasolina','bencina','heroina',
])

const KNOWN_DRUGS = new Set([
  ...DRUGS.map(d => d.name.toLowerCase()),
  ...Object.keys(DRUGS_DATABASE).map(k => k.toLowerCase()),
])

function normalizeDrug(name) {
  return name.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function isDrugName(name) {
  const raw = name.trim()
  if (raw.length < 3) return false
  if (/^\d+$/.test(raw)) return false
  if (!/[a-záéíóúñ]/i.test(raw)) return false

  const norm = normalizeDrug(raw)
  const len  = norm.length

  // Base de datos local → aceptar de inmediato
  if (KNOWN_DRUGS.has(norm)) return true

  // Lista negra de palabras comunes
  if (NON_DRUG_WORDS.has(norm)) return false

  // Sufijo fuerte → aceptar
  for (const suf of STRONG_SUFFIXES) {
    if (norm.endsWith(suf) && len >= suf.length + 2) return true
  }

  // Prefijo farmacológico conocido → aceptar si longitud razonable
  const hasPrefix = PHARMA_PREFIXES.some(p => norm.startsWith(p))
  if (hasPrefix && len >= 6) return true

  // Sufijo medio + prefijo O longitud suficiente
  for (const suf of MEDIUM_SUFFIXES) {
    if (norm.endsWith(suf) && len >= suf.length + 4) {
      if (hasPrefix || len >= 8) return true
    }
  }

  return false
}

export default function InteractionChecker() {
  const [input,      setInput]      = useState('')
  const [drugs,      setDrugs]      = useState([])
  const [result,     setResult]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [inputError, setInputError] = useState('')

  function addDrug() {
    const name = input.trim()
    if (!name) return

    if (drugs.some(d => d.toLowerCase() === name.toLowerCase())) {
      setInputError('Este fármaco ya está en la lista.')
      return
    }

    if (!isDrugName(name)) {
      setInputError(`"${name}" no es un fármaco reconocido. Verifica el nombre o la ortografía.`)
      return
    }

    setInputError('')
    setDrugs(prev => [...prev, name])
    setInput('')
    setResult('')
  }

  function removeDrug(name) {
    setDrugs(prev => prev.filter(d => d !== name))
    setResult('')
  }

  async function handleCheck() {
    if (drugs.length < 2) return
    setLoading(true); setError(''); setResult('')
    try {
      const text = await checkInteractions(drugs)
      setResult(text)
      logInteractionCheck(drugs)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addDrug() }
  }


  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ZapIcon size={20} style={{ color: 'var(--blue)' }} /> Verificador de Interacciones
        </span>
        <span className="scnt">Análisis con IA</span>
      </div>

      <div className="cgrid">
        {/* Left: input */}
        <div className="card2">
          <div className="ch">Fármacos a verificar</div>
          <div className="cb">
            <div className="iarow">
              <input
                id="interaction-drug-input"
                aria-label="Nombre del fármaco a agregar"
                placeholder="Nombre del fármaco..."
                value={input}
                onChange={e => { setInput(e.target.value); setInputError('') }}
                onKeyDown={handleKeyDown}
              />
              <button onClick={addDrug} disabled={!input.trim()}>
                + Agregar
              </button>
            </div>

            {inputError && (
              <div className="abox rr" style={{ marginTop: 6, padding: '6px 10px', fontSize: '.81rem' }}>
                {inputError}
              </div>
            )}

            <div className="idlist">
              {drugs.length === 0 && (
                <span style={{ fontSize: '.79rem', color: 'var(--gray)', fontStyle: 'italic' }}>
                  Agrega al menos 2 fármacos...
                </span>
              )}
              {drugs.map(d => (
                <div key={d} className="idc">
                  {d}
                  <button onClick={() => removeDrug(d)}>×</button>
                </div>
              ))}
            </div>

            {drugs.length < 2 && drugs.length > 0 && (
              <p style={{ fontSize: '.79rem', color: 'var(--soft)', marginBottom: 8 }}>
                Agrega al menos un fármaco más para analizar.
              </p>
            )}

            <button
              className="btnp"
              onClick={handleCheck}
              disabled={drugs.length < 2 || loading}
            >
              <SparklesIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {loading
                ? 'Analizando interacciones...'
                : `Analizar ${drugs.length} fármaco${drugs.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

        {/* Right: result */}
        <div className="card2">
          <div className="ch">Resultado del Análisis</div>
          <div className="cb">
            {!result && !loading && !error && (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--soft)' }}>
                <div style={{ fontSize: 2.5 + 'rem', marginBottom: 12, color: 'var(--blue)' }}><ZapIcon size={40} /></div>
                <p style={{ fontSize: '.88rem', marginBottom: 8 }}>El análisis de interacciones aparecerá aquí.</p>
                <p style={{ fontSize: '.79rem' }}>
                  Sin interacción &nbsp;|&nbsp; Precaución &nbsp;|&nbsp; Contraindicada
                </p>
              </div>
            )}

            {loading && (
              <div className="ld">
                <div className="sp" />
                <p>Analizando {drugs.length} fármacos con IA...</p>
              </div>
            )}

            {error && (
              <div className="wbox" style={{ marginBottom: 0 }}>
                <span>!</span>
                <span><strong>Error:</strong> {error}</span>
              </div>
            )}

            {result && (
              <div>
                <div className="crtitle">Análisis: {drugs.join(' + ')}</div>
                <div
                  className="ai-response"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(result) }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function markdownToHtml(md) {
  if (!md) return ''
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>[^\n]*<\/li>\n?)+)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
