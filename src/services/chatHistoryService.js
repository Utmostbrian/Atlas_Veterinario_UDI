/**
 * Servicio de historial de conversaciones del chat IA.
 * Todas las operaciones pasan por SPs server-side que validan pertenencia.
 *
 * Las imágenes adjuntas NO se persisten (cuestan demasiado espacio en TEXT base64).
 * El campo had_image marca que el mensaje tenía una imagen, pero no se preserva.
 */

import { supabase } from '../lib/supabase'

function getActorName() {
  try { return localStorage.getItem('vet_student_name') || null } catch { return null }
}

// ── Crear nueva conversación ────────────────────────────────────────────────
export async function createConversation(initialTitle = 'Nueva conversación') {
  const { data, error } = await supabase.rpc('sp_create_chat_conversation', {
    p_title:      initialTitle,
    p_actor_name: getActorName(),
  })
  if (error) throw new Error(error.message)
  return data // UUID
}

// ── Agregar mensaje a una conversación ──────────────────────────────────────
export async function addMessage(conversationId, { role, content, hadImage = false }) {
  const { data, error } = await supabase.rpc('sp_add_chat_message', {
    p_conversation_id: conversationId,
    p_role:            role,
    p_content:         content ?? '',
    p_had_image:       !!hadImage,
  })
  if (error) throw new Error(error.message)
  return data
}

// ── Listar conversaciones del usuario (orden por updated_at desc) ───────────
export async function listConversations({ limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('sp_get_chat_conversations', {
    p_limit:  limit,
    p_offset: offset,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id:           row.id,
    title:        row.title,
    messageCount: Number(row.message_count ?? 0),
    preview:      row.preview ?? '',
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }))
}

// ── Cargar mensajes de una conversación específica ──────────────────────────
export async function loadMessages(conversationId) {
  const { data, error } = await supabase.rpc('sp_get_chat_messages', {
    p_conversation_id: conversationId,
  })
  if (error) {
    console.error('[chatHistory] sp_get_chat_messages error:', {
      message: error.message,
      code:    error.code,
      details: error.details,
      hint:    error.hint,
      conversationId,
    })
    throw new Error(error.message)
  }
  return (data ?? []).map((row) => ({
    id:        row.id,
    role:      row.role,
    content:   row.content,
    hadImage:  row.had_image,
    timestamp: row.created_at,
  }))
}

// ── Renombrar conversación ──────────────────────────────────────────────────
export async function renameConversation(conversationId, newTitle) {
  const { data, error } = await supabase.rpc('sp_update_chat_title', {
    p_conversation_id: conversationId,
    p_title:           newTitle,
  })
  if (error) throw new Error(error.message)
  return data === true
}

// ── Borrar conversación (CASCADE borra los mensajes) ────────────────────────
export async function deleteConversation(conversationId) {
  const { data, error } = await supabase.rpc('sp_delete_chat_conversation', {
    p_conversation_id: conversationId,
  })
  if (error) throw new Error(error.message)
  return data === true
}

// ── Helper: generar un título "limpio" desde la primera pregunta ────────────
export function deriveTitle(firstUserText) {
  if (!firstUserText || typeof firstUserText !== 'string') return 'Nueva conversación'
  const trimmed = firstUserText.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Nueva conversación'
  return trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed
}
