import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listUsers, createUser, updateUserRole } from '../../services/userService'
import ConfirmDialog from '../ui/ConfirmDialog'
import styles from './UsersPanel.module.css'

const ROLE_LABEL = {
  admin:   'Administrador',
  docente: 'Docente',
  student: 'Estudiante',
}
const ROLE_COLOR = {
  admin:   '#CC0000',
  docente: '#7c3aed',
  student: '#003087',
}

const ROLE_OPTIONS = [
  { value: 'student', label: 'Estudiante' },
  { value: 'docente', label: 'Docente' },
  { value: 'admin',   label: 'Administrador' },
]

function RoleBadge({ role }) {
  const label = ROLE_LABEL[role] ?? role
  const color = ROLE_COLOR[role] ?? '#475569'
  return (
    <span className={styles.badge} style={{ background: `${color}1a`, color }}>
      {label}
    </span>
  )
}

function CreateUserModal({ open, onClose, onCreated }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [role,     setRole]     = useState('student')
  const [showPass, setShowPass] = useState(false)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  useEffect(() => {
    if (!open) {
      setEmail(''); setPassword(''); setName(''); setRole('student')
      setShowPass(false); setBusy(false); setError(''); setSuccess('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setError(''); setSuccess('')
    setBusy(true)
    const res = await createUser({
      email:    email.trim(),
      password,
      name:     name.trim(),
      role,
    })
    setBusy(false)
    if (!res.ok) { setError(res.error); return }
    setSuccess(`Usuario ${res.user.email} creado como ${ROLE_LABEL[res.user.role]}.`)
    onCreated?.(res.user)
    setTimeout(() => onClose?.(), 1100)
  }

  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={() => !busy && onClose()}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Nuevo usuario</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar" disabled={busy}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="cu-name">Nombre completo</label>
            <input
              id="cu-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="Nombre Apellido"
              minLength={2}
              maxLength={80}
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cu-email">Correo electrónico</label>
            <input
              id="cu-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="usuario@udi.edu.bo"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cu-pass">Contraseña <span className={styles.hint}>(mínimo 8 caracteres)</span></label>
            <div className={styles.passWrap}>
              <input
                id="cu-pass"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPass(v => !v)}
                tabIndex={-1}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="cu-role">Rol</label>
            <div className={styles.roleGroup} role="radiogroup">
              {ROLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={role === opt.value}
                  className={`${styles.roleChip} ${role === opt.value ? styles.roleChipActive : ''}`}
                  onClick={() => setRole(opt.value)}
                  style={role === opt.value ? {
                    borderColor: ROLE_COLOR[opt.value],
                    color: ROLE_COLOR[opt.value],
                    background: `${ROLE_COLOR[opt.value]}10`,
                  } : null}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}
          {success && <div className={styles.successBox}>{success}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={busy}>
              {busy ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsersPanel() {
  const { user: me } = useAuth()
  const [users,      setUsers]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [creating,   setCreating]   = useState(false)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [roleEditing, setRoleEditing] = useState(null) // {userId, newRole}
  const [savingRole, setSavingRole] = useState(false)

  const canManageRoles = me?.role === 'admin'

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await listUsers()
    if (!res.ok) {
      setError(res.error)
      setUsers([])
    } else {
      setUsers(res.users)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = users.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return u.email?.toLowerCase().includes(q) ||
           u.name?.toLowerCase().includes(q)
  })

  const counts = {
    total:   users.length,
    admin:   users.filter(u => u.role === 'admin').length,
    docente: users.filter(u => u.role === 'docente').length,
    student: users.filter(u => u.role === 'student').length,
  }

  function requestRoleChange(userId, currentRole, newRole) {
    if (currentRole === newRole) return
    setRoleEditing({ userId, currentRole, newRole })
  }

  async function confirmRoleChange() {
    if (!roleEditing) return
    setSavingRole(true)
    const res = await updateUserRole(roleEditing.userId, roleEditing.newRole)
    setSavingRole(false)
    if (!res.ok) {
      alert(`No se pudo cambiar el rol: ${res.error}`)
      setRoleEditing(null)
      return
    }
    setUsers(prev => prev.map(u => u.id === roleEditing.userId ? { ...u, role: roleEditing.newRole } : u))
    setRoleEditing(null)
  }

  function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Gestión de usuarios</h2>
          <p className={styles.sub}>
            {counts.total} usuarios · {counts.admin} admin · {counts.docente} docentes · {counts.student} estudiantes
            {!canManageRoles && (
              <span className={styles.readOnlyBadge}> · solo lectura (rol docente)</span>
            )}
          </p>
        </div>
        {canManageRoles && (
          <button className={styles.btnPrimary} onClick={() => setCreating(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" width="14" height="14" style={{ marginRight: 6 }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo usuario
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxLength={80}
        />
        <select
          className={styles.roleSelect}
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">Todos los roles</option>
          <option value="admin">Administradores</option>
          <option value="docente">Docentes</option>
          <option value="student">Estudiantes</option>
        </select>
      </div>

      {/* ── Lista ── */}
      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="ld" style={{ padding: 40 }}><div className="sp" /><p>Cargando usuarios...</p></div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyBox}>
          <h3>Sin usuarios</h3>
          <p>{users.length === 0 ? 'Aún no hay cuentas creadas.' : 'Ningún usuario coincide con los filtros.'}</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Creado</th>
                <th>Último ingreso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className={u.id === me?.id ? styles.rowSelf : ''}>
                  <td>
                    <div className={styles.userName}>
                      {u.name}
                      {u.id === me?.id && <span className={styles.youTag}>tú</span>}
                    </div>
                  </td>
                  <td className={styles.cellMono}>{u.email ?? '—'}</td>
                  <td>
                    {canManageRoles ? (
                      <select
                        className={styles.roleInline}
                        value={u.role}
                        onChange={e => requestRoleChange(u.id, u.role, e.target.value)}
                        style={{
                          borderColor: ROLE_COLOR[u.role] ?? 'var(--border)',
                          color: ROLE_COLOR[u.role] ?? 'var(--text)',
                        }}
                      >
                        {ROLE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                  <td className={styles.cellMuted}>{formatDate(u.created_at)}</td>
                  <td className={styles.cellMuted}>{formatDate(u.last_sign_in)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => refresh()}
      />

      <ConfirmDialog
        open={!!roleEditing}
        title="Cambiar rol del usuario"
        message={roleEditing
          ? `¿Cambiar el rol de "${users.find(u => u.id === roleEditing.userId)?.name}" de ${ROLE_LABEL[roleEditing.currentRole]} a ${ROLE_LABEL[roleEditing.newRole]}?`
          : ''}
        confirmLabel={savingRole ? 'Aplicando...' : 'Cambiar rol'}
        cancelLabel="Cancelar"
        loading={savingRole}
        onConfirm={confirmRoleChange}
        onCancel={() => !savingRole && setRoleEditing(null)}
      />
    </div>
  )
}
