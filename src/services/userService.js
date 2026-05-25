import { supabase } from '../lib/supabase'
import { cleanEnv } from '../lib/envUtils'

const SUPABASE_URL = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const ANON_KEY     = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)
const ADMIN_FUNCTION_TIMEOUT_MS = 15000

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

function edgeFunctionUrl(name) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase no está configurado en el frontend. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
  }
  return `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${name}`
}

function isNetworkFetchError(err) {
  const message = String(err?.message ?? '')
  return err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)
}

function adminFunctionUnavailableMessage(name) {
  return `No se pudo conectar con la función ${name}. Revisa que esté desplegada en Supabase y que ALLOWED_ORIGIN permita este dominio.`
}

async function callAdminFunction(name, { method, body }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ADMIN_FUNCTION_TIMEOUT_MS)

  try {
    const res = await fetch(edgeFunctionUrl(name), {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        ANON_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado.')
    }
    if (isNetworkFetchError(err)) {
      throw new Error(adminFunctionUnavailableMessage(name))
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Crea un nuevo usuario vía Edge Function admin-create-user.
 * Requiere sesión activa de admin (validado en el server).
 *
 * @param {{ email: string, password: string, name: string, role: 'admin'|'docente'|'student' }} input
 */
export async function createUser({ email, password, name, role }) {
  try {
    const { res, data } = await callAdminFunction('admin-create-user', {
      method: 'POST',
      body:   { email, password, name, role },
    })

    if (res.status === 401) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
    if (!res.ok) {
      const code = data?.error ?? 'unknown_error'
      return { ok: false, error: ADMIN_ERROR_MESSAGES[code] ?? code }
    }

    return { ok: true, user: data.user, warning: data.warning ?? null }
  } catch (err) {
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
    const { res, data } = await callAdminFunction('admin-delete-user', {
      method: 'DELETE',
      body:   { userId },
    })

    if (res.status === 401) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }
    if (!res.ok) {
      const code = data?.error ?? 'unknown_error'
      return { ok: false, error: DELETE_ERROR_MESSAGES[code] ?? code }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Error inesperado al eliminar el usuario.' }
  }
}
