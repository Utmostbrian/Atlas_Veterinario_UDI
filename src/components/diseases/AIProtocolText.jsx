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

function makeParagraph(lines) {
  return { type: 'paragraph', text: cleanInline(lines.join(' ')) }
}

function parseProtocolText(raw) {
  const lines = String(raw || '')
    .replace(/```(?:json|markdown)?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n/)

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

  return sections.filter(section => section.blocks.length)
}

function renderBlock(block, index) {
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
