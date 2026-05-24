import { parseJSONResponse, normalizeEnfResponse } from '../../lib/jsonUtils'

const DEFAULT_TITLE = 'Protocolo clinico generado por IA'

function cleanInline(value) {
  return String(value || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function stripHeadingMarker(line) {
  return cleanInline(line)
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/[:：]\s*$/, '')
    .trim()
}

function isHeading(line) {
  const text = line.trim()
  if (!text) return false
  if (/^#{1,6}\s+\S/.test(text)) return true
  if (/^\d+\.\s+[A-ZÁÉÍÓÚÑ]/.test(text) && text.length <= 90) return true
  if (/^(diagn[oó]stico|etiolog[ií]a|signos|tratamiento|fase|f[aá]rmacos|soporte|pron[oó]stico|prevenci[oó]n|advertencias?|manejo|control)\b/i.test(text)) {
    return text.length <= 120
  }
  return /^[A-ZÁÉÍÓÚÑ][^.!?]{4,80}:\s*$/.test(text)
}

function isListItem(line) {
  return /^\s*(?:[-*•]\s+|\d+[.)]\s+)/.test(line)
}

function listText(line) {
  return cleanInline(line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, ''))
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cleanInline(cell))
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function readTable(lines, index) {
  if (!lines[index]?.includes('|') || !isTableSeparator(lines[index + 1] || '')) {
    return null
  }

  const headers = splitTableRow(lines[index])
  const rows = []
  let cursor = index + 2

  while (cursor < lines.length && lines[cursor].includes('|') && lines[cursor].trim()) {
    rows.push(splitTableRow(lines[cursor]))
    cursor += 1
  }

  return { block: { type: 'table', headers, rows }, nextIndex: cursor }
}

