import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../hooks/useChat'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis'
import { createSentenceBuffer } from '../../utils/sentenceBuffer'
import { listConversations } from '../../services/chatHistoryService'
import styles from './AIChatFloating.module.css'
import chatIAIcon from '../../Icons/icons_final/CHATIA.svg'
import { markdownToHtml } from '../../utils/markdownToHtml'
import { CloseIcon, MicIcon, VolumeIcon, VolumeOffIcon, PhoneIcon } from '../../Icons/Icons'
import HistoryPanel from './HistoryPanel'
import VoiceCallModal from './VoiceCallModal'

const QUICK_PROMPTS = [
  '¿Cuáles son los antibióticos más seguros para gatos?',
  '¿Qué analgésico usar en bovinos post-cirugía?',
  'Protocolo anestésico para castración equina',
  '¿Ivermectina en Collies es segura?',
]

function TypingIndicator() {
  return (
    <div className={styles.typingWrap}>
      <div className={styles.typingBubble}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'

  // F-10: show typing dots while waiting for the first chunk
  if (!isUser && msg.streaming && !msg.content) {
    return (
      <div className={styles.typingWrap}>
        <div className={styles.avatar}>
          <img src={chatIAIcon} alt="IA" style={{ width: 54, height: 54, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        </div>
        <div className={styles.typingBubble}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.msgRow} ${isUser ? styles.userRow : styles.botRow}`}>
      {!isUser && (
        <div className={styles.avatar}>
          <img src={chatIAIcon} alt="IA" style={{ width: 54, height: 54, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
        </div>
      )}

      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.botBubble} ${msg.isError ? styles.errorBubble : ''}`}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="imagen adjunta" className={styles.imagePreview} />
        )}

        {msg.streaming ? (
          <div className={styles.streamingText}>
            <span dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }} />
            <span className={styles.cursor} />
          </div>
        ) : (
          <div
            className={isUser ? styles.userText : 'ai-response'}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
          />
        )}

        <span className={styles.time}>
          {new Date(msg.timestamp).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

// ── Pantalla de acceso restringido ────────────────────────────────────────────
function AuthGate({ onOpenLogin }) {
  return (
    <div className={styles.authGate}>
      <div className={styles.authGateLock}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" width="30" height="30">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h3>Acceso restringido</h3>
      <p>
        El Asistente IA Veterinario requiere una sesión activa. Inicia sesión con
        tu cuenta institucional o código de clase para continuar.
      </p>
      <button className={styles.authGateBtn} onClick={onOpenLogin}>
        Iniciar sesión
      </button>
      <span className={styles.authGateHint}>
        Accede con correo institucional o código de clase proporcionado por tu docente.
      </span>
    </div>
  )
}

export default function AIChatFloating({ open, onToggle, onOpenLogin }) {
  const { user } = useAuth()
  const isAuthenticated = !!user

  // TTS: voz de la IA. Cola de oraciones para hablar mientras llega el streaming.
  const tts = useSpeechSynthesis({ lang: 'es-ES' })
  const sentenceBufRef = useRef(null)

  const {
    messages, loading, error: chatError, send, stop,
    conversationId, loadConversation, newConversation,
  } = useChat({
    onAssistantChunk: (chunk) => {
      if (!tts.enabled) return
      if (!sentenceBufRef.current) {
        sentenceBufRef.current = createSentenceBuffer({
          onSentence: (s) => tts.enqueue(s),
        })
      }
      sentenceBufRef.current.push(chunk)
    },
    onAssistantComplete: () => {
      sentenceBufRef.current?.flush()
      sentenceBufRef.current = null
    },
    onAssistantAbort: () => {
      sentenceBufRef.current?.reset()
      sentenceBufRef.current = null
      tts.stop()
    },
  })
  const [text,         setText]         = useState('')
  const [imageData,    setImageData]    = useState(null)
  const [minimized,    setMinimized]    = useState(false)
  const [cameraOpen,   setCameraOpen]   = useState(false)
  const [historyOpen,  setHistoryOpen]  = useState(false)
  // Bump para forzar re-fetch del listado cuando se crea/borra conversación
  const [historyRefresh, setHistoryRefresh] = useState(0)
  // Refresca el listado cuando cambia la conversación activa (nueva creada)
  useEffect(() => { setHistoryRefresh((v) => v + 1) }, [conversationId])

  // Auto-restaurar la conversación más reciente al autenticarse (o montar el componente)
  const autoRestoredRef = useRef(false)
  useEffect(() => {
    if (!isAuthenticated || autoRestoredRef.current || conversationId || messages.length > 0) return
    autoRestoredRef.current = true
    listConversations({ limit: 1 })
      .then((rows) => { if (rows.length > 0) loadConversation(rows[0].id) })
      .catch((e) => console.error('[autoRestore] No se pudo restaurar conversación:', e?.message, e))
  }, [isAuthenticated, conversationId, messages.length, loadConversation])

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const fileRef    = useRef(null)
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const sendingRef = useRef(false) // M-08: prevents double-send race before loading state propagates

  // STT: dictado de voz → texto en el textarea. El usuario revisa y envía.
  const appendDictation = useCallback((finalText) => {
    if (!finalText) return
    setText((prev) => (prev ? prev.trimEnd() + ' ' : '') + finalText)
    // Reajustar altura del textarea tras inyectar dictado.
    setTimeout(() => {
      const ta = inputRef.current
      if (!ta) return
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`
      ta.focus()
    }, 0)
  }, [])

  // ── Modo conversación tipo llamada ────────────────────────────────────────
  // Loop: escuchar → enviar a IA → hablar respuesta → re-escuchar.
  const [callMode,      setCallMode]      = useState(false)
  const [callMicMuted,  setCallMicMuted]  = useState(false)
  const [lastAssistantSpeech, setLastAssistantSpeech] = useState('')
  const callModeRef     = useRef(false)
  const callMicMutedRef = useRef(false)
  const ttsPrevEnabledRef = useRef(false)

  useEffect(() => { callModeRef.current     = callMode     }, [callMode])
  useEffect(() => { callMicMutedRef.current = callMicMuted }, [callMicMuted])

  // STT continuo. En dictado escribe al textarea; en llamada despacha al chat.
  const handleSTTFinal = useCallback((finalText) => {
    if (!finalText?.trim()) return
    if (callModeRef.current) {
      if (callMicMutedRef.current) return
      // Parar mic mientras la IA piensa/habla, evita que se capture a sí misma.
      stt.stop()
      send({ text: finalText.trim(), imageData: null })
    } else {
      appendDictation(finalText)
    }
    // stt ya no está en la dep para evitar recrear callback en cada render.
    // El cambio de identidad de stt.stop está manejado vía el hook useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendDictation, send])

  const stt = useSpeechRecognition({
    lang:       'es-ES',
    continuous: true,
    interim:    true,
    onResult:   handleSTTFinal,
  })

  // Mostrar errores de STT al usuario (no-speech y aborted ya se filtran en el hook).
  useEffect(() => {
    if (!stt.error) return
    const msg = stt.error === 'not-allowed' || stt.error === 'service-not-allowed'
      ? 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.'
      : stt.error === 'audio-capture'
        ? 'No se detectó micrófono. Conecta uno y vuelve a intentar.'
        : `Error de reconocimiento de voz: ${stt.error}`
    alert(msg)
  }, [stt.error])

  const handleMicToggle = useCallback(() => {
    if (!isAuthenticated) { onOpenLogin?.(); return }
    if (!stt.supported) {
      alert('Tu navegador no soporta dictado por voz. Usa Chrome, Edge o Safari actualizado.')
      return
    }
    if (stt.isListening) stt.stop()
    else                 stt.start()
  }, [stt, isAuthenticated, onOpenLogin])

  const handleTTSToggle = useCallback(() => {
    if (!tts.supported) {
      alert('Tu navegador no soporta voz sintetizada.')
      return
    }
    tts.toggle()
  }, [tts])

  // Iniciar modo llamada: fuerza TTS encendido y empieza a escuchar.
  const startCall = useCallback(() => {
    if (!isAuthenticated) { onOpenLogin?.(); return }
    if (!stt.supported)  { alert('Tu navegador no soporta voz. Usa Chrome, Edge o Safari.'); return }
    if (!tts.supported)  { alert('Tu navegador no soporta síntesis de voz.'); return }
    ttsPrevEnabledRef.current = tts.enabled
    if (!tts.enabled) tts.setEnabled(true)
    setLastAssistantSpeech('')
    setCallMicMuted(false)
    setCallMode(true)
    // Pequeño delay para que el modal se monte antes de pedir el mic.
    setTimeout(() => stt.start(), 120)
  }, [isAuthenticated, onOpenLogin, stt, tts])

  // Terminar llamada y restaurar estado previo del TTS.
  const endCall = useCallback(() => {
    setCallMode(false)
    stt.stop()
    tts.stop()
    // Restaurar preferencia anterior de TTS (si estaba apagado, apagar de nuevo).
    if (!ttsPrevEnabledRef.current) tts.setEnabled(false)
  }, [stt, tts])

  // Capturar la última oración hablada para mostrarla en el modal.
  // Sobrescribe el callback onSentence del sentenceBuffer original mediante
  // un efecto en la respuesta del asistente: leemos el último mensaje del
  // asistente y exhibimos su contenido parcial mientras dure el TTS.
  useEffect(() => {
    if (!callMode) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant?.content) setLastAssistantSpeech(lastAssistant.content)
  }, [callMode, messages])

  // ── Loop de la llamada: reanudar STT cuando la IA termina de hablar ──────
  useEffect(() => {
    if (!callMode) return
    if (callMicMuted) return
    if (loading) return              // IA pensando/generando
    if (tts.isSpeaking) return       // IA hablando
    if (tts.queueLength > 0) return  // hay oraciones encoladas por hablar
    if (stt.isListening) return      // ya escuchando
    // Delay para evitar capturar la cola del audio que acabó.
    const t = setTimeout(() => {
      if (!callModeRef.current) return
      if (callMicMutedRef.current) return
      try { stt.start() } catch { /* ignore */ }
    }, 450)
    return () => clearTimeout(t)
  }, [callMode, callMicMuted, loading, tts.isSpeaking, tts.queueLength, stt])

  // Estado derivado para el modal (idle/listening/thinking/speaking).
  const callStatus = !callMode
    ? 'idle'
    : tts.isSpeaking || tts.queueLength > 0
      ? 'speaking'
      : loading
        ? 'thinking'
        : 'listening'

  const toggleCallMic = useCallback(() => {
    setCallMicMuted((prev) => {
      const next = !prev
      if (next) {
        try { stt.stop() } catch { /* ignore */ }
      } else if (!loading && !tts.isSpeaking && tts.queueLength === 0) {
        try { stt.start() } catch { /* ignore */ }
      }
      return next
    })
  }, [stt, loading, tts.isSpeaking, tts.queueLength])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open && !minimized && isAuthenticated) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open, minimized, isAuthenticated])

  const handleSend = useCallback(async () => {
    if (!text.trim() && !imageData) return
    if (!isAuthenticated) { onOpenLogin?.(); return }
    if (sendingRef.current) return // M-08: guard against double-click before loading state propagates
    sendingRef.current = true
    const payload = { text: text.trim(), imageData }
    setText('')
    setImageData(null)
    try {
      await send(payload)
    } finally {
      sendingRef.current = false
    }
  }, [text, imageData, send, isAuthenticated, onOpenLogin])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // F-06: auto-resize textarea up to max-height
  function handleTextChange(e) {
    setText(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 110)}px`
  }

  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) { alert('La imagen no puede superar 5 MB.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      setImageData({ base64: dataUrl.split(',')[1], mediaType: file.type, previewUrl: dataUrl, fileName: file.name })
    }
    reader.readAsDataURL(file)
  }

  function handleImageSelect(e) {
    processImageFile(e.target.files?.[0])
    e.target.value = ''
  }

  function handlePaste(e) {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
    if (item) {
      e.preventDefault()
      if (!isAuthenticated) { onOpenLogin?.(); return }
      processImageFile(item.getAsFile())
    }
  }

  function removeImage() { setImageData(null) }

  async function openCamera() {
    if (!isAuthenticated) { onOpenLogin?.(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      setCameraOpen(true)
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream }, 100)
    } catch {
      alert('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    // F-05: validate blob before creating File (some mobile browsers return null)
    canvas.toBlob(blob => {
      // B-03: stop stream before alert so camera indicator light turns off first
      if (!blob) { closeCamera(); alert('No se pudo capturar la imagen. Intenta de nuevo.'); return }
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
      processImageFile(file)
      closeCamera()
    }, 'image/jpeg', 0.92)
  }

  // F-09: auto-send on quick prompt click instead of just filling the textarea
  function handleQuickPrompt(prompt) {
    if (!isAuthenticated) { onOpenLogin?.(); return }
    send({ text: prompt, imageData: null })
  }

  function handleToggle() {
    if (streamRef.current) closeCamera()
    if (callMode) endCall()
    if (stt.isListening) stt.stop()
    tts.stop()
    setHistoryOpen(false)
    onToggle()
  }

  function handleSelectConversation(id) {
    if (callMode) endCall()
    tts.stop()
    loadConversation(id)
  }

  function handleNewConversation() {
    if (callMode) endCall()
    tts.stop()
    setLastAssistantSpeech('')
    newConversation()
  }

  if (!open) {
    return (
      <button
        className={styles.fab}
        onClick={handleToggle}
        title={isAuthenticated ? 'Abrir Asistente IA' : 'Asistente IA — Inicia sesión para usar'}
        aria-label="Abrir chat con IA"
      >
        <img src={chatIAIcon} alt="IA" style={{ width: 100, height: 100, objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }} />
        {!isAuthenticated && (
          <span className={styles.fabWarning} title="Requiere inicio de sesión">
            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      <div className={styles.backdrop} onClick={handleToggle} />

      {cameraOpen && (
        <div className={styles.cameraOverlay}>
          <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
          <div className={styles.cameraActions}>
            <button className={styles.cameraCapture} onClick={capturePhoto} title="Capturar foto" />
            <button className={styles.cameraCancel} onClick={closeCamera}>Cancelar</button>
          </div>
        </div>
      )}

      <div className={`${styles.chatWindow} ${minimized ? styles.chatMinimized : ''}`}>
        {/* Panel de historial (deslizable desde la izquierda) */}
        {isAuthenticated && (
          <HistoryPanel
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            onNewConversation={handleNewConversation}
            onSelectConversation={handleSelectConversation}
            activeId={conversationId}
            refreshKey={historyRefresh}
          />
        )}

        {/* Header */}
        <div className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerAvatar}>
              <img src={chatIAIcon} alt="IA" style={{ width: 100, height: 100, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            </div>
            <div>
              <div className={styles.headerName}>Atlas IA</div>
              <div className={styles.headerStatus}>
                <span className={`${styles.statusDot} ${isAuthenticated ? styles.statusOnline : styles.statusOffline}`} />
                {isAuthenticated ? `Copiloto Clínico · ${user.name}` : 'Sesión requerida'}
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            {isAuthenticated && !minimized && stt.supported && tts.supported && (
              <button
                className={styles.iconBtn}
                onClick={startCall}
                title="Hablar con la IA (modo llamada)"
                aria-label="Iniciar conversación por voz con la IA"
              >
                <PhoneIcon size={14} />
              </button>
            )}
            {isAuthenticated && !minimized && tts.supported && (
              <button
                className={`${styles.iconBtn} ${tts.enabled ? styles.iconBtnActive : ''} ${tts.isSpeaking ? styles.iconBtnPulse : ''}`}
                onClick={handleTTSToggle}
                title={tts.enabled ? 'Silenciar voz de la IA' : 'Activar voz de la IA'}
                aria-label={tts.enabled ? 'Silenciar voz de la IA' : 'Activar voz de la IA'}
                aria-pressed={tts.enabled}
              >
                {tts.enabled
                  ? <VolumeIcon size={14} />
                  : <VolumeOffIcon size={14} />}
              </button>
            )}
            {isAuthenticated && !minimized && (
              <button
                className={styles.iconBtn}
                onClick={() => setHistoryOpen((v) => !v)}
                title="Historial de conversaciones"
                aria-label="Historial de conversaciones"
                aria-pressed={historyOpen}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            <button className={styles.iconBtn} onClick={() => setMinimized(v => !v)} title="Minimizar">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
            </button>
            <button className={styles.iconBtn} onClick={handleToggle} title="Cerrar">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {!isAuthenticated ? (
              /* ── Gate: sin sesión ── */
              <AuthGate onOpenLogin={() => { handleToggle(); onOpenLogin?.() }} />
            ) : (
              /* ── Chat normal: con sesión ── */
              <>
                <div className={styles.messages}>
                  {chatError && (
                    <div style={{
                      margin: '12px 14px', padding: '10px 13px',
                      background: 'rgba(204,0,0,.1)', border: '1px solid rgba(204,0,0,.3)',
                      borderRadius: 8, fontSize: '.81rem', color: 'var(--red)',
                    }}>
                      <strong>Error al cargar conversación:</strong> {chatError}
                      <br /><span style={{ opacity: .75, fontSize: '.76rem' }}>Abre la consola del navegador (F12) para ver el detalle técnico.</span>
                    </div>
                  )}
                  {!chatError && messages.length === 0 && (
                    <div className={styles.welcome}>
                      <h3>Chat IA Veterinario</h3>
                      <p>Consulta sobre fármacos, dosis, interacciones o adjunta una imagen de receta, síntoma o etiqueta.</p>
                      <div className={styles.quickPrompts}>
                        {QUICK_PROMPTS.map(q => (
                          <button key={q} className={styles.quickBtn} onClick={() => handleQuickPrompt(q)}>
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map(msg => <Message key={msg.id} msg={msg} />)}
                  {loading && !messages.some(m => m.streaming) && <TypingIndicator />}
                  <div ref={bottomRef} />
                </div>

                {imageData && (
                  <div className={styles.imageAttach}>
                    <img src={imageData.previewUrl} alt="preview" className={styles.attachThumb} />
                    <div className={styles.attachInfo}>
                      <span>{imageData.fileName}</span>
                      <span className={styles.visionBadge}>Vision IA</span>
                    </div>
                    <button className={styles.removeImg} onClick={removeImage} aria-label="Quitar imagen"><CloseIcon size={13} /></button>
                  </div>
                )}

                <div className={styles.inputArea}>
                  <button
                    className={styles.attachBtn}
                    onClick={() => fileRef.current?.click()}
                    title="Adjuntar imagen (receta, síntoma, etiqueta)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className={styles.fileInput}
                    onChange={handleImageSelect}
                  />

                  <button
                    className={styles.attachBtn}
                    onClick={openCamera}
                    title="Tomar foto con la cámara"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </button>

                  {stt.supported && (
                    <button
                      className={`${styles.attachBtn} ${stt.isListening ? styles.micActive : ''}`}
                      onClick={handleMicToggle}
                      title={stt.isListening ? 'Detener dictado' : 'Dictar por voz'}
                      aria-label={stt.isListening ? 'Detener dictado por voz' : 'Iniciar dictado por voz'}
                      aria-pressed={stt.isListening}
                    >
                      <MicIcon size={18} />
                    </button>
                  )}

                  <textarea
                    ref={inputRef}
                    className={styles.textInput}
                    placeholder={
                      stt.isListening
                        ? (stt.interimTranscript || 'Escuchando...')
                        : (imageData ? 'Describe qué observar en la imagen...' : 'Pregunta sobre fármacos, dosis, síntomas...')
                    }
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    rows={1}
                  />

                  {loading ? (
                    <button className={`${styles.sendBtn} ${styles.stopBtn}`} onClick={stop} title="Detener">
                      <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                    </button>
                  ) : (
                    <button
                      className={styles.sendBtn}
                      onClick={handleSend}
                      disabled={!text.trim() && !imageData}
                      title="Enviar"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                      </svg>
                    </button>
                  )}
                </div>

                <div className={styles.chatFooter}>
                  Powered by Claude · Dosis siempre orientativas · Consultar veterinario
                </div>
              </>
            )}
          </>
        )}
      </div>

      <VoiceCallModal
        open={callMode}
        status={callStatus}
        userInterim={stt.interimTranscript}
        assistantText={lastAssistantSpeech}
        micMuted={callMicMuted}
        onToggleMute={toggleCallMic}
        onHangup={endCall}
      />
    </>
  )
}

