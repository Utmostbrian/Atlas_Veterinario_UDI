import { useState, useRef, useCallback, useEffect } from 'react'
import { sendMessage } from '../services/anthropicService'
import { logAiConsultation } from '../services/auditService'

const MAX_HISTORY = 20

export function useChat() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const abortRef    = useRef(null)
  const messagesRef = useRef([])

  // F-04: keep ref in sync so send() never closes over stale messages
  useEffect(() => { messagesRef.current = messages }, [messages])

  const addMessage = useCallback((role, content, imageUrl = null) => {
    const msg = {
      id:        crypto.randomUUID(), // F-07: collision-free IDs
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

      // F-03: snapshot history explicitly before state mutation
      // F-02: cap at MAX_HISTORY to prevent token overflow on long conversations
      const history = messagesRef.current.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? [{ type: 'text', text: m.content }]
          : m.content,
      }))

      addMessage('user', text, imageData?.previewUrl)

      const placeholderId = crypto.randomUUID() // F-07
      setMessages((prev) => [
        ...prev,
        { id: placeholderId, role: 'assistant', content: '', streaming: true, timestamp: new Date().toISOString() },
      ])

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
    [loading, addMessage] // F-04: 'messages' removed — read via messagesRef instead
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
