/**
 * Servicio Anthropic — Atlas Farmacológico Veterinario
 *
 * La API Key de Anthropic vive EXCLUSIVAMENTE en el servidor (Supabase Edge Function).
 * El frontend llama a /functions/v1/anthropic-proxy con el JWT del usuario. (DoD Tier 1)
 *
 * Si VITE_SUPABASE_URL no está configurada, cae back al modo directo para desarrollo
 * local con la variable VITE_ANTHROPIC_API_KEY (solo para entorno dev).
 */

import { supabase } from '../lib/supabase'

const MODELS     = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7']
const MAX_TOKENS = 1500

const SYSTEM_PROMPT = `Eres el Asistente de IA del Atlas Farmacológico Veterinario de la Facultad de Veterinaria – UDI.
Tu rol es el de un copiloto clínico veterinario experto. Respondes con precisión científica, siempre en español.

Estilo de respuesta:
- Escribe de forma clara y natural, como lo haría un médico veterinario experimentado redactando un informe profesional.
- Evita completamente el uso de asteriscos (**), guiones como viñetas (- , –) y cualquier símbolo de formato Markdown innecesario.
- Cuando necesites enumerar elementos, usa numeración (1. 2. 3.) o redacta en prosa fluida separando ideas con punto y seguido.
- Usa tablas solo cuando sean estrictamente necesarias para comparar datos.
- No uses emojis en ninguna parte de tus respuestas.
- Sé directo y conciso; cada oración debe aportar información clínica relevante.

Contenido:
- Proporciona información farmacológica basada en evidencia para uso veterinario.
- Incluye dosis, vías de administración, contraindicaciones y advertencias de seguridad.
- Menciona siempre que las dosis son orientativas y deben ajustarse por el veterinario.
- Si recibes una imagen, analiza su contenido (receta, síntoma cutáneo, etiqueta) y contextualiza tu respuesta.
- Para cálculos de dosis, muestra el razonamiento paso a paso en prosa.
- Nunca reemplaces la consulta veterinaria presencial para casos graves.

Áreas de expertise: Farmacología veterinaria, toxicología, protocolos anestésicos, antiparasitarios, antibioterapia, reproducción animal.`

// ── Obtener token de sesión para el proxy ────────────────────────────────────
async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ── URL del proxy (Edge Function) ────────────────────────────────────────────
function getProxyUrl() {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/^﻿/, '').trim()
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/anthropic-proxy`
  return null
}

// ── Llamada al proxy con fallback a modelos múltiples ────────────────────────
async function fetchViaProxy(body, signal) {
  const proxyUrl = getProxyUrl()
  const token    = await getSessionToken()

  if (!proxyUrl || !token) {
    // Modo desarrollo: llamada directa (solo si hay VITE_ANTHROPIC_API_KEY)
    return fetchDirect(body, signal)
  }

  let lastError
  for (const model of MODELS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const response = await fetch(proxyUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body:    JSON.stringify({ ...body, model }),
      signal,
    })

    if (response.status === 429) {
      throw new Error('Límite de solicitudes alcanzado. Espera un minuto.')
    }
    if (response.status === 401) {
      throw new Error('Sesión expirada. Inicia sesión de nuevo.')
    }
    if (response.status === 529 || response.status === 503) {
      lastError = new Error(`Modelo ${model} no disponible (${response.status})`)
      continue
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.error?.message || `Error HTTP ${response.status}`)
    }
    return response
  }
  throw lastError ?? new Error('Todos los modelos no están disponibles. Intenta de nuevo.')
}

// ── Fallback: modo dev con llamada directa ───────────────────────────────────
async function fetchDirect(body, signal) {
  const rawKey = import.meta.env.VITE_ANTHROPIC_API_KEY || localStorage.getItem('vet_atlas_api_key') || ''
  const apiKey = rawKey.replace(/^﻿/, '').trim()
  if (!apiKey) throw new Error('API Key no configurada. Configura VITE_ANTHROPIC_API_KEY para desarrollo.')

  let lastError
  for (const model of MODELS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body:    JSON.stringify({ ...body, model }),
      signal,
    })
    if (response.status === 529 || response.status === 503 || response.status === 429) {
      lastError = new Error(`Modelo ${model} no disponible`)
      continue
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.error?.message || `Error HTTP ${response.status}`)
    }
    return response
  }
  throw lastError ?? new Error('Todos los modelos no están disponibles.')
}

// ── Streaming SSE ─────────────────────────────────────────────────────────────
async function handleStreaming(response, onChunk) {
  const reader  = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText  = ''
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta') {
          const chunk = parsed.delta?.text ?? ''
          fullText += chunk
          onChunk(chunk, fullText)
        }
      } catch { /* ignorar SSE malformado */ }
    }
  }
  return fullText
}

// ── Helpers de contenido ──────────────────────────────────────────────────────
function buildMessages(history, userText, imageData) {
  const messages = history.map(m => ({ role: m.role, content: m.content }))
  const userContent = []
  if (imageData) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } })
  }
  userContent.push({ type: 'text', text: userText })
  messages.push({ role: 'user', content: userContent })
  return messages
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Envía un mensaje al asistente IA a través del proxy seguro de Supabase.
 * @param {{ history: Array<{role:string,content:string}>, userText: string, imageData?: {base64:string,mediaType:string}, onChunk?: (chunk:string, full:string)=>void, signal?: AbortSignal }} params
 * @returns {Promise<string>} Texto completo de la respuesta del asistente
 */
export async function sendMessage({ history, userText, imageData, onChunk, signal }) {
  const messages = buildMessages(history, userText, imageData)
  const body     = { max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages, stream: !!onChunk }
  const response = await fetchViaProxy(body, signal)
  if (onChunk) return handleStreaming(response, onChunk)
  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}

/**
 * Valida una dosis calculada usando IA y devuelve evaluación clínica.
 * @param {{ drug:string, species:string, weight:number, dose:number, unit:string, route:string }} params
 * @returns {Promise<string>} Evaluación: [SEGURA] / [REVISAR] / [PELIGROSA] con justificación
 */
export async function validateDose({ drug, species, weight, dose, unit, route }) {
  const prompt = `Valida la siguiente dosis calculada:
