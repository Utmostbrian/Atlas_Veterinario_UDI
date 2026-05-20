import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'vet_tts_enabled'

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickSpanishVoice(voices) {
  if (!voices?.length) return null
  // Preferir voz local (no remota) en español; fallback a cualquier es-*.
  const es = voices.filter(v => /^es(-|_)/i.test(v.lang) || v.lang.toLowerCase() === 'es')
  const local = es.find(v => v.localService)
  return local ?? es[0] ?? null
}

/**
 * Hook para Text-to-Speech con cola de oraciones.
 * Pensado para hablar respuestas de IA en streaming: cada oración se
 * encola al detectarse, dando sensación de respuesta en tiempo real.
 *
 * @param {Object} opts
 * @param {string} [opts.lang='es-ES']
 * @param {number} [opts.rate=1.05]
 * @param {number} [opts.pitch=1]
 */
export function useSpeechSynthesis(opts = {}) {
  const { lang = 'es-ES', rate = 1.05, pitch = 1 } = opts

  const supported = isSpeechSynthesisSupported()
  const [enabled,    setEnabledState] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voice,      setVoice]      = useState(null)

  const queueRef    = useRef([])     // Oraciones pendientes por hablar
  const speakingRef = useRef(false)  // Hay un utterance en curso
  const voiceRef    = useRef(null)

  // Cargar voces (asíncrono en algunos navegadores).
  useEffect(() => {
    if (!supported) return
    const synth = window.speechSynthesis

    const refresh = () => {
      const v = pickSpanishVoice(synth.getVoices())
      voiceRef.current = v
      setVoice(v)
    }

    refresh()
    synth.addEventListener?.('voiceschanged', refresh)
    return () => synth.removeEventListener?.('voiceschanged', refresh)
  }, [supported])

  // Procesador de cola: drena oraciones una por una.
  const processQueue = useCallback(() => {
    if (!supported) return
    if (speakingRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      setIsSpeaking(false)
      return
    }
    const u = new SpeechSynthesisUtterance(next)
    u.lang  = lang
    u.rate  = rate
    u.pitch = pitch
    if (voiceRef.current) u.voice = voiceRef.current
    u.onstart = () => {
      speakingRef.current = true
      setIsSpeaking(true)
    }
    u.onend = u.onerror = () => {
      speakingRef.current = false
      // Pequeño delay para que las oraciones no se peguen.
      setTimeout(processQueue, 30)
    }
    try { window.speechSynthesis.speak(u) } catch {
      speakingRef.current = false
      setTimeout(processQueue, 30)
    }
  }, [supported, lang, rate, pitch])

  /** Encola una oración para hablarla cuando termine la anterior. */
  const enqueue = useCallback((text) => {
    if (!supported || !enabled) return
    const t = (text ?? '').trim()
    if (!t) return
    queueRef.current.push(t)
    processQueue()
  }, [supported, enabled, processQueue])

  /** Detiene todo y vacía la cola. */
  const stop = useCallback(() => {
    queueRef.current = []
    speakingRef.current = false
    if (supported) {
      try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    }
    setIsSpeaking(false)
  }, [supported])

  const setEnabled = useCallback((value) => {
    setEnabledState(prev => {
      const next = typeof value === 'function' ? value(prev) : !!value
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      // Si se apaga, cortar cualquier audio en curso.
      if (!next && supported) {
        queueRef.current = []
        speakingRef.current = false
        try { window.speechSynthesis.cancel() } catch { /* ignore */ }
        setIsSpeaking(false)
      }
      return next
    })
  }, [supported])

  const toggle = useCallback(() => setEnabled(prev => !prev), [setEnabled])

  // Limpieza al desmontar: que no quede hablando si el usuario cierra el chat.
  useEffect(() => {
    return () => {
      if (supported) {
        try { window.speechSynthesis.cancel() } catch { /* ignore */ }
      }
    }
  }, [supported])

  return {
    supported,
    enabled,
    isSpeaking,
    voice,
    enqueue,
    stop,
    toggle,
    setEnabled,
  }
}
