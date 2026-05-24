function tryParseRelaxed(s) {
  try { return JSON.parse(s) } catch { /* noop */ }
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')) } catch { /* noop */ }
  return null
}

// Repairs a truncated JSON string by walking its structure, cutting back to the
// last safe boundary (right after a complete element/value, or before a dangling
// comma), then closing any open braces/brackets in the correct order. Returns
// the repaired JSON string, or the original if no safe cut is possible.
export function repairTruncatedJSON(input) {
  const s = String(input || '')
  if (!s) return s

  let inString = false
  let escape = false
  const opens = []
  let safeCut = -1

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; continue }
    if (c === '{' || c === '[') { opens.push(c); continue }
    if (c === '}' || c === ']') {
      opens.pop()
      // After closing an inner container, this is a safe cut boundary.
      if (opens.length >= 1) safeCut = i + 1
      continue
    }
    if (c === ',' && opens.length >= 1) {
      safeCut = i // cut BEFORE the comma — previous element was complete
      continue
    }
  }

  if (!inString && opens.length === 0) return s
  if (safeCut === -1) return s

  let result = s.slice(0, safeCut)

  // Recompute open stack on the truncated result (string state too).
  const stack = []
  let str = false, esc = false
  for (let i = 0; i < result.length; i++) {
    const c = result[i]
    if (esc) { esc = false; continue }
    if (str) {
      if (c === '\\') esc = true
      else if (c === '"') str = false
      continue
    }
    if (c === '"') { str = true; continue }
    if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
  }

  result = result.replace(/[\s,]+$/, '')

  for (let i = stack.length - 1; i >= 0; i--) {
    result += stack[i] === '{' ? '}' : ']'
  }
  return result
}

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
  let depth = 0, end = -1, inString = false, escape = false
  for (let k = 0; k < s.length; k++) {
    const ch = s[k]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === openChar) depth++
    else if (ch === closeChar) { depth--; if (depth === 0) { end = k; break } }
  }

  if (end !== -1) {
    const candidate = s.slice(0, end + 1)
    const parsed = tryParseRelaxed(candidate)
    if (parsed) return parsed
  }

  // Truncation path: attempt structural repair on the entire tail.
  const repaired = repairTruncatedJSON(s)
  const parsed = tryParseRelaxed(repaired)
  if (parsed) return parsed

  // Last-resort: cut to last close char and try.
  const last = s.lastIndexOf(closeChar)
  if (last !== -1) {
    return tryParseRelaxed(s.slice(0, last + 1))
  }
  return null
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
  raw = await fn(followUp, Math.max(1500, Math.floor((tokens || 1500) * 0.75)))
  d = parseJSONResponse(raw)
  return { d, raw }
}
