import { sendMessage } from '../services/anthropicService'
import { DISEASES } from '../data/diseases'
import { jsonrepair } from 'jsonrepair'

function buildDiseasePrompt(name) {
  return `Proporciona el protocolo clínico veterinario completo para la enfermedad "${name}".
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin bloques de código:

{
  "status": "ok",
  "nombre": "nombre de la enfermedad",
  "diagnostico": "diagnóstico diferencial y etiología detallada",
  "signosClinicos": ["signo clínico 1", "signo clínico 2"],
  "fases": [
    {
      "titulo": "Fase 1: Tratamiento inicial",
      "objetivo": "objetivo de esta fase o null",
      "farmacos": [
        {"nombre": "Nombre del fármaco", "dosis": "dosis", "via": "IV", "frecuencia": "c/12h", "duracion": "3-5 días"}
      ]
    }
  ],
  "medidasSoporte": ["medida de soporte 1", "medida de soporte 2"],
  "pronostico": "pronóstico clínico y medidas de prevención"
}

Si el término no es una enfermedad veterinaria válida responde: {"status": "not-found"}
Si no puedes estructurar el protocolo completo responde: {"status": "bad-format", "rawText": "información disponible en texto libre"}`
}

function safeParseJSON(str) {
  try { return JSON.parse(str) } catch { /* fall through a jsonrepair */ }
  return JSON.parse(jsonrepair(str))
}

export async function searchDiseaseWithAI(name) {
  try {
    const text = await sendMessage({ history: [], userText: buildDiseasePrompt(name) })
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { status: 'bad-format', rawText: text }
    const parsed = safeParseJSON(match[0])
    return normalizeDiseaseResponse(parsed)
  } catch (e) {
    return { status: 'error', mensaje: e.message || 'Error al consultar el protocolo.' }
  }
}

export function normalizeDiseaseResponse(data) {
  if (!data || typeof data !== 'object') return { status: 'bad-format', rawText: '' }
  if (!data.status) {
    if (data.nombre && Array.isArray(data.fases)) return { ...data, status: 'ok' }
    return { status: 'bad-format', rawText: JSON.stringify(data, null, 2) }
  }
  return data
}

export function buildLocalFallback(name) {
  const disease = DISEASES.find(
    d =>
      d.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(d.name.toLowerCase())
  )
  if (!disease) return { name, drugs: [], protocol: null }
  return { name: disease.name, drugs: disease.drugs, protocol: disease.protocol }
}
