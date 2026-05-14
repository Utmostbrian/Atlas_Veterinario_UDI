import { useState, useRef, useCallback } from 'react'
import { sendMessage } from '../services/anthropicService'
import { logAiConsultation } from '../services/auditService'

export function useChat() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const abortRef = useRef(null)

  const addMessage = useCallback((role, content, imageUrl = null) => {
    const msg = {
      id:        Date.now() + Math.random(),
      role,
      content,
      imageUrl,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, msg])
    return msg
  }, [])

  const send = useCallback(
    async ({ text, imageData }) => {
      if (!text.trim() && !imageData) return
      if (loading) return

      setError(null)
      setLoading(true)

      addMessage('user', text, imageData?.previewUrl)

      // Placeholder for streaming response
      const placeholderId = Date.now() + Math.random()
      setMessages((prev) => [
        ...prev,
        { id: placeholderId, role: 'assistant', content: '', streaming: true },
      ])

      const history = messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? [{ type: 'text', text: m.content }]
          : m.content,
      }))

      abortRef.current = new AbortController()

      try {
        const fullResponse = await sendMessage({
          history,
          userText: text,
          imageData,
          signal: abortRef.current.signal,
          onChunk: (_chunk, fullText) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId
                  ? { ...m, content: fullText, streaming: true }
                  : m
              )
            )
          },
        })

        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, streaming: false } : m
          )
        )

        logAiConsultation(text, typeof fullResponse === 'string' ? fullResponse.slice(0, 200) : '')
      } catch (err) {
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
    },
    [loading, messages, addMessage]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, loading, error, send, stop, clear }
}
