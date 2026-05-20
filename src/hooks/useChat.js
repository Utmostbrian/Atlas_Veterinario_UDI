import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { sendMessage } from '../services/anthropicService'
import { logAiConsultation } from '../services/auditService'
import {
  createConversation,
  addMessage as persistMessage,
  loadMessages,
  deriveTitle,
  renameConversation,
} from '../services/chatHistoryService'
import { uid } from '../lib/uid'

const MAX_HISTORY = 20

export function useChat(opts = {}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  // ID de la conversación persistida en Supabase (null = aún no creada)
  const [conversationId, setConversationId] = useState(null)
  const abortRef       = useRef(null)
  const messagesRef    = useRef([])
  const conversationRef = useRef(null)
  const titleSetRef    = useRef(false)

  // Callbacks opcionales (TTS u otras integraciones). Refrescamos en cada render
  // para que send() siempre vea la última referencia sin recrearse.
  const cbRef = useRef({})
  cbRef.current = {
    onAssistantChunk:    opts.onAssistantChunk,
    onAssistantComplete: opts.onAssistantComplete,
    onAssistantAbort:    opts.onAssistantAbort,
  }

  // Mantener refs sincronizadas para evitar stale closures
  useLayoutEffect(() => { messagesRef.current = messages }, [messages])
  useLayoutEffect(() => { conversationRef.current = conversationId }, [conversationId])

  const addMessage = useCallback((role, content, imageUrl = null) => {
    const msg = {
      id:        uid(),
      role,
      content,
      imageUrl,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, msg])
    return msg
  }, [])

  // Cargar una conversación existente del historial.
  const loadConversation = useCallback(async (id) => {
    if (!id) return
    setError(null)
    setLoading(true)
    try {
      const rows = await loadMessages(id)
      setMessages(rows.map((m) => ({
        id:        m.id,
        role:      m.role,
        content:   m.content,
        imageUrl:  m.hadImage ? null : null, // imagen no persistida; placeholder visual del banner se podría agregar
        timestamp: m.timestamp,
        streaming: false,
      })))
      setConversationId(id)
      titleSetRef.current = true // ya tiene título asignado por el server
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Empezar conversación nueva (limpia mensajes y resetea id).
  const newConversation = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setConversationId(null)
    titleSetRef.current = false
  }, [])

  const send = useCallback(
    async ({ text, imageData }) => {
      if (!text.trim() && !imageData) return
      if (loading) return

      setError(null)
      setLoading(true)

      // Snapshot del historial ANTES de mutar estado, capeado a MAX_HISTORY
      const history = messagesRef.current.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? [{ type: 'text', text: m.content }]
          : m.content,
      }))

      const userMsg = addMessage('user', text, imageData?.previewUrl)

      const placeholderId = uid()
      setMessages((prev) => [
        ...prev,
        { id: placeholderId, role: 'assistant', content: '', streaming: true, timestamp: new Date().toISOString() },
      ])

      abortRef.current = new AbortController()

      // Asegurar que existe una conversación en DB ANTES de persistir el mensaje
      // del usuario. Si falla, seguimos sin persistir (degradación elegante).
      let convId = conversationRef.current
      try {
        if (!convId) {
          convId = await createConversation(deriveTitle(text))
          setConversationId(convId)
          titleSetRef.current = true
        } else if (!titleSetRef.current) {
          // Caso edge: conversación existente sin título derivado todavía
          await renameConversation(convId, deriveTitle(text))
          titleSetRef.current = true
        }
      } catch (err) {
        console.warn('[useChat] No se pudo crear/renombrar conversación:', err?.message)
        convId = null
      }

      // Persistir mensaje del usuario (best effort — no bloquea)
      if (convId) {
        persistMessage(convId, {
          role:     'user',
          content:  text,
          hadImage: !!imageData,
        }).catch((e) => console.warn('[useChat] persist user msg:', e?.message))
      }

      try {
        const fullResponse = await sendMessage({
          history,
          userText: text,
          imageData,
          signal: abortRef.current.signal,
          onChunk: (chunk, fullText) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId
                  ? { ...m, content: fullText, streaming: true }
                  : m
              )
            )
            try { cbRef.current.onAssistantChunk?.(chunk, fullText) } catch { /* ignore */ }
          },
        })

        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, streaming: false } : m
          )
        )

        try { cbRef.current.onAssistantComplete?.(typeof fullResponse === 'string' ? fullResponse : '') } catch { /* ignore */ }

        // Persistir respuesta completa del asistente
        if (convId && typeof fullResponse === 'string' && fullResponse.trim()) {
          persistMessage(convId, {
            role:    'assistant',
            content: fullResponse,
          }).catch((e) => console.warn('[useChat] persist assistant msg:', e?.message))
        }

        logAiConsultation(text, typeof fullResponse === 'string' ? fullResponse.slice(0, 200) : '')
      } catch (err) {
        try { cbRef.current.onAssistantAbort?.() } catch { /* ignore */ }
        if (err.name === 'AbortError') {
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId))
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, content: `Error: ${err.message}`, streaming: false, isError: true }
                : m
            )
          )
          setError(err.message)
        }
      } finally {
        setLoading(false)
        abortRef.current = null
      }
      void userMsg // evita warning de "no usado"
    },
    [loading, addMessage]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // "Limpiar" hoy significa empezar una conversación nueva (los mensajes anteriores
  // ya están persistidos en el historial; el botón Clear ya no es destructivo).
  const clear = useCallback(() => {
    newConversation()
  }, [newConversation])

  return {
    messages,
    loading,
    error,
    conversationId,
    send,
    stop,
    clear,
    loadConversation,
    newConversation,
  }
}
