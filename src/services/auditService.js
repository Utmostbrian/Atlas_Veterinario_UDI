/**
 * Servicio de Auditoría — Atlas Farmacológico Veterinario
 *
 * Arquitectura dual (DoD Punto 3):
 * 1. Supabase (PostgreSQL) — fuente de verdad en el servidor, inmutable por el cliente
 * 2. localStorage           — caché offline; se usa si Supabase no está disponible
 *
 * Idempotencia: cada evento lleva un event_id único para evitar duplicados
 * en reintentos (equivalente al patrón del sp_InsertAuditLog del DoD).
 *
 * A-04: cada log lleva actor_name (el estudiante real detrás de la cuenta compartida)
 * para que la auditoría sea trazable a una persona aunque el user_id sea el mismo.
 */

import { supabase } from '../lib/supabase'
import { uid } from '../lib/uid'

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
  // M-04: localStorage puede lanzar QuotaExceededError en Safari privado o
  // cuando el bucket está lleno. La auditoría nunca debe romper la app.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 500)))
  } catch (err) {
    console.warn('[audit] localStorage write failed (quota?):', err?.message ?? err)
    // Intento mitigado: dejar solo los 100 más recientes
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 100))) } catch { /* dar por perdido */ }
  }
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
    actorName:      row.actor_name ?? null,
  }
}

// ── Helper: nombre del actor (estudiante con cuenta compartida) ─────────────
function getActorName() {
  try { return localStorage.getItem('vet_student_name') || null } catch { return null }
}

// ── Core: registrar evento ───────────────────────────────────────────────────
export async function logEvent(eventType, payload) {
  const eventId = `${Date.now()}-${uid().slice(0, 8)}`

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
  persistToSupabase(eventId, eventType, payload).catch((err) => {
    console.error('[audit] persistToSupabase failed:', err?.message ?? err)
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
    p_actor_name:      getActorName(),
  })
}

// ── Consultar historial ──────────────────────────────────────────────────────
// A-01: el SP valida el rol server-side; ya no enviamos p_admin_view bool desde el cliente.
export async function getHistory({ limit = 50, offset = 0, eventType, search } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No hay sesión activa')

    const { data, error } = await supabase.rpc('sp_get_audit_history', {
      p_user_id:    user.id,
      p_limit:      limit,
      p_offset:     offset,
      p_event_type: eventType ?? null,
      p_search:     search    ?? null,
    })

    if (error) throw error

    const total = data?.[0]?.total_count ?? 0
    return { total, items: (data ?? []).map(fromDb) }
  } catch (err) {
    console.warn('[audit] getHistory Supabase failed, using localStorage:', err?.message ?? err)
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

// ── Estadísticas (KPIs para el dashboard) ───────────────────────────────────
export async function getStats({ days = 30 } = {}) {
  try {
    const { data, error } = await supabase.rpc('sp_get_dashboard_kpis', { p_days: days })
    if (error) throw error
    return data
  } catch (err) {
    console.warn('[audit] getStats Supabase failed, using localStorage:', err?.message ?? err)
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

  const headers = ['ID', 'Fecha', 'Tipo', 'Fármaco', 'Especie', 'Peso', 'Actor', 'Dosis / Consulta']
  const rows = log.map(e => [
    e.id,
    new Date(e.timestamp).toLocaleString('es-BO'),
    e.eventType,
    e.drugName  ?? '',
    e.species   ?? '',
    e.weight    ? `${e.weight} kg` : '',
    e.actorName ?? '',
    e.doseCalculated
      ? `${e.doseCalculated} mg (${e.volMl ?? ''} mL)`
      : (e.query?.slice(0, 80) ?? ''),
  ])

  // A-01: escape embedded quotes per RFC 4180 (double-quote → two double-quotes)
  const csv  = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `historial_atlas_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Limpiar historial ────────────────────────────────────────────────────────
// N10: el SP sp_clear_audit_logs decide server-side si borrar todo (admin)
// o solo los del caller (resto). El cliente solo declara la intención.
export async function clearHistory({ scope = 'own' } = {}) {
  localStorage.removeItem(STORAGE_KEY)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: true, deleted: 0 }

    const { data, error } = await supabase.rpc('sp_clear_audit_logs', { p_scope: scope })
    if (error) {
      // Fallback al patrón anterior si el SP aún no está desplegado
      await supabase.from('audit_logs').delete().eq('user_id', user.id)
      return { ok: true, deleted: null }
    }
    return { ok: true, deleted: data }
  } catch (err) {
    console.warn('[audit] clearHistory failed:', err?.message ?? err)
    return { ok: false, error: err?.message ?? 'Error al limpiar el historial.' }
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
