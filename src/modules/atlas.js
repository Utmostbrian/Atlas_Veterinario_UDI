import { sendMessage } from '../services/anthropicService'
import { DRUGS } from '../data/drugs'
import { jsonrepair } from 'jsonrepair'

function buildDrugPrompt(name) {
  return `Proporciona información farmacológica veterinaria completa sobre el fármaco "${name}".
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin bloques de código:

{
  "encontrado": true,
  "nombre": "nombre del fármaco",
  "nombreCientifico": "nombre científico / DCI",
  "categoria": "categoría farmacológica",
  "tags": ["etiqueta1", "etiqueta2"],
  "descripcion": "descripción general del fármaco y sus propiedades",
  "historia": "breve historia y desarrollo del fármaco",
  "mecanismo": "mecanismo de acción detallado",
  "indicaciones": ["indicación 1", "indicación 2"],
  "contraindicaciones": ["contraindicación 1", "contraindicación 2"],
  "efectosAdversos": ["efecto adverso 1", "efecto adverso 2"],
  "dosis": [
    {"especie": "Perro", "dosis": "5-10 mg/kg", "via": "VO", "frecuencia": "c/12h", "duracion": "5-7 días"}
  ],
  "interacciones": "descripción de interacciones farmacológicas importantes",
  "supresion": "período de supresión para animales productivos (o null si no aplica)",
  "avisoClinico": "aviso clínico importante (o null si no aplica)"
}

Si el término no corresponde a un fármaco veterinario válido, responde exactamente:
{"encontrado": false, "mensaje": "No es un fármaco veterinario reconocido"}`
}

function safeParseJSON(str) {
  try { return JSON.parse(str) } catch { /* fall through a jsonrepair */ }
  return JSON.parse(jsonrepair(str))
}

export async function searchDrugWithAI(name) {
  try {
    const text = await sendMessage({ history: [], userText: buildDrugPrompt(name) })
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { encontrado: false, mensaje: 'La IA no devolvió una respuesta estructurada.' }
    return safeParseJSON(match[0])
  } catch (e) {
    return { encontrado: false, mensaje: e.message || 'Error al consultar con la IA.' }
  }
}

export async function validateDrugWithAI(name) {
  const prompt = `¿Es "${name}" un fármaco, medicamento o principio activo real (veterinario o humano)? Responde ÚNICAMENTE con JSON sin texto extra:\n{"esFarmaco": true}\no\n{"esFarmaco": false}`
  try {
    const text = await sendMessage({ history: [], userText: prompt })
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return { esFarmaco: false }
    const parsed = safeParseJSON(match[0])
    return { esFarmaco: !!parsed.esFarmaco }
  } catch {
    return { esFarmaco: true } // si falla la IA, no bloqueamos al usuario
  }
}

export function relatedDrugs(name) {
  const drug = DRUGS.find(d => d.name.toLowerCase() === name.toLowerCase())
  if (!drug) return []
  return DRUGS.filter(d => d.id !== drug.id && d.category === drug.category).slice(0, 5)
}
