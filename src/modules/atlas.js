import { DRUGS, CATEGORY_MAP } from '../data/drugs'
import { sendMessage, searchDualEngine } from '../services/anthropicService'
import { parseJSONResponse, askClaudeJSON } from '../lib/jsonUtils'

function buildAtlasPrompt(name) {
  return `Eres un farmacologo veterinario experto. El usuario busca informacion sobre: "${name}".

Debes responder ESTRICTAMENTE EN ESPAÑOL. Toda la respuesta debe estar completamente en espanol, sin texto en ingles. Solo los nombres cientificos pueden ir en latin.

Usa como referencia principal "Plumb's Veterinary Drug Handbook, 10.ª edicion", pero complementa con tu propio conocimiento farmacologico veterinario. No te limites a describir — proporciona informacion clinica completa y detallada.

Si "${name}" no es un farmaco veterinario reconocido, responde: {"encontrado":false,"mensaje":"mensaje en espanol indicando que no es un farmaco reconocido"}
Si el termino esta mal escrito pero reconoces el farmaco, usalo y reporta el nombre corregido en "nombreCorregido".

Responde UNICAMENTE con este JSON exacto, sin markdown, sin texto extra, sin bloques de codigo:

{
  "encontrado":true,
  "nombre":"nombre oficial del farmaco en espanol",
  "nombreCorregido":null,
  "nombreCientifico":"DCI o sinonimo",
  "categoria":"categoria farmacologica",
  "tags":["tag1"],
  "descripcion":"descripcion extensa del farmaco, historia, usos clinicos y perfil farmacologico veterinario",
  "historia":"historia del descubrimiento o null",
  "mecanismo":"explicacion detallada del mecanismo de accion",
  "indicaciones":["indicacion 1","indicacion 2","indicacion 3"],
  "contraindicaciones":["contraindicacion 1","contraindicacion 2"],
  "efectosAdversos":["efecto adverso 1","efecto adverso 2"],
  "dosis":[{"especie":"Perro","dosis":"5 mg/kg","via":"VO","frecuencia":"c/24h","duracion":"segun indicacion"}],
  "interacciones":"texto detallado sobre interacciones farmacologicas relevantes",
  "supresion":"periodo de supresion para especies productoras de alimentos, o null si no aplica",
  "avisoClinico":"advertencia clinica importante"
}`;
}

function normalizeDoseRows(doses) {
  if (!Array.isArray(doses)) return []
  return doses
    .map(d => ({
      especie: String(d?.especie ?? '').trim(),
      dosis: String(d?.dosis ?? '').trim(),
      via: String(d?.via ?? '').trim(),
      frecuencia: String(d?.frecuencia ?? '').trim(),
      duracion: String(d?.duracion ?? '').trim() || 'segun indicacion',
    }))
    .filter(d => d.especie || d.dosis || d.via || d.frecuencia)
}

function buildLocalFallback(name) {
  const q = name.trim().toLowerCase()
  const drug = DRUGS.find(d =>
    d.name.toLowerCase() === q ||
    d.latin.toLowerCase() === q ||
    d.name.toLowerCase().includes(q) ||
    q.includes(d.name.toLowerCase())
  )

  if (!drug) {
    return {
      encontrado: false,
      mensaje: 'No es un farmaco reconocido',
      _sources: ['catalogo_local'],
    }
  }

  return {
    encontrado: true,
    nombre: drug.name,
    nombreCorregido: null,
    nombreCientifico: drug.latin,
    categoria: CATEGORY_MAP[drug.category]?.label || drug.category,
    tags: [drug.category, ...(drug.routes ? [drug.routes] : [])],
    descripcion: drug.description,
    historia: null,
    mecanismo: drug.description,
    indicaciones: [drug.description],
    contraindicaciones: drug.warnings ? [drug.warnings] : [],
    efectosAdversos: [],
    dosis: normalizeDoseRows((drug.dosages || []).map(([especie, dosis, via, frecuencia]) => ({
      especie,
      dosis,
      via,
      frecuencia,
      duracion: 'segun indicacion',
    }))),
    interacciones: drug.interactions || 'No especificadas en el catalogo local.',
    supresion: null,
    avisoClinico: 'Datos del catalogo local. Consultar Plumb\'s Veterinary Drug Handbook, 10.ª edicion para validacion clinica completa.',
    validacionClinica: {
      estado: 'insuficiente',
      fuentePrimaria: 'Catalogo local del proyecto',
      coincidencia: q === drug.name.toLowerCase() || q === drug.latin.toLowerCase() ? 'exacta' : 'probable',
      hallazgos: ['Respuesta local — sin consulta IA.'],
      advertenciasCriticas: drug.warnings ? [drug.warnings] : [],
    },
    _sources: ['catalogo_local'],
  }
}

