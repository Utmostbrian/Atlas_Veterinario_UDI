/**
 * Convierte markdown limitado a HTML seguro para dangerouslySetInnerHTML.
 *
 * Seguridad: escapa &, < y > ANTES de cualquier sustitución, lo que
 * impide que contenido de la IA inyecte etiquetas HTML arbitrarias.
 * Solo se insertan las etiquetas HTML que este módulo genera explícitamente.
 *
 * Soporta: **bold**, *italic*, `code`, ## ### headings, listas - * 1., tablas
 * estilo GitHub (| col | col |), saltos de línea.
 */

function splitTableRow(line) {
  // "| a | b |" → ['a', 'b']. Filtramos los vacíos del primer y último split.
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''))
}

export function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return ''

  // 1. Escapar HTML especiales (previene XSS antes de cualquier sustitución)
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // F11: extraer tablas markdown ANTES de aplicar otras transformaciones.
  // Patrón: línea de header con `|...|`, separator `|---|---|`, filas `|...|`.
  const tableHtmlByPlaceholder = new Map()
  let tableCounter = 0
  const TABLE_RE = /^\|([^\n]+)\|[ \t]*\n\|[\s:|-]+\|[ \t]*\n((?:\|[^\n]+\|[ \t]*\n?)+)/gm

  const withoutTables = escaped.replace(TABLE_RE, (_match, headerRaw, bodyRaw) => {
    const headers = splitTableRow(headerRaw)
    const rows = bodyRaw
      .split('\n')
      .filter((l) => l.trim().startsWith('|'))
      .map(splitTableRow)

    const thead = '<thead><tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>'
    const tbody = '<tbody>' + rows.map((r) =>
      '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>'

    const placeholder = ` TABLE${tableCounter++} `
    tableHtmlByPlaceholder.set(placeholder, `<table class="md-table">${thead}${tbody}</table>`)
    // Línea propia para que no se mezcle con párrafos
    return `\n\n${placeholder}\n\n`
  })

  // 2. Formato inline
  let html = withoutTables
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // 3. Encabezados
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // 4. Listas con viñeta
    .replace(/^[ \t]*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*?<\/li>\n?)+)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
    // 5. Listas numeradas
    .replace(/^[ \t]*\d+\. (.+)$/gm, '<oli>$1</oli>')
    .replace(/((?:<oli>.*?<\/oli>\n?)+)/g, (m) =>
      `<ol>${m.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>').replace(/\n/g, '')}</ol>`
    )
    // 6. Saltos de línea
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')

  // 7. Reinsertar tablas como HTML real
  for (const [placeholder, tableHtml] of tableHtmlByPlaceholder) {
    html = html.split(placeholder).join(tableHtml)
  }

  return html
}
