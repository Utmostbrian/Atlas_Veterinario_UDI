import { useEffect, useRef } from 'react'
import styles from './ConfirmDialog.module.css'

/**
 * Modal de confirmación con diseño coherente al resto de la app.
 * - Desktop: centered card con fade + scale
 * - Mobile (< 480px): bottom action-sheet con slide-up + handle drag visual
 * - ESC y click en backdrop cancelan
 * - Auto-focus en el botón seguro (Cancelar) para evitar borrado accidental con Enter
 * - Soporta variante destructiva (botón rojo) y estado loading
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel  = 'Cancelar',
  destructive  = false,
  loading      = false,
  onConfirm,
  onCancel,
}) {
  const cancelBtnRef = useRef(null)

  // Body lock + ESC handler — solo cuando está abierto
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e) {
      if (e.key === 'Escape' && !loading) onCancel?.()
    }
    document.addEventListener('keydown', onKey)

    // Foco inicial defensivo: el botón seguro, no el destructivo
    const focusTimer = setTimeout(() => cancelBtnRef.current?.focus(), 50)

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      clearTimeout(focusTimer)
    }
  }, [open, loading, onCancel])

  if (!open) return null

  function handleBackdrop() {
    if (!loading) onCancel?.()
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} aria-hidden="true" />

        <div className={`${styles.iconWrap} ${destructive ? styles.iconDestructive : styles.iconInfo}`}>
          {destructive ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </div>

        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>

        {message && (
          <p id="confirm-dialog-message" className={styles.message}>
            {message}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            ref={cancelBtnRef}
            onClick={onCancel}
            className={styles.btnSecondary}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${styles.btnPrimary} ${destructive ? styles.btnDestructive : ''}`}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? (
              <span className={styles.btnLoading}>
                <span className={styles.spinner} aria-hidden="true" />
                {confirmLabel}
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