function normalizeAtlasResponse(data, name) {
  if (!data || typeof data !== 'object') return buildLocalFallback(name)

  if (data.encontrado === false) {
    return {
      encontrado: false,
      mensaje: data.mensaje || 'No es un farmaco reconocido',
    }
  }

  return {
    encontrado: true,
    nombre: data.nombre || name,
    nombreCorregido: data.nombreCorregido ?? null,
    nombreCientifico: data.nombreCientifico || data.nombre || name,
    categoria: data.categoria || 'Farmaco veterinario validado',
    tags: Array.isArray(data.tags) ? data.tags : [],
    descripcion: data.descripcion || '',
    historia: data.historia ?? null,
    mecanismo: data.mecanismo || '',
    indicaciones: Array.isArray(data.indicaciones) ? data.indicaciones : [],
    contraindicaciones: Array.isArray(data.contraindicaciones) ? data.contraindicaciones : [],
    efectosAdversos: Array.isArray(data.efectosAdversos) ? data.efectosAdversos : [],
    dosis: normalizeDoseRows(data.dosis),
    interacciones: data.interacciones || '',
    supresion: data.supresion ?? null,
    avisoClinico: data.avisoClinico || 'Validado con Plumb\'s Veterinary Drug Handbook, 10.ª edicion.',
  }
}

export async function searchDrugWithAI(name) {
  const term = String(name || '').trim()
  if (term.length < 3) {
    return { encontrado: false, mensaje: 'El termino debe tener al menos 3 caracteres.', _sources: ['catalogo_local'] }
  }

  const messages = [{ role: 'user', content: buildAtlasPrompt(term) }]

  // 1. Intento RAG: chunks de Plumb's + Claude (traducción al español)
  try {
    const dualResult = await searchDualEngine({
      query: term,
      mode: 'drug',
      clinicalTask: 'atlas_drug',
      messages,
      maxTokens: 1200,
    })
    if (dualResult) {
      const rawText = dualResult._text || dualResult.content?.[0]?.text || ''
      const parsed = parseJSONResponse(rawText)
      if (parsed) {
        const norm = normalizeAtlasResponse(parsed, term)
        return { ...norm, _sources: dualResult._sources ?? ['vademecum'] }
      }
    }
  } catch (e) {
    console.warn('[atlas] Dual engine failed, falling back:', e.message)
  }

  // 2. Fallback: Claude directo sin RAG (modo estándar del proxy)
  try {
    const claudeFn = (p, _t) => sendMessage({ history: [], userText: p })
    const { d: parsed } = await askClaudeJSON(claudeFn, buildAtlasPrompt(term), 1200)
    if (parsed) {
      const norm = normalizeAtlasResponse(parsed, term)
      return { ...norm, _sources: ['ia_directa'] }
    }
  } catch (e) {
    console.warn('[atlas] AI search failed:', e.message)
  }

  // 3. Último recurso: catálogo local
  return buildLocalFallback(term)
}

export async function validateDrugWithAI(name) {
  const q = name.trim().toLowerCase()
  const inCatalog = DRUGS.some(d => d.name.toLowerCase() === q || d.latin.toLowerCase() === q)
  if (inCatalog) return { esFarmaco: true }

  try {
    const result = await searchDrugWithAI(name)
    return { esFarmaco: !!result?.encontrado }
  } catch {
    return { esFarmaco: false }
  }
}

export function relatedDrugs(name) {
  const drug = DRUGS.find(d => d.name.toLowerCase() === name.toLowerCase())
  if (!drug) return []
  return DRUGS.filter(d => d.id !== drug.id && d.category === drug.category).slice(0, 5)
}
