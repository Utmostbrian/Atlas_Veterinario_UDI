export function safeJSON(raw) {
  if (!raw || typeof raw !== 'string') return null
  let s = raw.trim()
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  if (objStart === -1 && arrStart === -1) return null
  const isArr = objStart === -1 ? true : arrStart === -1 ? false : arrStart < objStart
  const openChar = isArr ? '[' : '{'
  const closeChar = isArr ? ']' : '}'
  const start = s.indexOf(openChar)
  if (start === -1) return null
  s = s.slice(start)
  let depth = 0, end = -1
  for (let k = 0; k < s.length; k++) {
    if (s[k] === openChar) depth++
    else if (s[k] === closeChar) { depth--; if (depth === 0) { end = k; break } }
  }
  if (end === -1) {
    const last = s.lastIndexOf(closeChar)
    if (last === -1) return null
    s = s.slice(0, last + 1)
  } else {
    s = s.slice(0, end + 1)
  }
  try { return JSON.parse(s) }
  catch (e) {
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')) }
    catch (e2) { return null }
  }
}

export function parseJSONResponse(raw) {
  const d = safeJSON(raw)
  if (d) return d
  if (!raw || typeof raw !== 'string') return null
  const m = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  return m ? safeJSON(m[0]) : null
}

export function normalizeEnfResponse(d) {
  if (!d || typeof d !== 'object') return null
  if (Array.isArray(d.diagnostico)) {
    d.diagnostico = d.diagnostico.filter(Boolean).join('. ')
  }
  if (Array.isArray(d.prevencion)) {
    d.prevencion = d.prevencion.filter(Boolean).join('. ')
  }
  if ((!d.etiopatogenia || !String(d.etiopatogenia).trim()) && (d.causa || d.transmision)) {
    const eti = []
    if (d.causa) eti.push(d.causa)
    if (d.transmision) eti.push('Transmisión: ' + d.transmision)
    d.etiopatogenia = eti.join('. ')
  }
  if (d.protocolo && !Array.isArray(d.protocolo)) {
    if (typeof d.protocolo === 'object' && d.protocolo !== null) {
      d.protocolo = [d.protocolo]
    } else if (typeof d.protocolo === 'string') {
      const maybe = safeJSON(d.protocolo)
      if (Array.isArray(maybe)) d.protocolo = maybe
      else if (maybe && typeof maybe === 'object') d.protocolo = [maybe]
    }
  }
  if ((!d.protocolo || !Array.isArray(d.protocolo) || !d.protocolo.length) && Array.isArray(d.tratamiento) && d.tratamiento.length) {
    d.protocolo = [{
      fase: 'Tratamiento recomendado',
      farmacos: d.tratamiento.filter(Boolean).map(t => ({ nombre: t, dosis: '', via: '', frecuencia: '', duracion: '' })),
      objetivo: ''
    }]
  }
  const normalizeList = (field) => {
    if (field === undefined || field === null) return []
    if (Array.isArray(field)) return field
    if (typeof field === 'string') return field.split(/[\r\n;]+/).map(x => x.trim()).filter(Boolean)
    return [String(field)]
  }
  d.signosClinicos = normalizeList(d.signosClinicos)
  d.medidasSoporte = normalizeList(d.medidasSoporte || d.avisoClinico)
  return d
}

export async function askClaudeJSON(fn, prompt, tokens) {
  let raw = await fn(prompt, tokens)
  let d = parseJSONResponse(raw)
  if (d) return { d, raw }
  const followUp = prompt + '\n\nIMPORTANTE: Responde SOLO con JSON válido, EXACTO y sin texto adicional ni bloque de código. Si tu primera respuesta no fue JSON válido, corrígela ahora.'
  raw = await fn(followUp, Math.min(1000, tokens))
  d = parseJSONResponse(raw)
  return { d, raw }
}
