/**
 * Servicio de Auditoría — Atlas Farmacológico Veterinario
 *
 * Arquitectura dual (DoD Punto 3):
 * 1. Supabase (PostgreSQL) — fuente de verdad en el servidor, inmutable por el cliente
 * 2. localStorage           — caché offline; se usa si Supabase no está disponible
 *
 * Idempotencia: cada evento lleva un event_id único para evitar duplicados
 * en reintentos (equivalente al patrón del sp_InsertAuditLog del DoD).
 */

import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'vet_atlas_audit_log'

export const EVENT_TYPES = {
  DRUG_SEARCH:      'DRUG_SEARCH',
  DOSE_CALCULATED:  'DOSE_CALCULATED',
  DOSE_VALIDATED:   'DOSE_VALIDATED',
  AI_CONSULTATION:  'AI_CONSULTATION',
  PRESCRIPTION_GEN: 'PRESCRIPTION_GEN',
  INTERACTION_CHECK:'INTERACTION_CHECK',
}

// ── localStorage helpers (caché offline) ────────────────────────────────────
function readLocalLog() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function writeLocalLog(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 500)))
}

// ── Normalizar filas de Supabase al formato del componente ──────────────────
function fromDb(row) {
  return {
    id:             row.id,
    timestamp:      row.created_at,
    eventType:      row.event_type,
    drugName:       row.drug_name  ?? null,
    species:        row.species    ?? null,
    weight:         row.weight_kg  ?? null,
    doseCalculated: row.dose_calculated ?? null,
    volMl:          row.vol_ml    ?? null,
    route:          row.route     ?? null,
    query:          row.query_text ?? null,
    summary:        row.summary   ?? null,
  }
}

// ── Core: registrar evento ───────────────────────────────────────────────────
export async function logEvent(eventType, payload) {
  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // 1. Guardar en localStorage inmediatamente (experiencia sin latencia)
  const localEntry = {
    id:        eventId,
    timestamp: new Date().toISOString(),
    eventType,
    ...payload,
  }
  const log = readLocalLog()
  log.unshift(localEntry)
  writeLocalLog(log)

  // 2. Persistir en Supabase de forma asíncrona (patrón post-response, DoD 3.2)
  //    No await: nunca bloquea al usuario (equivalente a setImmediate del DoD)
  persistToSupabase(eventId, eventType, payload).catch(() => {
    // Fallo silencioso: el usuario ya tiene el resultado, el log queda en caché local
  })

  return localEntry
}

async function persistToSupabase(eventId, eventType, payload) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.rpc('sp_insert_audit_log', {
    p_event_id:        eventId,
    p_user_id:         user.id,
    p_event_type:      eventType,
    p_drug_name:       payload.drugName  ?? payload.drug ?? null,
    p_species:         payload.species   ?? null,
    p_weight_kg:       payload.weight    ?? null,
    p_dose_calculated: payload.doseCalculated ?? payload.totalMg ?? null,
    p_vol_ml:          payload.volMl     ?? null,
    p_query_text:      payload.query     ?? null,
    p_summary:         payload.summary?.slice(0, 200) ?? null,
    p_metadata:        {},
  })
}

// ── Consultar historial ──────────────────────────────────────────────────────
export async function getHistory({ limit = 50, offset = 0, eventType, search } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No hay sesión activa')

    const isAdmin = await checkIsAdmin(user.id)

    const { data, error } = await supabase.rpc('sp_get_audit_history', {
      p_user_id:    user.id,
      p_limit:      limit,
      p_offset:     offset,
      p_event_type: eventType ?? null,
      p_search:     search    ?? null,
      p_admin_view: isAdmin,
    })

    if (error) throw error

    const total = data?.[0]?.total_count ?? 0
    return { total, items: (data ?? []).map(fromDb) }
  } catch {
    // Fallback a localStorage
    let log = readLocalLog()
    if (eventType) log = log.filter(e => e.eventType === eventType)
    if (search) {
      const q = search.toLowerCase()
      log = log.filter(e =>
        e.drugName?.toLowerCase().includes(q) ||
        e.species?.toLowerCase().includes(q)  ||
        e.query?.toLowerCase().includes(q)
      )
    }
    return { total: log.length, items: log.slice(offset, offset + limit) }
  }
}

async function checkIsAdmin(userId) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    return data?.role === 'admin'
  } catch { return false }
}

// ── Estadísticas (KPIs para el dashboard) ───────────────────────────────────
export async function getStats({ days = 30 } = {}) {
  try {
    const { data, error } = await supabase.rpc('sp_get_dashboard_kpis', { p_days: days })
    if (error) throw error
    return data
  } catch {
    // Fallback a localStorage
    const log = readLocalLog()
    const today = new Date().toDateString()
    return {
      total:      log.length,
      today:      log.filter(e => new Date(e.timestamp).toDateString() === today).length,
      by_type:    Object.fromEntries(
        Object.values(EVENT_TYPES).map(t => [t, log.filter(e => e.eventType === t).length])
      ),
      top_drugs:  getTopDrugsLocal(log),
      by_hour:    [],
      by_species: {},
    }
  }
}

function getTopDrugsLocal(log) {
  const freq = {}
  log.filter(e => e.drugName).forEach(e => {
    freq[e.drugName] = (freq[e.drugName] ?? 0) + 1
  })
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([drug_name, total_searches]) => ({ drug_name, total_searches }))
}

// ── Exportar CSV ─────────────────────────────────────────────────────────────
export async function exportToCsv() {
  const { items: log } = await getHistory({ limit: 10_000 })
  if (!log.length) return

  const headers = ['ID', 'Fecha', 'Tipo', 'Fármaco', 'Especie', 'Peso', 'Dosis / Consulta']
  const rows = log.map(e => [
    e.id,
    new Date(e.timestamp).toLocaleString('es-BO'),
    e.eventType,
    e.drugName  ?? '',
    e.species   ?? '',
    e.weight    ? `${e.weight} kg` : '',
    e.doseCalculated
      ? `${e.doseCalculated} mg (${e.volMl ?? ''} mL)`
      : (e.query?.slice(0, 80) ?? ''),
  ])

  const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `historial_atlas_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Limpiar historial ────────────────────────────────────────────────────────
export async function clearHistory() {
  localStorage.removeItem(STORAGE_KEY)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').delete().eq('user_id', user.id)
    }
  } catch {
    // Si falla Supabase, localStorage ya fue limpiado
  }
}

// ── Helpers especializados (API pública — sin cambios de firma) ──────────────
export function logDrugSearch(drugName, species) {
  return logEvent(EVENT_TYPES.DRUG_SEARCH, { drugName, species })
}

export function logDoseCalculation(data) {
  return logEvent(EVENT_TYPES.DOSE_CALCULATED, {
    drugName:       data.drug,
    doseCalculated: data.totalMg,
    ...data,
  })
}

export function logInteractionCheck(drugs) {
  return logEvent(EVENT_TYPES.INTERACTION_CHECK, {
    query:    drugs.join(', '),
    drugName: drugs[0] ?? '',
  })
}

export function logDoseValidation(data) {
  return logEvent(EVENT_TYPES.DOSE_VALIDATED, data)
}

export function logAiConsultation(query, summary) {
  return logEvent(EVENT_TYPES.AI_CONSULTATION, { query, summary })
}

export function logPrescription(data) {
  return logEvent(EVENT_TYPES.PRESCRIPTION_GEN, data)
}
