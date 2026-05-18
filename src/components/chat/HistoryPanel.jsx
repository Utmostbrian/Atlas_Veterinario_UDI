import { useEffect, useState, useCallback } from 'react'
import styles from './AIChatFloating.module.css'
import {
  listConversations,
  deleteConversation as deleteConv,
} from '../../services/chatHistoryService'
import ConfirmDialog from '../ui/ConfirmDialog'

function timeAgo(iso) {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (isNaN(ts)) return ''
  const diffMin = (Date.now() - ts) / 60000
  if (diffMin < 1)    return 'Ahora'
  if (diffMin < 60)   return `Hace ${Math.floor(diffMin)} min`
  if (diffMin < 1440) return `Hace ${Math.floor(diffMin / 60)} h`
  const days = Math.floor(diffMin / 1440)
  if (days < 7)       return `Hace ${days} d`
  return new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function HistoryPanel({
  open,
  onClose,
  onNewConversation,
  onSelectConversation,
  activeId,
  refreshKey,
}) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // Modal de confirmación: { id, title } o null
  const [confirmTarget, setConfirmTarget] = useState(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listConversations({ limit: 50 })
      setItems(rows)
    } catch (e) {
      setError(e.message || 'No se pudo cargar el historial.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchItems()
  }, [open, refreshKey, fetchItems])

  // Click en el icono trash → abre el modal de confirmación custom
  function requestDelete(e, item) {
    e.stopPropagation()
    setConfirmTarget({ id: item.id, title: item.title })
  }

  // Confirmación del modal → ejecuta el borrado real
  async function confirmDelete() {
    if (!confirmTarget) return
    const { id } = confirmTarget
    setDeletingId(id)
    try {
      await deleteConv(id)
      setItems((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) onNewConversation?.()
      setConfirmTarget(null)
    } catch (err) {
      setConfirmTarget(null)
      alert('No se pudo eliminar: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  function handleNew() {
    onNewConversation?.()
    onClose?.()
  }

  function handleSelect(id) {
    if (id === activeId) { onClose?.(); return }
    onSelectConversation?.(id)
    onClose?.()
  }

  return (
    <aside
      className={`${styles.historyPanel} ${open ? styles.historyPanelOpen : ''}`}
      aria-hidden={!open}
      aria-label="Historial de conversaciones"
    >
      <div className={styles.historyHeader}>
        <span className={styles.historyTitle}>Conversaciones</span>
        <button
          className={styles.historyClose}
          onClick={onClose}
          aria-label="Cerrar historial"
          type="button"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <button className={styles.historyNewBtn} onClick={handleNew} type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Nueva conversación
      </button>

      <div className={styles.historyList}>
        {loading && (
          <div className={styles.historyEmpty}>
            <div className="sp" style={{ width: 22, height: 22, margin: '0 auto 8px' }} />
            <span>Cargando...</span>
          </div>
        )}

        {!loading && error && (
          <div className={styles.historyError}>
            {error}
            <button className={styles.historyRetry} onClick={fetchItems} type="button">
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className={styles.historyEmpty}>
            <p>Aún no tienes conversaciones guardadas.</p>
            <p style={{ marginTop: 6, fontSize: '.74rem', opacity: .7 }}>
              Inicia una y aparecerá aquí automáticamente.
            </p>
          </div>
        )}

        {!loading && !error && items.map((c) => {
          const isActive = c.id === activeId
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.historyItem} ${isActive ? styles.historyItemActive : ''}`}
              onClick={() => handleSelect(c.id)}
              title={c.title}
            >
              <div className={styles.historyItemMain}>
                <span className={styles.historyItemTitle}>{c.title}</span>
                {c.preview && (
                  <span className={styles.historyItemPreview}>{c.preview}</span>
                )}
              </div>
              <div className={styles.historyItemSide}>
                <span className={styles.historyItemTime}>{timeAgo(c.updatedAt)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.historyDelBtn}
                  onClick={(e) => requestDelete(e, c)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') requestDelete(e, c) }}
                  aria-label="Eliminar conversación"
                  data-deleting={deletingId === c.id ? 'true' : 'false'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title="Eliminar conversación"
        message={
          confirmTarget
            ? `Se eliminará "${confirmTarget.title}" y todos sus mensajes. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        loading={!!deletingId}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deletingId) setConfirmTarget(null) }}
      />
    </aside>
  )
}
