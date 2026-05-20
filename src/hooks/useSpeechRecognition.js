import { useCallback, useEffect, useRef, useState } from 'react'

// Web Speech API: el constructor está prefijado en algunos navegadores.
function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  return getRecognitionCtor() !== null
}

/**
 * Hook para Speech-to-Text usando Web Speech API (gratis, nativo).
 *
 * @param {Object} opts
 * @param {string} [opts.lang='es-ES']   Idioma del reconocimiento
 * @param {boolean} [opts.continuous=false] Si true, sigue escuchando hasta stop()
 * @param {boolean} [opts.interim=true]  Si true, emite resultados parciales
 * @param {(finalText: string) => void} [opts.onResult] Callback cuando hay texto final
 */
export function useSpeechRecognition(opts = {}) {
  const {
    lang        = 'es-ES',
    continuous  = false,
    interim     = true,
    onResult,
  } = opts

  const supported = isSpeechRecognitionSupported()
  const [isListening,       setIsListening]       = useState(false)
  const [transcript,        setTranscript]        = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error,             setError]             = useState(null)

  const recognitionRef = useRef(null)
  const onResultRef    = useRef(onResult)
  // Mantener la última referencia del callback sin recrear el reconocedor.
  useEffect(() => { onResultRef.current = onResult }, [onResult])

  // Crear el reconocedor una sola vez. Reusarlo evita perder permisos del mic.
  useEffect(() => {
    if (!supported) return
    const Ctor = getRecognitionCtor()
    const rec = new Ctor()
    rec.lang            = lang
    rec.continuous      = continuous
    rec.interimResults  = interim
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setIsListening(true)
      setError(null)
    }
    rec.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
    }
    rec.onerror = (e) => {
      // 'no-speech' y 'aborted' son comunes y no son fallos reales.
      if (e.error === 'no-speech' || e.error === 'aborted') {
        setIsListening(false)
        return
      }
      setError(e.error || 'speech-error')
      setIsListening(false)
    }
    rec.onresult = (event) => {
      let finalText  = ''
      let interimTxt = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) finalText  += res[0].transcript
        else             interimTxt += res[0].transcript
      }
      if (finalText) {
        setTranscript(prev => (prev ? prev + ' ' : '') + finalText.trim())
        onResultRef.current?.(finalText.trim())
      }
      setInterimTranscript(interimTxt)
    }

    recognitionRef.current = rec

    return () => {
      try { rec.onstart = rec.onend = rec.onerror = rec.onresult = null } catch { /* ignore */ }
      try { rec.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [supported, lang, continuous, interim])

  const start = useCallback(() => {
    if (!supported || !recognitionRef.current) return
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    try {
      recognitionRef.current.start()
    } catch (e) {
      // start() lanza si ya está activo; lo tratamos como no-op.
      if (!/already started/i.test(e?.message ?? '')) setError(e.message)
    }
  }, [supported])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    try { recognitionRef.current.stop() } catch { /* ignore */ }
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  return {
    supported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  }
}
