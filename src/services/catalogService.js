/**
 * Servicio de Catálogos — Atlas Vet
 *
 * Encapsula el acceso al catálogo de animales (sp_list_animals,
 * sp_search_animals). La búsqueda primaria es client-side sobre el
 * array cacheado para evitar round-trips por cada keystroke; el RPC
 * de búsqueda queda disponible como fallback para typos lejanos.
 */

import { supabase } from '../lib/supabase'

let _cache = null
let _cachePromise = null

/**
 * Devuelve TODAS las filas activas del catálogo de animales.
 * Cachea en memoria — el catálogo cambia raramente.
 * @returns {Promise<Array<{id, standard_species, common_name, weight_range_min, weight_range_max}>>}
 */
export async function getAnimals() {
  if (_cache) return _cache
  if (_cachePromise) return _cachePromise

  _cachePromise = (async () => {
    const { data, error } = await supabase.rpc('sp_list_animals')
    if (error) {
      _cachePromise = null
      throw new Error(error.message || 'No se pudo cargar el catálogo de animales.')
    }
    _cache = Array.isArray(data) ? data : []
    return _cache
  })()

  return _cachePromise
}

/**
 * Búsqueda local sobre el cache. Tolerante a mayúsculas/minúsculas y
 * acentos básicos. No hace I/O — devuelve sincrónico si el cache ya
 * está calentado.
 *
 * Estrategia de ranking:
 *  1) coincidencia exacta (case-insensitive) — peso 100
 *  2) prefix match — peso 80
 *  3) substring — peso 50
 *  4) standard_species substring — peso 30
 */
export function searchAnimalsLocal(items, query, limit = 8) {
  if (!Array.isArray(items) || items.length === 0) return []
  const q = (query || '').trim().toLowerCase()
  if (!q) {
    return items.slice(0, limit)
  }
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const qn = norm(q)
  const scored = items
    .map((row) => {
      const cn = norm(row.common_name)
      const sp = norm(row.standard_species)
      let score = 0
      if (cn === qn) score = 100
      else if (cn.startsWith(qn)) score = 80
      else if (cn.includes(qn)) score = 50
      else if (sp.startsWith(qn) || sp.includes(qn)) score = 30
      return { row, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.row.common_name.localeCompare(b.row.common_name))
    .slice(0, limit)
    .map((x) => x.row)
  return scored
}

/**
 * Fallback server-side con pg_trgm. Útil para typos lejanos como
 * "vakuna" → "Vaca". Devuelve la misma estructura que getAnimals().
 */
export async function searchAnimalsServer(query, limit = 8) {
  const { data, error } = await supabase.rpc('sp_search_animals', {
    p_query: query || '',
    p_limit: limit,
  })
  if (error) throw new Error(error.message || 'Error buscando animales.')
  return data ?? []
}

/** Limpia el cache (útil al cerrar sesión o tras un update admin). */
export function clearAnimalsCache() {
  _cache = null
  _cachePromise = null
}
