/**
 * AI Search Guards — Atlas Veterinario
 *
 * Capa cliente compartida por el buscador de fármacos y el de enfermedades
 * cuando el término no aparece en el catálogo local y se decide consultar
 * a la IA. Cubre tres preocupaciones:
 *   1) Validación de entrada (longitud, charset, anti-spam, anti-inyección)
 *   2) Rate limit cliente por sesión (sessionStorage)
 *   3) Caché de respuestas por término (localStorage, TTL 24h)
 *
 * No reemplaza las restricciones del Edge Function anthropic-proxy
 * (auth obligatoria, rate limit por user_id + IP, allowlist de modelos,
 * límite de payload) — es defensa en profundidad.
 */

const MIN_LEN = 3
const MAX_LEN = 60

// Whitelist estricta: letras latinas (con acentos y ñ), dígitos, espacios,
// punto, guion y guión bajo. Bloquea comillas, llaves, paréntesis, signos
// de control y caracteres no imprimibles usados en payloads de inyección.
const ALLOWED_CHARS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ._\-]+$/

// Patrones típicos de prompt injection / jailbreak. No exhaustivos —
// la prompt en sí también valida el contenido server-side via IA.
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|above|prior|all)/i,
  /disregard\s+(your|the|all|previous)/i,
  /forget\s+(everything|all|previous|your)/i,
  /system\s*[:>]/i,
  /<\s*\/?\s*(user|assistant|system|im_start|im_end)\s*>/i,
  /jailbreak/i,
  /\bsudo\b/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /act\s+as\s+(if|a|an)/i,
  /role\s*[:=]\s*system/i,
  /developer\s+mode/i,
  /\bDAN\b/,                 // "Do Anything Now"
  /override/i,
]

/**
 * Valida la entrada del usuario antes de enviarla a la IA.
 * Aplica heurísticas para detectar entradas "que no parecen palabra real" y
 * así evitar consumo innecesario de tokens.
 *
 * @param {string} raw
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateAISearchInput(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'Entrada inválida.' }
  const q = raw.trim()
  if (q.length < MIN_LEN) {
    return { ok: false, reason: `El término debe tener al menos ${MIN_LEN} caracteres.` }
  }
  if (q.length > MAX_LEN) {
    return { ok: false, reason: `El término no puede exceder ${MAX_LEN} caracteres.` }
  }
  if (!ALLOWED_CHARS.test(q)) {
    return { ok: false, reason: 'Solo se permiten letras, números, espacios, puntos y guiones.' }
  }
  const letters = q.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g) ?? []
  if (letters.length < 3) {
    return { ok: false, reason: 'El término debe contener al menos 3 letras.' }
  }
  // Heurística "parece palabra real": al menos 60% letras (sobre chars no espacio)
  const nonSpaceLen = q.replace(/\s/g, '').length
  if (letters.length / nonSpaceLen < 0.6) {
    return { ok: false, reason: 'El término no parece un nombre de fármaco o enfermedad válido.' }
  }
  // Debe contener al menos una vocal (filtra "rgrgrg", "xqzxqz", etc.)
  if (!/[aeiouáéíóúü]/i.test(q)) {
    return { ok: false, reason: 'El término no parece un nombre válido (sin vocales).' }
  }
  // Anti-spam: máximo 3 caracteres iguales consecutivos
  if (/(.)\1{3,}/.test(q)) {
    return { ok: false, reason: 'El término contiene demasiados caracteres repetidos.' }
  }
  // Anti prompt injection
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(q)) {
      return { ok: false, reason: 'Término no permitido. Solo nombres de fármacos o enfermedades.' }
    }
  }
  return { ok: true }
}

// ── Fuzzy match contra catálogo (Levenshtein) ───────────────────────────────
// Si el término se parece a algo del catálogo local (típico typo) preferimos
// sugerir la entrada local en vez de gastar tokens en la IA.

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

/**
 * Busca en una lista de nombres del catálogo el más cercano al término dado.
 * Devuelve null si ninguno está suficientemente cerca.
 *
 * Umbral dinámico según longitud:
 *   - <= 5 chars  → distancia ≤ 1
 *   - 6-10 chars  → distancia ≤ 2
 *   - > 10 chars  → distancia ≤ 3
 *
 * @param {string} term
 * @param {string[]} catalogNames
 * @returns {string|null}
 */