function looksLikeJsonPayload(raw) {
  const text = String(raw || '').trim()
  if (!text) return false
  if (/^```(?:json)?\s*(?:\[|\{)/i.test(text)) return true
  if (/^(?:\[|\{)/.test(text)) return true
  if (/"(?:status|nombre|diagnostico|signosClinicos|fases|farmacos|medidasSoporte|pronostico|titulo|objetivo)"\s*:/i.test(text)) return true
  // any pair of `"key": "value"` or `"key": [`, etc.
  if (/"[A-Za-zÁÉÍÓÚáéíóúñÑ_][\w-]*"\s*:\s*(?:"|\[|\{|\d|true|false|null)/.test(text)) return true
  return false
}

function lineLooksJsonish(line) {
  const t = line.trim()
  if (!t) return false
  if (/^[\{\[\}\]]/.test(t)) return true
  if (/^"[^"]+"\s*:/.test(t)) return true
  return false
}

function valueToText(value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('; ')
  if (typeof value === 'object') return Object.values(value).map(valueToText).filter(Boolean).join(' | ')
  return cleanInline(value)
}

function asList(value) {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\r\n;]+/).map(cleanInline).filter(Boolean)
  return [valueToText(value)].filter(Boolean)
}

function getFases(data) {
  const fases = Array.isArray(data.fases) ? data.fases : Array.isArray(data.protocolo) ? data.protocolo : []
  return fases.map((fase, index) => {
    if (!fase || typeof fase !== 'object') {
      return { titulo: `Fase ${index + 1}`, objetivo: valueToText(fase), farmacos: [] }
    }
    return {
      titulo: valueToText(fase.titulo || fase.fase) || `Fase ${index + 1}`,
      objetivo: valueToText(fase.objetivo || fase.descripcion),
      farmacos: Array.isArray(fase.farmacos) ? fase.farmacos : [],
    }
  })
}

function drugRow(drug) {
  if (!drug || typeof drug !== 'object') return [valueToText(drug), '', '', '', '']
  return [
    drug.nombre || drug.farmaco || drug.medicamento,
    drug.dosis,
    drug.via,
    drug.frecuencia,
    drug.duracion,
  ].map(valueToText)
}

function parseJsonProtocolText(raw) {
  const parsed = parseJSONResponse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const data = normalizeEnfResponse({ ...parsed })
  if (data.status === 'not-found') {
    return [{
      title: DEFAULT_TITLE,
      blocks: [{ type: 'paragraph', text: 'No se reconoce como enfermedad veterinaria valida.' }],
    }]
  }

  if (data.status && data.status !== 'ok' && data.status !== 'text') return null

  const sections = []
  const diagnostico = valueToText(data.diagnostico || data.etiopatogenia)
  if (diagnostico) {
    sections.push({ title: 'Diagnostico y Etiologia', blocks: [{ type: 'paragraph', text: diagnostico }] })
  }

  const signos = asList(data.signosClinicos || data.signos)
  if (signos.length) {
    sections.push({ title: 'Signos Clinicos', blocks: [{ type: 'list', items: signos }] })
  }

  getFases(data).forEach(fase => {
    const blocks = []
    if (fase.objetivo) blocks.push({ type: 'paragraph', text: fase.objetivo })
    const rows = fase.farmacos.map(drugRow).filter(row => row.some(Boolean))
    if (rows.length) {
      blocks.push({
        type: 'table',
        headers: ['Farmaco', 'Dosis', 'Via', 'Frecuencia', 'Duracion'],
        rows,
      })
    }
    if (blocks.length) sections.push({ title: fase.titulo, blocks })
  })

  const soporte = asList(data.medidasSoporte || data.soporte || data.manejo)
  if (soporte.length) {
    sections.push({ title: 'Medidas de Soporte', blocks: [{ type: 'list', items: soporte }] })
  }

  const pronostico = [data.pronostico, data.prevencion].map(valueToText).filter(Boolean).join(' ')
  if (pronostico) {
    sections.push({ title: 'Pronostico y Prevencion', blocks: [{ type: 'paragraph', text: pronostico }] })
  }

  return sections.length ? sections : null
}

function makeParagraph(lines) {
  return { type: 'paragraph', text: cleanInline(lines.join(' ')) }
}

function badFormatSections() {
  return [{
    title: DEFAULT_TITLE,
    blocks: [{
      type: 'notice',
      text: 'La IA devolvio un formato tecnico incompleto. Vuelve a consultar para regenerar el protocolo en formato clinico legible.',
    }],
  }]
}

function parseProtocolText(raw) {
  const jsonSections = parseJsonProtocolText(raw)
  if (jsonSections) return jsonSections

  if (looksLikeJsonPayload(raw)) return badFormatSections()

  const lines = String(raw || '')
    .replace(/```(?:json|markdown)?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n/)
    .filter(line => !lineLooksJsonish(line))

  const sections = []
  let current = { title: DEFAULT_TITLE, blocks: [] }
  let paragraph = []
  let list = []

  function flushParagraph() {
    if (!paragraph.length) return
    const block = makeParagraph(paragraph)
    if (block.text) current.blocks.push(block)
    paragraph = []
  }

  function flushList() {
    if (!list.length) return
    current.blocks.push({ type: 'list', items: list })
    list = []
  }

  function flushSection() {
    flushParagraph()
    flushList()
    if (current.blocks.length || sections.length === 0) sections.push(current)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const table = readTable(lines, i)
    if (table) {
      flushParagraph()
      flushList()
      current.blocks.push(table.block)
      i = table.nextIndex - 1
      continue
    }

    if (isHeading(trimmed)) {
      flushSection()
      current = { title: stripHeadingMarker(trimmed), blocks: [] }
      continue
    }

    if (isListItem(line)) {
      flushParagraph()
      list.push(listText(line))
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushSection()

  const clean = sections
    .map(section => ({
      ...section,
      blocks: section.blocks.filter(block => {
        if (block.type !== 'paragraph') return true
        return !looksLikeJsonPayload(block.text)
      }),
    }))
    .filter(section => section.blocks.length)

  if (!clean.length) return badFormatSections()
  return clean
}

function renderBlock(block, index) {
  if (block.type === 'notice') {
    return (
      <div key={index} className="abox o">
        <p>{block.text}</p>
      </div>
    )
  }

  if (block.type === 'list') {
    return (
      <ul key={index}>
        {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
      </ul>
    )
  }

  if (block.type === 'table') {
    return (
      <table key={index} className="dtbl">
        <thead>
          <tr>
            {block.headers.map((header, headerIndex) => <th key={headerIndex}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {block.headers.map((_, cellIndex) => (
                <td key={cellIndex}>{row[cellIndex] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return <p key={index}>{block.text}</p>
}

export default function AIProtocolText({ text }) {
  const sections = parseProtocolText(text)
  if (!sections.length) return null

  return (
    <>
      {sections.map((section, index) => (
        <div key={`${section.title}-${index}`} className="aisec">
          <h3>{section.title}</h3>
          {section.blocks.map(renderBlock)}
        </div>
      ))}
    </>
  )
}
