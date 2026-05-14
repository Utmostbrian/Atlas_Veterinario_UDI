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

/* ── Resize imagen via Canvas ──────────────────────────────────────────── */
function resizeImage(file, maxSize = 200, quality = 0.78) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const side = Math.min(img.width, img.height, maxSize)
        canvas.width = side
        canvas.height = side
        const ctx = canvas.getContext('2d')
        const sx = (img.width  - side) / 2
        const sy = (img.height - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

/* ── ProfileMenu ───────────────────────────────────────────────────────── */
export default function ProfileMenu() {
  const { user, logout, updateProfile } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [open,      setOpen]      = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savedName, setSavedName] = useState(false)
  const [savingName,setSavingName]= useState(false)
  const [photoHover,setPhotoHover]= useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const wrapRef      = useRef(null)
  const fileInputRef = useRef(null)

  // Resetea el borrador cuando se abre el menú
  useEffect(() => {
    if (open) {
      setNameDraft(user?.name || '')
      setSavedName(false)
    }
  }, [open, user?.name])

  // Cierre al hacer click afuera
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Cierre con Escape
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handlePhotoClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handlePhotoChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingPhoto(true)
    try {
      const dataUrl = await resizeImage(file)
      updateProfile({ photo: dataUrl })
    } finally {
      setUploadingPhoto(false)
    }
  }, [updateProfile])

  const handleRemovePhoto = useCallback(() => {
    updateProfile({ photo: null })
  }, [updateProfile])

  function saveName() {
    const trimmed = nameDraft.trim()
    if (trimmed.length < 2 || trimmed === user?.name) return
    setSavingName(true)
    setTimeout(() => {
      updateProfile({ name: trimmed })
      setSavingName(false)
      setSavedName(true)
      setTimeout(() => setSavedName(false), 2500)
    }, 320)
  }

  const nameChanged = nameDraft.trim() !== user?.name && nameDraft.trim().length >= 2

  return (
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

          {/* Cabecera del dropdown */}
          <div className={styles.dropHead}>
            {/* Zona de foto */}
            <div
              className={styles.photoZone}
              onMouseEnter={() => setPhotoHover(true)}
              onMouseLeave={() => setPhotoHover(false)}
              onClick={handlePhotoClick}
              title="Cambiar foto de perfil"
            >
              <Avatar user={user} size={64} className={styles.bigAvatar} />
              <div className={`${styles.photoOverlay} ${(photoHover || uploadingPhoto) ? styles.photoOverlayVisible : ''}`}>
                {uploadingPhoto ? (
                  <span className={styles.photoSpinner} />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      width="18" height="18">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>Cambiar foto</span>
                  </>
                )}
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

          {/* Sección: Información personal */}
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

            {/* Sección foto (descripción) */}
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

          {/* Cerrar sesión */}
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
  )
}

export { Avatar }
