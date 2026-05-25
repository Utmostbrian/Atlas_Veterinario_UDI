/**
 * Servicio de auditoria - Atlas Farmacologico Veterinario.
 *
 * Fuente unica de verdad: Supabase. Los flujos administrativos no leen ni
 * reconstruyen datos desde localStorage porque los KPIs y logs deben ser
 * globales, verificables y exactos.
 */

import { uid } from '../lib/uid'
import { supabase } from '../lib/supabase'

export const DASHBOARD_TIMEZONE = 'America/La_Paz'

export const EVENT_TYPES = {
  DRUG_SEARCH:                'DRUG_SEARCH',
  DRUG_CARD_OPEN:             'DRUG_CARD_OPEN',
  DOSE_CALCULATED:            'DOSE_CALCULATED',
  DOSE_VALIDATED:             'DOSE_VALIDATED',
  AI_CONSULTATION:            'AI_CONSULTATION',
  PRESCRIPTION_GEN:           'PRESCRIPTION_GEN',
  INTERACTION_CHECK:          'INTERACTION_CHECK',
  PRESCRIPTION_DOSE_OVERRIDE: 'PRESCRIPTION_DOSE_OVERRIDE',
}

function fromDb(row) {
  return {
    id:             row.id,
    timestamp:      row.created_at,
    eventType:      row.event_type,
    drugName:       row.drug_name ?? null,
    species:        row.species ?? null,
    weight:         row.weight_kg ?? null,
    doseCalculated: row.dose_calculated ?? null,
    volMl:          row.vol_ml ?? null,
    route:          row.route ?? null,
    query:          row.query_text ?? null,
    summary:        row.summary ?? null,
    actorName:      row.actor_name ?? null,
  }
}

function normalizeSummary(summary) {
  return summary == null ? null : String(summary).slice(0, 200)
}

function normalizeDose(payload) {
  const value = payload.doseCalculated ?? payload.totalMg ?? payload.totalDose ?? null
  return value == null ? null : String(value)
}

function normalizeMetadata(payload) {
  const metadata = payload.metadata && typeof payload.metadata === 'object'
    ? { ...payload.metadata }
    : {}

  if (payload.aiVerdict) metadata.aiVerdict = payload.aiVerdict
  if (payload.source) metadata.source = payload.source
  return metadata
}

// Actor legacy eliminado: la trazabilidad administrativa debe venir de DB/Auth.
function getActorName() {
  return null
}

export async function logEvent(eventType, payload = {}) {
  const eventId = `${Date.now()}-${uid().slice(0, 8)}`

  try {
    const id = await persistToSupabase(eventId, eventType, payload)
    return {
      id: id ?? eventId,
      timestamp: new Date().toISOString(),
      eventType,
      persisted: Boolean(id),
      ...payload,
    }
  } catch (err) {
    console.error('[audit] persistToSupabase failed:', err?.message ?? err)
    return {
      id: eventId,
      timestamp: new Date().toISOString(),
      eventType,
      persisted: false,
      error: err?.message ?? 'audit_persist_failed',
      ...payload,
    }
  }
}

async function persistToSupabase(eventId, eventType, payload = {}) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) return null

  const { data, error } = await supabase.rpc('sp_insert_audit_log', {
    p_event_id:        eventId,
    p_user_id:         user.id,
    p_event_type:      eventType,
    p_drug_name:       payload.drugName ?? payload.drug ?? null,
    p_species:         payload.species ?? null,
    p_weight_kg:       payload.weight ?? null,
    p_dose_calculated: normalizeDose(payload),
    p_vol_ml:          payload.volMl ?? null,
    p_query_text:      payload.query ?? null,
    p_summary:         normalizeSummary(payload.summary),
    p_metadata:        normalizeMetadata(payload),
    p_actor_name:      getActorName(),
  })

  if (error) throw error
  return data
}

export async function getHistory({ limit = 50, offset = 0, eventType, search } = {}) {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('No hay sesion activa.')

  const { data, error } = await supabase.rpc('sp_get_audit_history_page', {
    p_limit:      limit,
    p_offset:     offset,
    p_event_type: eventType ?? null,
    p_search:     search ? String(search).slice(0, 100) : null,
  })

  if (error) throw error

  return {
    total: Number(data?.total ?? 0),
    items: (data?.items ?? []).map(fromDb),
  }
}

export async function getStats({ days = 30 } = {}) {
  const { data, error } = await supabase.rpc('sp_get_dashboard_kpis', {
    p_days: days,
    p_tz:   DASHBOARD_TIMEZONE,
  })
  if (error) throw error
  return data
}

export async function getFailedLogins({ days = 7, limit = 100 } = {}) {
  try {
    const { data, error } = await supabase.rpc('sp_get_failed_logins', {
      p_days:  days,
      p_limit: limit,
      p_tz:    DASHBOARD_TIMEZONE,
    })
    if (error) throw error
    return data ?? { available: false, total: 0, recent: [] }
  } catch (err) {
    console.warn('[audit] getFailedLogins failed:', err?.message ?? err)
    return { available: false, reason: err?.message ?? 'unavailable', total: 0, recent: [] }
  }
}

export async function exportToCsv() {
  const { items: log } = await getHistory({ limit: 10_000 })
  if (!log.length) return

  const headers = ['ID', 'Fecha', 'Tipo', 'Farmaco', 'Especie', 'Peso', 'Actor', 'Dosis / Consulta']
  const rows = log.map(e => [
    e.id,
    new Date(e.timestamp).toLocaleString('es-BO'),
    e.eventType,
    e.drugName ?? '',
    e.species ?? '',
    e.weight ? `${e.weight} kg` : '',
    e.actorName ?? '',
    e.doseCalculated
      ? `${e.doseCalculated} mg (${e.volMl ?? ''} mL)`
      : (e.query?.slice(0, 80) ?? ''),
  ])

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `historial_atlas_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export async function clearHistory({ scope = 'own' } = {}) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) return { ok: true, deleted: 0 }

    const { data, error } = await supabase.rpc('sp_clear_audit_logs', { p_scope: scope })
    if (error) {
      const query = supabase.from('audit_logs').delete()
      const { error: fallbackError } = scope === 'all'
        ? await query.neq('id', '00000000-0000-0000-0000-000000000000')
        : await query.eq('user_id', user.id)
      if (fallbackError) throw fallbackError
      return { ok: true, deleted: null }
    }
    return { ok: true, deleted: data }
  } catch (err) {
    console.warn('[audit] clearHistory failed:', err?.message ?? err)
    return { ok: false, error: err?.message ?? 'Error al limpiar el historial.' }
  }
}

export function logDrugSearch(drugName, species) {
  return logDrugCardOpen(drugName, species)
}

export function logDrugCardOpen(drugName, species) {
  return logEvent(EVENT_TYPES.DRUG_CARD_OPEN, { drugName, species })
}

export function logDrugTextSearch(query, resultCount = null) {
  const cleanQuery = String(query ?? '').trim().replace(/\s+/g, ' ').slice(0, 100)
  if (cleanQuery.length < 3) return Promise.resolve(null)
  return logEvent(EVENT_TYPES.DRUG_SEARCH, {
    query: cleanQuery,
    summary: `Busqueda de farmaco: ${cleanQuery}`,
    metadata: { resultCount },
  })
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