export function findCatalogSuggestion(term, catalogNames) {
  const q = normalizeTerm(term)
  if (q.length < MIN_LEN) return null

  const maxDist = q.length <= 5 ? 1 : q.length <= 10 ? 2 : 3
  let bestName = null
  let bestDist = Infinity

  for (const name of catalogNames) {
    const candidate = normalizeTerm(name)
    if (candidate === q) return null // match exacto: no es sugerencia, ya existe
    // Optimización: si la diferencia de longitudes ya supera el umbral, saltar
    if (Math.abs(candidate.length - q.length) > maxDist) continue
    const d = levenshtein(q, candidate)
    if (d <= maxDist && d < bestDist) {
      bestDist = d
      bestName = name
    }
  }
  return bestName
}

/**
 * Verifica match exacto (insensible a mayúsculas/acentos) contra una lista.
 */
export function isExactInDictionary(term, names) {
  const q = normalizeTerm(term)
  return names.some(name => normalizeTerm(name) === q)
}

/**
 * Verifica si el término encaja con algún patrón de sufijo dado.
 * Los patrones son regex con $ al final.
 */
export function matchesAnyPattern(term, patterns) {
  const q = term.trim()
  return patterns.some(p => p.test(q))
}

/**
 * Decide si un término es plausible para ser consultado por IA.
 *
 * Reglas: pasa si CUALQUIERA de estas es verdadera:
 *   1) Match exacto en diccionario extendido (es un nombre conocido)
 *   2) Encaja con un patrón farmacéutico/médico típico (sufijo DCI/clínico)
 *
 * Si ninguna se cumple → falsa: la consulta IA se bloquea.
 *
 * @param {string} term
 * @param {string[]} dictionary    Lista extendida (EXTENDED_DRUG_NAMES o EXTENDED_DISEASE_NAMES)
 * @param {RegExp[]} patterns      Lista de sufijos típicos
 * @returns {{ allowed: boolean, reason: 'exact'|'pattern'|null }}
 */
export function isAISearchAllowed(term, dictionary, patterns) {
  if (isExactInDictionary(term, dictionary)) {
    return { allowed: true, reason: 'exact' }
  }
  if (matchesAnyPattern(term, patterns)) {
    return { allowed: true, reason: 'pattern' }
  }
  return { allowed: false, reason: null }
}

// ── Rate limit cliente ──────────────────────────────────────────────────────
const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60_000

function rateLimitKey(category) {
  return `vet_ai_ratelimit_${category}`
}

/**
 * Comprueba y consume una unidad del cuenta-regresiva de la categoría.
 * @param {'drug'|'disease'} category
 * @returns {{ ok: boolean, retryInSec?: number }}
 */
export function consumeClientRateLimit(category) {
  try {
    const now = Date.now()
    const raw = sessionStorage.getItem(rateLimitKey(category))
    let entry = raw ? JSON.parse(raw) : null
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW }
      sessionStorage.setItem(rateLimitKey(category), JSON.stringify(entry))
      return { ok: true }
    }
    if (entry.count >= RATE_LIMIT_MAX) {
      const retryInSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      return { ok: false, retryInSec }
    }
    entry.count++
    sessionStorage.setItem(rateLimitKey(category), JSON.stringify(entry))
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

// ── Caché 24h por término ───────────────────────────────────────────────────
const CACHE_TTL_MS    = 24 * 60 * 60 * 1000
const CACHE_MAX_ITEMS = 50

function cacheKey(category) {
  return `vet_ai_cache_${category}`
}

function readCache(category) {
  try {
    const raw = localStorage.getItem(cacheKey(category))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function writeCache(category, store) {
  try {
    localStorage.setItem(cacheKey(category), JSON.stringify(store))
  } catch {
    try { localStorage.removeItem(cacheKey(category)) } catch { /* ignore */ }
  }
}

function normalizeTerm(term) {
  return String(term).toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function getCachedAIResult(category, term) {
  const key   = normalizeTerm(term)
  const store = readCache(category)
  const entry = store[key]
  if (!entry) return null
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) return null
  return entry.data
}

export function setCachedAIResult(category, term, data) {
  const key   = normalizeTerm(term)
  const store = readCache(category)
  store[key] = { savedAt: Date.now(), data }
  const keys = Object.keys(store)
  if (keys.length > CACHE_MAX_ITEMS) {
    const sorted   = keys.sort((a, b) => store[a].savedAt - store[b].savedAt)
    const toRemove = sorted.slice(0, keys.length - CACHE_MAX_ITEMS)
    toRemove.forEach(k => delete store[k])
  }
  writeCache(category, store)
}
