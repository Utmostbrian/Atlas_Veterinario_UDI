import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../services/speechTranscriptionService'

const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function getAudioContextCtor() {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export function isAudioTranscriptionSupported() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && !!getAudioContextCtor()
}

export function useAudioTranscription(opts = {}) {
  const {
    language = 'es',
    silenceMs = 1800,
    maxRecordingMs = 22000,
    onResult,
    onError,
  } = opts

  const supported = isAudioTranscriptionSupported()
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState(null)

  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const rafRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const lastVoiceAtRef = useRef(0)
  const hasSpeechRef = useRef(false)
  const cancelledRef = useRef(false)
  const transcribeControllerRef = useRef(null)
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)

  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const cleanupMedia = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    analyserRef.current = null
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  const stop = useCallback((cancel = false) => {
    cancelledRef.current = cancel
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
  }, [])

  const monitorSilence = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)

    let sum = 0
    for (const value of data) {
      const normalized = (value - 128) / 128
      sum += normalized * normalized
    }

    const volume = Math.sqrt(sum / data.length)
    const now = Date.now()

    if (volume > 0.025) {
      hasSpeechRef.current = true
      lastVoiceAtRef.current = now
    }

    const heardSpeech = hasSpeechRef.current
    const silentLongEnough = heardSpeech && now - lastVoiceAtRef.current >= silenceMs
    const tooLong = now - startedAtRef.current >= maxRecordingMs

    if (silentLongEnough || tooLong) {
      stop(false)
      return
    }

    rafRef.current = requestAnimationFrame(monitorSilence)
  }, [maxRecordingMs, silenceMs, stop])

  const start = useCallback(async () => {
    if (!supported) {
      setError('unsupported')
      return false
    }

    stop(true)
    transcribeControllerRef.current?.abort()
    transcribeControllerRef.current = null
    setError(null)
    chunksRef.current = []
    hasSpeechRef.current = false
    cancelledRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const AudioContextCtor = getAudioContextCtor()
      const audioContext = new AudioContextCtor()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onerror = (event) => {
        const message = event.error?.message || 'recording-error'
        setError(message)
        onErrorRef.current?.(message)
      }

      recorder.onstop = async () => {
        const wasCancelled = cancelledRef.current
        const type = recorder.mimeType || mimeType || 'audio/webm'
        recorderRef.current = null
        setIsListening(false)
        cleanupMedia()

        if (wasCancelled || chunksRef.current.length === 0 || !hasSpeechRef.current) {
          chunksRef.current = []
          return
        }

        const audioBlob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        const controller = new AbortController()
        transcribeControllerRef.current = controller
        setIsTranscribing(true)

        try {
          const text = await transcribeAudio({ audioBlob, language, signal: controller.signal })
          if (text) onResultRef.current?.(text)
        } catch (e) {
          if (e.name !== 'AbortError') {
            const message = e.message || 'transcription-error'
            setError(message)
            onErrorRef.current?.(message)
          }
        } finally {
          if (transcribeControllerRef.current === controller) transcribeControllerRef.current = null
          setIsTranscribing(false)
        }
      }

      startedAtRef.current = Date.now()
      lastVoiceAtRef.current = startedAtRef.current
      recorder.start(500)
      setIsListening(true)
      rafRef.current = requestAnimationFrame(monitorSilence)
      return true
    } catch (e) {
      cleanupMedia()
      const message = e.name === 'NotAllowedError' ? 'not-allowed' : e.message || 'start-failed'
      setError(message)
      onErrorRef.current?.(message)
      return false
    }
  }, [cleanupMedia, language, monitorSilence, stop, supported])

  const cancel = useCallback(() => {
    transcribeControllerRef.current?.abort()
    transcribeControllerRef.current = null
    stop(true)
    cleanupMedia()
    setIsListening(false)
    setIsTranscribing(false)
  }, [cleanupMedia, stop])

  useEffect(() => cancel, [cancel])

  return {
    supported,
    isListening,
    isTranscribing,
    error,
    start,
    stop,
    cancel,
  }
}
