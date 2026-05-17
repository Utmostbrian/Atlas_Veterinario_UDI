import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../hooks/useChat'
import styles from './AIChatFloating.module.css'
import chatIAIcon from '../../Icons/icons_final/CHATIA.svg'
import { markdownToHtml } from '../../utils/markdownToHtml'

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

  const { messages, loading, send, stop, clear } = useChat()
  const [text,       setText]       = useState('')
  const [imageData,  setImageData]  = useState(null)
  const [minimized,  setMinimized]  = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const fileRef    = useRef(null)
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const sendingRef = useRef(false) // M-08: prevents double-send race before loading state propagates

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
    onToggle()
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
            {isAuthenticated && messages.length > 0 && (
              <button className={styles.iconBtn} onClick={clear} title="Limpiar conversación">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
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
                  {messages.length === 0 && (
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
                    <button className={styles.removeImg} onClick={removeImage}>✕</button>
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

                  <textarea
                    ref={inputRef}
                    className={styles.textInput}
                    placeholder={imageData ? 'Describe qué observar en la imagen...' : 'Pregunta sobre fármacos, dosis, síntomas...'}
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
    </>
  )
}

