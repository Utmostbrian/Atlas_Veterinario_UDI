/**
 * Servicio de Auditoría / Historial de Consultas
 *
 * Arquitectura dual:
 * 1. localStorage  → Funciona sin backend (demo/feria)
 * 2. Backend REST  → Llama a Procedimientos Almacenados en el servidor
 *
 * Para activar el backend, establece VITE_BACKEND_URL en .env
 */

const STORAGE_KEY = 'vet_atlas_audit_log'
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || null

/* ───────────────────────── Tipos de eventos ───────────────────────── */
export const EVENT_TYPES = {
  DRUG_SEARCH:      'DRUG_SEARCH',
  DOSE_CALCULATED:  'DOSE_CALCULATED',
  DOSE_VALIDATED:   'DOSE_VALIDATED',
  AI_CONSULTATION:  'AI_CONSULTATION',
  PRESCRIPTION_GEN: 'PRESCRIPTION_GEN',
  INTERACTION_CHECK:'INTERACTION_CHECK',
}

/* ───────────────────────── Helpers localStorage ───────────────────── */
function readLog() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeLog(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/* ───────────────────────── Core: registrar evento ─────────────────── */
export async function logEvent(eventType, payload) {
  const entry = {
    id:        generateId(),
    timestamp: new Date().toISOString(),
    eventType,
    ...payload,
  }

  // Guardar localmente siempre (cache offline)
  const log = readLog()
  log.unshift(entry)
  if (log.length > 500) log.splice(500) // cap 500 registros
  writeLog(log)

  // Si hay backend configurado, sincronizar
  if (BACKEND_URL) {
    syncToBackend(entry).catch(console.warn)
  }

  return entry
}

/**
 * syncToBackend → llama al endpoint REST que internamente
 * ejecuta un Stored Procedure.
 *
 * Ejemplo de SP en SQL Server:
 *   EXEC sp_InsertAuditLog @EventType, @DrugName, @Species, @Weight,
 *                          @DoseCalculated, @UserId, @Timestamp
 */
async function syncToBackend(entry) {
  const response = await fetch(`${BACKEND_URL}/audit/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
  if (!response.ok) throw new Error(`Backend sync failed: ${response.status}`)
  return response.json()
}

/* ───────────────────────── Consultar historial ─────────────────────── */
export async function getHistory({ limit = 50, offset = 0, eventType, search } = {}) {
  // Si hay backend, consultar desde allí (SP de lectura)
  if (BACKEND_URL) {
    try {
      const params = new URLSearchParams({ limit, offset })
      if (eventType) params.set('eventType', eventType)
      if (search)    params.set('search', search)
      const res = await fetch(`${BACKEND_URL}/audit/history?${params}`)
      if (res.ok) return res.json()
    } catch {
      // fallback a localStorage
    }
  }

  // Fallback: localStorage
  let log = readLog()
  if (eventType) log = log.filter((e) => e.eventType === eventType)
  if (search) {
    const q = search.toLowerCase()
    log = log.filter(
      (e) =>
        e.drugName?.toLowerCase().includes(q) ||
        e.species?.toLowerCase().includes(q) ||
        e.query?.toLowerCase().includes(q)
    )
  }
  return {
    total: log.length,
    items: log.slice(offset, offset + limit),
  }
}

/* ───────────────────────── Helpers especializados ──────────────────── */
export function logDrugSearch(drugName, species) {
  return logEvent(EVENT_TYPES.DRUG_SEARCH, { drugName, species })
}

export function logDoseCalculation(data) {
  // Normalize field names for consistency: drug → drugName, totalMg → doseCalculated
  return logEvent(EVENT_TYPES.DOSE_CALCULATED, {
    drugName:       data.drug,
    doseCalculated: data.totalMg,
    ...data,
  })
}

export function logInteractionCheck(drugs) {
  return logEvent(EVENT_TYPES.INTERACTION_CHECK, {
    query:    drugs.join(', '),
    drugName: drugs[0] || '',
  })
}

export function logDoseValidation(data) {
  return logEvent(EVENT_TYPES.DOSE_VALIDATED, data)
}

export function logAiConsultation(query, summary) {
  return logEvent(EVENT_TYPES.AI_CONSULTATION, {
    query,
    summary: summary?.slice(0, 200),
  })
}

export function logPrescription(data) {
  return logEvent(EVENT_TYPES.PRESCRIPTION_GEN, data)
}

/* ───────────────────────── Estadísticas ───────────────────────────── */
export function getStats() {
  const log = readLog()
  const today = new Date().toDateString()
  return {
    total:          log.length,
    today:          log.filter((e) => new Date(e.timestamp).toDateString() === today).length,
    byType:         Object.fromEntries(
      Object.values(EVENT_TYPES).map((t) => [t, log.filter((e) => e.eventType === t).length])
    ),
    mostSearched:   getMostFrequent(log.filter((e) => e.drugName).map((e) => e.drugName)),
  }
}

function getMostFrequent(arr) {
  if (!arr.length) return null
  const freq = arr.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {})
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0]
}

/* ───────────────────────── Exportar CSV ───────────────────────────── */
export function exportToCsv() {
  const log = readLog()
  if (!log.length) return

  const headers = ['ID', 'Fecha', 'Tipo', 'Fármaco', 'Especie', 'Peso', 'Dosis / Consulta']
  const rows = log.map((e) => [
    e.id,
    new Date(e.timestamp).toLocaleString('es-BO'),
    e.eventType,
    e.drugName || e.drug || '',
    e.species || '',
    e.weight ? `${e.weight} kg` : '',
    e.doseCalculated ? `${e.doseCalculated} mg (${e.volMl || ''} mL)` : (e.query?.slice(0, 80) || ''),
  ])

  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `historial_atlas_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ───────────────────────── Limpiar historial ───────────────────────── */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY)
}
