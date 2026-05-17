/**
 * Convierte markdown limitado a HTML seguro para dangerouslySetInnerHTML.
 *
 * Seguridad: escapa &, < y > ANTES de cualquier sustitución, lo que
 * impide que contenido de la IA inyecte etiquetas HTML arbitrarias.
 * Solo se insertan las etiquetas HTML que este módulo genera explícitamente.
 */
export function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return ''

  return md
    // 1. Escapar caracteres HTML especiales (previene XSS)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 2. Formato inline — opera sobre texto ya escapado
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // 3. Encabezados
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // 4. Listas con viñeta — convierte ítems y agrupa en <ul>
    .replace(/^[ \t]*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*?<\/li>\n?)+)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
    // 5. Listas numeradas — convierte ítems y agrupa en <ol>
    .replace(/^[ \t]*\d+\. (.+)$/gm, '<oli>$1</oli>')
    .replace(/((?:<oli>.*?<\/oli>\n?)+)/g, (m) =>
      `<ol>${m.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>').replace(/\n/g, '')}</ol>`
    )
    // 6. Saltos de línea — solo fuera de listas/encabezados
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
