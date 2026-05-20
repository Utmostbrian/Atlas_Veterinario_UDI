/**
 * Buffer de oraciones para texto que llega por streaming.
 *
 * Acepta chunks parciales y devuelve oraciones completas en cuanto se
 * detecta un terminador (. ! ? ¡ ¿ …) seguido de espacio o fin de cadena.
 * Mantiene el resto sin emitir hasta el próximo chunk o hasta flush().
 *
 * Uso típico:
 *   const buf = createSentenceBuffer({ minLength: 12, onSentence: s => tts.enqueue(s) })
 *   onChunk: (delta, full) => buf.push(delta)
 *   onComplete: () => buf.flush()
 */
export function createSentenceBuffer({ minLength = 12, onSentence } = {}) {
  let pending = ''

  // Limpia markdown/símbolos que el TTS lee mal (asteriscos, backticks, etc.)
  const sanitize = (s) => s
    .replace(/```[\s\S]*?```/g, ' ')   // bloques de código
    .replace(/`[^`]*`/g, ' ')          // inline code
    .replace(/[*_#>~]/g, '')           // markdown markers
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')// links → solo texto
    .replace(/\s+/g, ' ')              // colapsar espacios
    .trim()

  const emit = (text) => {
    const clean = sanitize(text)
    if (clean) onSentence?.(clean)
  }

  // Busca terminadores de oración. Retorna el índice del último terminador
  // utilizable (con espacio/salto después o al final). -1 si no hay.
  const findSentenceEnd = (s) => {
    const re = /[.!?¡¿…](?=\s|$)/g
    let last = -1
    let m
    while ((m = re.exec(s)) !== null) last = m.index
    return last
  }

  return {
    /** Agrega un chunk parcial; emite oraciones completas si las hay. */
    push(chunk) {
      if (!chunk) return
      pending += chunk
      const end = findSentenceEnd(pending)
      if (end === -1) return
      // Emitir todo hasta el último terminador encontrado, si supera minLength.
      const candidate = pending.slice(0, end + 1)
      if (candidate.trim().length < minLength) return
      pending = pending.slice(end + 1)
      emit(candidate)
    },

    /** Fuerza la emisión de lo que quede pendiente. Llamar al cerrar el stream. */
    flush() {
      if (!pending.trim()) return
      emit(pending)
      pending = ''
    },

    /** Descarta todo sin emitir. */
    reset() {
      pending = ''
    },
  }
}
