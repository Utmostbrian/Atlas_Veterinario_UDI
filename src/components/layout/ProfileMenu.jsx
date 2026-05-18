import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import styles from './ProfileMenu.module.css'

/* ── Avatar ────────────────────────────────────────────────────────────── */
function Avatar({ user, size = 32, className = '' }) {
  const initials = user?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || '?'

  if (user?.photo) {
    return (
      <img
        src={user.photo}
        alt={user.name}
        // N15: para fotos que en el futuro vengan de Storage, no leak del origen
        referrerPolicy="no-referrer"
        className={`${styles.avatar} ${className}`}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div
      className={`${styles.avatarInitials} ${user?.role === 'admin' ? styles.avatarAdmin : styles.avatarStudent} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  )
}

/* ── CropModal ─────────────────────────────────────────────────────────── */
function CropModal({ src, onConfirm, onCancel }) {
  const [offsetX, setOffsetX] = useState(50)
  const [offsetY, setOffsetY] = useState(50)
  const [outputSize, setOutputSize] = useState(200)
  const dragRef = useRef(null)

  // startDrag captures current offsets at drag start — called directly from event handlers
  function startDrag(clientX, clientY) {
    dragRef.current = { sx: clientX, sy: clientY, ox: offsetX, oy: offsetY }
  }

  // moveDrag only reads dragRef (stable ref) and stable setters — safe in useEffect
  const moveDrag = useCallback((clientX, clientY) => {
    if (!dragRef.current) return
    const dx = clientX - dragRef.current.sx
    const dy = clientY - dragRef.current.sy
    setOffsetX(Math.max(0, Math.min(100, dragRef.current.ox - dx * 0.4)))
    setOffsetY(Math.max(0, Math.min(100, dragRef.current.oy - dy * 0.4)))
  }, [])

  const endDrag = useCallback(() => { dragRef.current = null }, [])

  // Global listeners so drag works even when mouse leaves the preview circle
  useEffect(() => {
    function onMove(e) {
      const pt = e.touches ? e.touches[0] : e
      moveDrag(pt.clientX, pt.clientY)
    }
    function onUp() { endDrag() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [moveDrag, endDrag])

  function confirmCrop() {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = outputSize
      canvas.height = outputSize
      const ctx  = canvas.getContext('2d')
      const side = Math.min(img.width, img.height)
      const sx   = ((img.width  - side) * offsetX) / 100
      const sy   = ((img.height - side) * offsetY) / 100
      ctx.drawImage(img, sx, sy, side, side, 0, 0, outputSize, outputSize)
      onConfirm(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = src
  }

  const SIZES = [
    { px: 96,  label: 'Pequeño', desc: '96 px'  },
    { px: 200, label: 'Mediano', desc: '200 px' },
    { px: 400, label: 'Grande',  desc: '400 px' },
  ]

  return (
    <div className={styles.cropOverlay} onClick={onCancel}>
      <div className={styles.cropModal} onClick={e => e.stopPropagation()}>
        <div className={styles.cropHeader}>
          <h3 className={styles.cropTitle}>Ajustar foto de perfil</h3>
          <p className={styles.cropHint}>Arrastra la imagen para reposicionarla</p>
        </div>

        <div
          className={styles.cropPreview}
          onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
          onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        >
          <img
            src={src}
            className={styles.cropImg}
            style={{ objectPosition: `${offsetX}% ${offsetY}%` }}
            draggable={false}
            alt="Vista previa"
          />
        </div>

        <div className={styles.cropSizes}>
          <span className={styles.cropSizesLabel}>Tamaño:</span>
          {SIZES.map(({ px, label, desc }) => (
            <button
              key={px}
              className={`${styles.cropSizeBtn} ${outputSize === px ? styles.cropSizeBtnActive : ''}`}
              onClick={() => setOutputSize(px)}
            >
              {label}
              <span className={styles.cropSizePx}>{desc}</span>
            </button>
          ))}
        </div>

        <div className={styles.cropActions}>
          <button className={styles.cropCancel} onClick={onCancel}>Cancelar</button>
          <button className={styles.cropConfirm} onClick={confirmCrop}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              width="14" height="14">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Guardar foto
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── ProfileMenu ───────────────────────────────────────────────────────── */
export default function ProfileMenu() {
  // N6: isAdmin viene del context, no se recalcula localmente
  const { user, isAdmin, logout, updateProfile } = useAuth()

  const [open,       setOpen]       = useState(false)
  const [nameDraft,  setNameDraft]  = useState('')
  const [savedName,  setSavedName]  = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [photoHover, setPhotoHover] = useState(false)
  const [cropSrc,    setCropSrc]    = useState(null)

  const wrapRef      = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setNameDraft(user?.name || '')
      setSavedName(false)
    }
  }, [open, user?.name])

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handlePhotoClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handlePhotoChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => setCropSrc(ev.target.result)
    reader.readAsDataURL(file)
  }, [])

  const handleCropConfirm = useCallback(async (dataUrl) => {
    setCropSrc(null)
    // N1: límite duro alineado con el CHECK CONSTRAINT del backend (512 KB).
    // Crop a 200px con JPEG 0.85 da ~15-30 KB típico; raro pasar de 100 KB.
    if (dataUrl.length > 512 * 1024) {
      alert('La foto es demasiado grande tras el recorte. Elige un tamaño menor.')
      return
    }
    const res = await updateProfile({ photo: dataUrl })
    if (res && res.ok === false) {
      alert('No se pudo guardar la foto: ' + (res.error ?? 'error desconocido'))
    }
  }, [updateProfile])

  const handleCropCancel = useCallback(() => setCropSrc(null), [])

  const handleRemovePhoto = useCallback(async () => {
    const res = await updateProfile({ photo: null })
    if (res && res.ok === false) {
      alert('No se pudo eliminar la foto: ' + (res.error ?? 'error desconocido'))
    }
  }, [updateProfile])

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (trimmed.length < 2 || trimmed === user?.name) return
    setSavingName(true)
    // El delay 320ms anterior era cosmético; ahora esperamos a la DB real.
    const res = await updateProfile({ name: trimmed })
    setSavingName(false)
    if (res && res.ok === false) {
      alert('No se pudo guardar el nombre: ' + (res.error ?? 'error desconocido'))
      return
    }
    setSavedName(true)
    setTimeout(() => setSavedName(false), 2500)
  }

  const nameChanged = nameDraft.trim() !== user?.name && nameDraft.trim().length >= 2

  return (
    <>
      <div ref={wrapRef} className={styles.wrap}>

        {/* ── Botón trigger ── */}
        <button
          className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-label="Menú de perfil"
          aria-expanded={open}
        >
          <Avatar user={user} size={30} />
          <span className={styles.triggerName}>{user?.name}</span>
          <svg
            className={`${styles.chevron} ${open ? styles.chevronUp : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            width="13" height="13"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* ── Dropdown ── */}
        {open && (
          <div className={styles.dropdown} role="dialog" aria-label="Perfil de usuario">

            <div className={styles.dropHead}>
              <div
                className={styles.photoZone}
                onMouseEnter={() => setPhotoHover(true)}
                onMouseLeave={() => setPhotoHover(false)}
                onClick={handlePhotoClick}
                title="Cambiar foto de perfil"
              >
                <Avatar user={user} size={64} className={styles.bigAvatar} />
                <div className={`${styles.photoOverlay} ${photoHover ? styles.photoOverlayVisible : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    width="18" height="18">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Cambiar foto</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
              </div>

              <div className={styles.dropInfo}>
                <p className={styles.dropName}>{user?.name}</p>
                <span className={`${styles.dropBadge} ${isAdmin ? styles.dropBadgeAdmin : styles.dropBadgeStudent}`}>
                  {isAdmin ? 'Administrador' : 'Estudiante'}
                </span>
                {user?.photo && (
                  <button className={styles.removePhoto} onClick={handleRemovePhoto}>
                    Eliminar foto
                  </button>
                )}
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  width="13" height="13">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Información personal
              </h3>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="pm-name">
                  Nombre
                  {!isAdmin && (
                    <span className={styles.lockBadge}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        width="10" height="10">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Solo lectura
                    </span>
                  )}
                </label>
                <div className={styles.fieldRow}>
                  <input
                    id="pm-name"
                    type="text"
                    className={`${styles.fieldInput} ${!isAdmin ? styles.fieldInputLocked : ''}`}
                    value={isAdmin ? nameDraft : (user?.name || '')}
                    onChange={e => isAdmin && setNameDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && isAdmin && nameChanged && saveName()}
                    readOnly={!isAdmin}
                    placeholder="Tu nombre completo"
                    maxLength={60}
                  />
                  {isAdmin && nameChanged && (
                    <button
                      className={`${styles.saveBtn} ${savedName ? styles.saveBtnOk : ''}`}
                      onClick={saveName}
                      disabled={savingName}
                      title="Guardar nombre"
                    >
                      {savingName ? (
                        <span className={styles.savingSpinner} />
                      ) : savedName ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                          width="14" height="14">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          width="14" height="14">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                          <polyline points="17 21 17 13 7 13 7 21" />
                          <polyline points="7 3 7 8 15 8" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                {savedName && (
                  <p className={styles.savedMsg}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      width="12" height="12">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Nombre actualizado correctamente
                  </p>
                )}
                {!isAdmin && (
                  <p className={styles.fieldHint}>
                    El nombre fue asignado al iniciar sesión. Contacta a tu docente para modificarlo.
                  </p>
                )}
              </div>

              <div className={styles.photoHint}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  width="12" height="12" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Haz clic en tu avatar para {user?.photo ? 'cambiar' : 'subir'} tu foto de perfil.
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.logoutSection}>
              <button
                className={styles.logoutBtn}
                onClick={() => { setOpen(false); logout() }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  width="15" height="15">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Cerrar sesión
              </button>
            </div>

          </div>
        )}
      </div>

      {/* Crop modal — fuera del dropdown para que el z-index no sea afectado */}
      {cropSrc && (
        <CropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  )
}

export { Avatar }
