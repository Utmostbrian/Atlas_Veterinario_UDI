import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '../../hooks/useChat'
import styles from './AIChatFloating.module.css'
import { SparklesIcon } from '../../Icons/Icons'
import chatIAIcon from '../../Icons/icons_final/CHATIA.svg'

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
  return (
    <div className={`${styles.msgRow} ${isUser ? styles.userRow : styles.botRow}`}>
      {!isUser && (
        <div className={styles.avatar}>
          <img src={chatIAIcon} alt="IA" style={{ width: 54, height: 54, objectFit: 'contain' }} />
        </div>
      )}

      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.botBubble} ${msg.isError ? styles.errorBubble : ''}`}>
        {/* Image preview */}
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="imagen adjunta" className={styles.imagePreview} />
        )}

        {/* Text content */}
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

export default function AIChatFloating({ open, onToggle, apiKey, onAuthRequired }) {
  const { messages, loading, error, send, stop, clear } = useChat()
  const [text, setText]       = useState('')
  const [imageData, setImageData] = useState(null)
  const [minimized, setMinimized] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const fileRef    = useRef(null)
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when chat opens
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open, minimized])

  const handleSend = useCallback(async () => {
    if (!text.trim() && !imageData) return
    if (onAuthRequired) { onAuthRequired(); return }
    const payload = { text: text.trim(), imageData }
    setText('')
    setImageData(null)
    await send(payload)
  }, [text, imageData, send, onAuthRequired])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) { alert('La imagen no puede superar 5 MB.'); return }
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
    if (item) { e.preventDefault(); if (onAuthRequired) { onAuthRequired(); return } processImageFile(item.getAsFile()) }
  }

  function removeImage() { setImageData(null) }

  async function openCamera() {
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
    canvas.toBlob(blob => {
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
      processImageFile(file)
      closeCamera()
    }, 'image/jpeg', 0.92)
  }

  function handleQuickPrompt(prompt) {
    setText(prompt)
    inputRef.current?.focus()
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
        title="Abrir Asistente IA"
        aria-label="Abrir chat con IA"
      >
        <img src={chatIAIcon} alt="IA" style={{ width: 100, height: 100, objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }} />
        {!apiKey && <span className={styles.fabWarning} title="API Key no configurada">!</span>}
      </button>
    )
  }

  return (
    <>
      {/* Backdrop on mobile */}
      <div className={styles.backdrop} onClick={handleToggle} />

      {cameraOpen && (
        <div className={styles.cameraOverlay}>
          <video ref={videoRef} autoPlay playsInline className={styles.cameraVideo} />
          <div className={styles.cameraActions}>
            <button className={styles.cameraCapture} onClick={capturePhoto} title="Capturar foto" />
            <button className={styles.cameraCancel} onClick={closeCamera}>Cancelar</button>
          </div>
        </div>
      )}

      <div className={`${styles.chatWindow} ${minimized ? styles.chatMinimized : ''}`}>
        {/* Chat header */}
        <div className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerAvatar}>
              <img src={chatIAIcon} alt="IA" style={{ width: 100, height: 100, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            </div>
            <div>
              <div className={styles.headerName}>Atlas IA</div>
              <div className={styles.headerStatus}>
                <span className={`${styles.statusDot} ${apiKey ? styles.statusOnline : styles.statusOffline}`} />
                {apiKey ? 'Copiloto Clínico activo' : 'API Key requerida'}
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            {messages.length > 0 && (
              <button className={styles.iconBtn} onClick={clear} title="Limpiar conversación">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              </button>
            )}
            <button className={styles.iconBtn} onClick={() => setMinimized((v) => !v)} title="Minimizar">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
            </button>
            <button className={styles.iconBtn} onClick={handleToggle} title="Cerrar">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Messages area */}
            <div className={styles.messages}>
              {messages.length === 0 && (
                <div className={styles.welcome}>
                  <h3>Chat IA Veterinario</h3>
                  <p>Consulta sobre fármacos, dosis, interacciones o adjunta una imagen de receta, síntoma o etiqueta.</p>
                  <div className={styles.quickPrompts}>
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        className={styles.quickBtn}
                        onClick={() => handleQuickPrompt(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <Message key={msg.id} msg={msg} />
              ))}

              {loading && !messages.some((m) => m.streaming) && <TypingIndicator />}

              <div ref={bottomRef} />
            </div>

            {/* API Key warning */}
            {!apiKey && (
              <div className={styles.apiWarning}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                Configura tu API Key de Anthropic en el encabezado para activar la IA.
              </div>
            )}

            {/* Image preview */}
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

            {/* Input area */}
            <div className={styles.inputArea}>
              {/* Image upload button */}
              <button
                className={styles.attachBtn}
                onClick={() => onAuthRequired ? onAuthRequired() : fileRef.current?.click()}
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

              {/* Camera capture button */}
              <button
                className={styles.attachBtn}
                onClick={() => onAuthRequired ? onAuthRequired() : openCamera()}
                title="Tomar foto con la cámara"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>

              {/* Text input */}
              <textarea
                ref={inputRef}
                className={styles.textInput}
                placeholder={imageData ? 'Describe qué observar en la imagen...' : 'Pregunta sobre fármacos, dosis, síntomas...'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
              />

              {/* Send / Stop button */}
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

            {/* Footer note */}
            <div className={styles.chatFooter}>
              Powered by Claude · Dosis siempre orientativas · Consultar veterinario
            </div>
          </>
        )}
      </div>
    </>
  )
}

function markdownToHtml(md) {
  if (!md) return ''
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>[^\n]*<\/li>\n?)+)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
