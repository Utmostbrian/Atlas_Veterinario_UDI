import { useCallback, useEffect, useRef, useState } from 'react'

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  return getRecognitionCtor() !== null
}

function setupRecognition({
  rec, lang, continuous, interim,
  listeners,
}) {
  rec.lang            = lang
  rec.continuous      = continuous
  rec.interimResults  = interim
  rec.maxAlternatives = 1
  rec.onstart   = () => listeners.onStart()
  rec.onend     = () => listeners.onEnd()
  rec.onerror   = (e) => listeners.onError(e)
  rec.onresult  = (event) => listeners.onResult(event)
}

/**
 * Hook para Speech-to-Text usando Web Speech API (gratis, nativo).
 *
 * Crea una instancia NUEVA del reconocedor en cada start().
 * Esto evita el conocido bug de Chrome donde la misma instancia
 * queda en estado inválido tras un stop() y no puede reiniciarse.
 *
 * @param {Object} opts
 * @param {string} [opts.lang='es-ES']
 * @param {boolean} [opts.continuous=false]
 * @param {boolean} [opts.interim=true]
 * @param {(finalText: string) => void} [opts.onResult]
 * @param {(interimText: string) => void} [opts.onInterim]
 * @param {() => void} [opts.onEnd]
 */
export function useSpeechRecognition(opts = {}) {
  const {
    lang        = 'es-ES',
    continuous  = false,
    interim     = true,
    onResult,
    onInterim,
    onEnd,
  } = opts

  const supported = isSpeechRecognitionSupported()
  const [isListening,       setIsListening]       = useState(false)
  const [transcript,        setTranscript]        = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error,             setError]             = useState(null)

  const recognitionRef = useRef(null)
  const onResultRef    = useRef(onResult)
  const onInterimRef   = useRef(onInterim)
  const onEndRef       = useRef(onEnd)
  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onInterimRef.current = onInterim }, [onInterim])
  useEffect(() => { onEndRef.current = onEnd }, [onEnd])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch { /* ignore */ }
        recognitionRef.current = null
      }
    }
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      console.warn('[STT] start() ignorado — navegador no soporta SpeechRecognition')
      return false
    }

    // Destruir instancia previa si existe (garantiza estado limpio)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }

    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('create-failed')
      return false
    }

    const rec = new Ctor()

    setupRecognition({
      rec, lang, continuous, interim,
      listeners: {
        onStart: () => {
          if (recognitionRef.current !== rec) return
          console.log('[STT] onstart — reconocedor activo')
          setIsListening(true)
          setError(null)
        },
        onEnd: () => {
          if (recognitionRef.current !== rec) return
          console.log('[STT] onend — reconocedor detenido')
          setIsListening(false)
          setInterimTranscript('')
          recognitionRef.current = null
          onEndRef.current?.()
        },
        onError: (e) => {
          if (recognitionRef.current !== rec) return
          console.warn('[STT] onerror:', e.error, e.message ?? '')
          if (e.error === 'no-speech' || e.error === 'aborted') {
            setIsListening(false)
            return
          }
          setError(e.error || 'speech-error')
          setIsListening(false)
        },
        onResult: (event) => {
          if (recognitionRef.current !== rec) return
          let finalText  = ''
          let interimTxt = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i]
            if (res.isFinal) finalText  += res[0].transcript
            else             interimTxt += res[0].transcript
          }
          if (finalText) {
            console.log('[STT] resultado FINAL:', finalText.trim())
            setTranscript(prev => (prev ? prev + ' ' : '') + finalText.trim())
            onResultRef.current?.(finalText.trim())
          }
          if (interimTxt) console.log('[STT] interim:', interimTxt)
          setInterimTranscript(interimTxt)
          onInterimRef.current?.(interimTxt.trim())
        },
      },
    })

    recognitionRef.current = rec
    setTranscript('')
    setInterimTranscript('')
    setError(null)

    try {
      rec.start()
      return true
    } catch (e) {
      recognitionRef.current = null
      if (/already started/i.test(e?.message ?? '')) {
        console.log('[STT] start() — ya estaba activo, ignorado')
        return true
      }
      console.error('[STT] start() falló:', e?.name, e?.message)
      setError(e.message || 'start-failed')
      return false
    }
  }, [supported, lang, continuous, interim])

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
