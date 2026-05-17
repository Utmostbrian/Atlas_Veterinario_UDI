// M-05: crypto.randomUUID() solo está disponible en secure contexts (HTTPS / localhost).
// En IDE previews HTTP, ngrok inseguro o navegadores viejos lanza ReferenceError.
// Fallback RFC4122 v4 con Math.random — suficientemente único para IDs de UI.
export function uid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* fall through */ }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
