/**
 * Convierte markdown limitado a HTML seguro para dangerouslySetInnerHTML.
 *
 * Seguridad: escapa &, < y > ANTES de cualquier sustitución, lo que
 * impide que contenido de la IA inyecte etiquetas HTML arbitrarias.
 * Solo se insertan las etiquetas HTML que este módulo genera explícitamente.
 *
 * Uso único: import { markdownToHtml } from '../../utils/markdownToHtml'
 */
export function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return ''

  return md
    // 1. Escapar caracteres HTML especiales primero (previene XSS)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 2. Formato de texto — opera sobre texto ya escapado (nunca sobre HTML)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // 3. Encabezados
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // 4. Listas — primero convierte ítems, luego agrupa en <ul>
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>[^\n]*<\/li>\n?)+)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
    // 5. Saltos de línea
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
