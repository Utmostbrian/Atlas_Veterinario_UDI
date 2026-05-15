/**
 * Servicio de Recetas — Atlas Farmacológico Veterinario
 *
 * Todas las operaciones van a Supabase via Stored Procedures (funciones PG).
 * El trigger de auditoría en la DB registra automáticamente cada receta guardada.
 */

import { supabase } from '../lib/supabase'

// ── Guardar receta en Supabase ────────────────────────────────────────────────
export async function savePrescription({ patient, drugs, diagnosis, vetName, vetLicense }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Debes iniciar sesión para guardar recetas.')

  // Filtrar medicamentos vacíos antes de enviar a la DB
  const validDrugs = drugs.filter(d => d.name.trim())

  const { data, error } = await supabase.rpc('sp_save_prescription', {
    p_user_id:        user.id,
    p_patient_name:   patient.name    || null,
    p_patient_species: patient.species,
    p_patient_breed:  patient.breed   || null,
    p_patient_weight: patient.weight  ? parseFloat(patient.weight) : null,
    p_patient_age:    patient.age     || null,
    p_owner_name:     patient.owner   || null,
    p_owner_phone:    patient.ownerPhone || null,
    p_diagnosis:      diagnosis       || null,
    p_drugs:          validDrugs,
    p_vet_name:       vetName         || null,
    p_vet_license:    vetLicense      || null,
  })

  if (error) {
    // El SP lanza mensajes con prefijo VALIDATION_ERROR / DB_ERROR
    const msg = error.message ?? ''
    if (msg.includes('VALIDATION_ERROR:')) throw new Error(msg.split('VALIDATION_ERROR:')[1].trim())
    if (msg.includes('DB_ERROR:'))         throw new Error(msg.split('DB_ERROR:')[1].trim())
    throw new Error('Error al guardar la receta. Intenta de nuevo.')
  }

  return data // UUID de la receta guardada
}

// ── Obtener historial de recetas del usuario ──────────────────────────────────
export async function getPrescriptions({ limit = 20, offset = 0, species, search } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No hay sesión activa.')

  const isAdmin = await getUserRole(user.id) === 'admin'

  const { data, error } = await supabase.rpc('sp_get_prescriptions', {
    p_user_id:    user.id,
    p_admin_view: isAdmin,
    p_limit:      limit,
    p_offset:     offset,
    p_species:    species ?? null,
    p_search:     search  ?? null,
  })

  if (error) throw new Error(error.message)

  const total = data?.[0]?.total_count ?? 0
  return { total, items: data ?? [] }
}

// ── Obtener estadísticas de recetas (admin) ───────────────────────────────────
export async function getPrescriptionStats(days = 30) {
  const { data, error } = await supabase.rpc('sp_get_prescription_stats', { p_days: days })
  if (error) throw new Error(error.message)
  return data
}

async function getUserRole(userId) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role ?? 'student'
}
