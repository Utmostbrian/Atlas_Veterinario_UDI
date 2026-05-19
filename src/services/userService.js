import { supabase } from '../lib/supabase'
import { cleanEnv } from '../lib/envUtils'

const SUPABASE_URL = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const ANON_KEY     = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

/**
 * Lista todos los usuarios + sus profiles. Solo admin/docente.
 * @returns {Promise<{ok: boolean, users?: Array, error?: string}>}
 */
export async function listUsers() {
  try {
    const { data, error } = await supabase.rpc('sp_list_users')
    if (error) throw error
    return { ok: true, users: data ?? [] }
  } catch (err) {
    return { ok: false, error: err?.message ?? 'No se pudo obtener la lista de usuarios.' }
  }
}

/**
 * Cambia el rol de un usuario. Solo admin. Auto-protección contra
 * degradar la propia cuenta (validado server-side).
 */
export async function updateUserRole(userId, role) {
  try {
    const { error } = await supabase.rpc('sp_update_user_role', {
      p_user_id: userId,
      p_role:    role,
    })
    if (error) throw error
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? 'No se pudo cambiar el rol.' }
  }
}

const ADMIN_ERROR_MESSAGES = {
  unauthorized:           'Necesitas iniciar sesión.',
  invalid_session:        'Sesión inválida. Vuelve a iniciar sesión.',
  forbidden_admin_only:   'Solo un administrador puede crear usuarios.',
  invalid_email:          'El email no tiene un formato válido.',
  password_too_short:     'La contraseña debe tener al menos 8 caracteres.',
  invalid_name:           'El nombre debe tener entre 2 y 80 caracteres.',
  invalid_role:           'Rol inválido. Usa admin, docente o student.',
  email_already_exists:   'Ya existe un usuario con ese email.',
  server_misconfigured:   'Servidor mal configurado. Avisa al equipo técnico.',
  method_not_allowed:     'Método no permitido.',
  invalid_json:           'Datos inválidos.',
}

const DELETE_ERROR_MESSAGES = {
  unauthorized:           'Necesitas iniciar sesión.',
  invalid_session:        'Sesión inválida. Vuelve a iniciar sesión.',
  forbidden_admin_only:   'Solo un administrador puede eliminar usuarios.',
  cannot_delete_self:     'No puedes eliminar tu propia cuenta.',
  missing_user_id:        'ID de usuario requerido.',
  user_not_found:         'El usuario no existe o ya fue eliminado.',
  server_misconfigured:   'Servidor mal configurado. Avisa al equipo técnico.',
  method_not_allowed:     'Método no permitido.',
  invalid_json:           'Datos inválidos.',
}

/**
 * Crea un nuevo usuario vía Edge Function admin-create-user.
 * Requiere sesión activa de admin (validado en el server).
 *
 * @param {{ email: string, password: string, name: string, role: 'admin'|'docente'|'student' }} input
 */
export async function createUser({ email, password, name, role }) {
  try {
    // Necesitamos el access token del admin actual
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        ANON_KEY,
      },
      body: JSON.stringify({ email, password, name, role }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const code = data?.error ?? 'unknown_error'
      return { ok: false, error: ADMIN_ERROR_MESSAGES[code] ?? code }
    }

    return { ok: true, user: data.user, warning: data.warning ?? null }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'La solicitud tardó demasiado.' }
    }
    return { ok: false, error: err?.message ?? 'Error inesperado al crear el usuario.' }
  }
}

/**
 * Elimina un usuario vía Edge Function admin-delete-user.
 * Requiere sesión activa de admin. No se puede eliminar a uno mismo.
 *
 * @param {string} userId
 */
export async function deleteUser(userId) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-delete-user`, {
      method: 'DELETE',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        ANON_KEY,
      },
      body: JSON.stringify({ userId }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const code = data?.error ?? 'unknown_error'
      return { ok: false, error: DELETE_ERROR_MESSAGES[code] ?? code }
    }

    return { ok: true }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'La solicitud tardó demasiado.' }
    }
    return { ok: false, error: err?.message ?? 'Error inesperado al eliminar el usuario.' }
  }
}
