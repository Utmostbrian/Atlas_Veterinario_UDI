const API_URL = 'https://api.anthropic.com/v1/messages'
const MODELS = ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-sonnet-4-6']
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

function getApiKey() {
  return (
    import.meta.env.VITE_ANTHROPIC_API_KEY ||
    localStorage.getItem('vet_atlas_api_key') ||
    ''
  )
}

function buildImageContent(base64Data, mediaType) {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: base64Data,
    },
  }
}

function buildMessages(history, userText, imageData) {
  const messages = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const userContent = []

  if (imageData) {
    userContent.push(buildImageContent(imageData.base64, imageData.mediaType))
  }

  userContent.push({ type: 'text', text: userText })

  messages.push({ role: 'user', content: userContent })
  return messages
}

async function fetchWithFallback(body, signal) {
  const apiKey = getApiKey()
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }

  let lastError
  for (const model of MODELS) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, model }),
      signal,
    })
    if (response.status === 529 || response.status === 503 || response.status === 529) {
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

export async function sendMessage({ history, userText, imageData, onChunk, signal }) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API Key no configurada. Ingresa tu API Key de Anthropic en la configuración.')
  }

  const messages = buildMessages(history, userText, imageData)

  const body = {
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
    stream: !!onChunk,
  }

  const response = await fetchWithFallback(body, signal)

  if (onChunk) {
    return handleStreaming(response, onChunk)
  }

  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}

async function handleStreaming(response, onChunk) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

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
      } catch {
        // ignore malformed SSE events
      }
    }
  }

  return fullText
}

export async function validateDose({ drug, species, weight, dose, unit, route }) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API Key no configurada.')

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

  const response = await fetchWithFallback({
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}

export async function checkInteractions(drugs) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API Key no configurada.')

  const drugList = drugs.join(', ')
  const prompt = `Analiza las interacciones farmacológicas entre: ${drugList}.

Para cada par o combinación:
- Describe el tipo de interacción (sinergismo, antagonismo, toxicidad aditiva)
- Clasifica el riesgo: [SIN INTERACCION] / [PRECAUCION] / [CONTRAINDICADA]
- Mecanismo farmacocinético o farmacodinámico
- Recomendación clínica

Indica cuáles combinaciones son seguras para uso veterinario conjunto.`

  const response = await fetchWithFallback({
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}

export async function compareDrugs(drug1, drug2) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API Key no configurada.')

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

  const response = await fetchWithFallback({
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}