- Fármaco: ${drug}
- Especie: ${species}
- Peso del animal: ${weight} kg
- Dosis calculada: ${dose} ${unit}
- Vía de administración: ${route}

Evalúa:
1. ¿Está dentro del rango terapéutico establecido para esta especie?
2. ¿Existe algún riesgo de toxicidad o subdosificación?
3. ¿La vía de administración es apropiada?
4. ¿Alguna advertencia o ajuste recomendado?

Responde con: [SEGURA] / [REVISAR] / [PELIGROSA] y justificación. No uses emojis.`

  const response = await fetchViaProxy({ max_tokens: 600, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] })
  const data     = await response.json()
  return data.content?.[0]?.text ?? ''
}

export async function checkInteractions(drugs) {
  const drugList = drugs.join(', ')
  const prompt   = `Analiza las interacciones farmacológicas entre: ${drugList}.

Para cada par o combinación:
- Describe el tipo de interacción (sinergismo, antagonismo, toxicidad aditiva)
- Clasifica el riesgo: [SIN INTERACCION] / [PRECAUCION] / [CONTRAINDICADA]
- Mecanismo farmacocinético o farmacodinámico
- Recomendación clínica

Indica cuáles combinaciones son seguras para uso veterinario conjunto.`

  const response = await fetchViaProxy({ max_tokens: 1000, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] })
  const data     = await response.json()
  return data.content?.[0]?.text ?? ''
}

export async function fetchDrugProfileWithAI(drug) {
  const prompt = `Eres un farmacólogo veterinario experto. Devuelve el perfil clínico veterinario del fármaco "${drug}".
Responde EXCLUSIVAMENTE con JSON válido, sin texto adicional antes ni después.

Si "${drug}" NO es un fármaco veterinario reconocido: { "esFarmacoReal": false }

Si ES un fármaco veterinario real, devuelve:
{
  "esFarmacoReal": true,
  "name": "nombre farmacológico oficial",
  "doseUnit": "mg/kg",
  "dosageRange": {
    "Perro":   { "min": N, "max": N } o null,
    "Gato":    { "min": N, "max": N } o null,
    "Bovino":  { "min": N, "max": N } o null,
    "Equino":  { "min": N, "max": N } o null,
    "Ovino":   { "min": N, "max": N } o null,
    "Porcino": { "min": N, "max": N } o null,
    "Ave":     { "min": N, "max": N } o null
  },
  "species": ["lista de especies con indicación aprobada"],
  "allowedRoutes": ["VO (oral)", "IM (intramuscular)", "IV (intravenosa)", "SC (subcutánea)", "Tópico", "Intramamario"],
  "standardConcentrations": [números],
  "note": "advertencias clínicas o null"
}`

  const response = await fetchViaProxy({
    max_tokens: 900,
    system:     'Eres un farmacólogo veterinario experto. Respondes EXCLUSIVAMENTE con JSON válido.',
    messages:   [{ role: 'user', content: prompt }],
  })
  const data    = await response.json()
  const rawText = data.content?.[0]?.text ?? ''

  let jsonStr = rawText
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/s)
  if (fenced) jsonStr = fenced[1].trim()
  else { const plain = rawText.match(/\{[\s\S]*\}/s); if (plain) jsonStr = plain[0].trim() }

  let parsed
  try { parsed = JSON.parse(jsonStr) }
  catch { throw new Error('La IA no devolvió datos estructurados válidos. Intenta de nuevo.') }

  if (!parsed.esFarmacoReal) return null

  const VALID_ROUTES  = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario']
  const VALID_SPECIES = ['Perro', 'Gato', 'Bovino', 'Equino', 'Ovino', 'Porcino', 'Ave']

  const allowedRoutes = (parsed.allowedRoutes ?? []).filter(r => VALID_ROUTES.includes(r))
  if (!allowedRoutes.length) allowedRoutes.push('VO (oral)')

  const species = (parsed.species ?? []).filter(s => VALID_SPECIES.includes(s))
  if (!species.length) species.push('Perro')

  const dosageRange = {}
  for (const sp of VALID_SPECIES) {
    const r = parsed.dosageRange?.[sp]
    if (r && typeof r.min === 'number' && typeof r.max === 'number') dosageRange[sp] = { min: r.min, max: r.max }
  }

  return {
    name:                   parsed.name || drug,
    doseUnit:               parsed.doseUnit || 'mg/kg',
    dosageRange,
    species,
    allowedRoutes,
    standardConcentrations: (parsed.standardConcentrations ?? []).filter(n => typeof n === 'number'),
    note:                   parsed.note ?? null,
  }
}

export async function compareDrugs(drug1, drug2) {
  const prompt = `Compara farmacológicamente ${drug1} vs ${drug2} para uso veterinario.

Incluye tabla comparativa con:
| Aspecto | ${drug1} | ${drug2} |
|---------|----------|----------|
- Mecanismo de acción
- Espectro/indicaciones
- Dosis principales
- Vías de administración
- Efectos adversos
- Contraindicaciones
- Costo/disponibilidad aproximado
- Ventajas y desventajas

Conclusión: ¿Cuándo elegir uno u otro?`

  const response = await fetchViaProxy({ max_tokens: 1200, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] })
  const data     = await response.json()
  return data.content?.[0]?.text ?? ''
}
