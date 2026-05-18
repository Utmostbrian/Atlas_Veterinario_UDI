import { useState, useEffect, useCallback } from 'react'
import { getHistory, getStats, exportToCsv, clearHistory } from '../../services/auditService'
import { SearchIcon, FileTextIcon, CalculatorIcon, CheckSquareIcon, SparklesIcon, FileEditIcon, ZapIcon, SyringeIcon } from '../../Icons/Icons'

const EVENT_META = {
  DRUG_SEARCH:       { label: 'Búsqueda',        color: '#003087', Icon: SearchIcon      },
  DOSE_CALCULATED:   { label: 'Dosis calculada',  color: '#16a34a', Icon: CalculatorIcon  },
  DOSE_VALIDATED:    { label: 'Dosis validada',   color: '#7c3aed', Icon: CheckSquareIcon },
  AI_CONSULTATION:   { label: 'Consulta IA',      color: '#CC0000', Icon: SparklesIcon    },
  PRESCRIPTION_GEN:  { label: 'Receta generada',  color: '#9A3412', Icon: FileEditIcon    },
  INTERACTION_CHECK: { label: 'Interacciones',    color: '#d97706', Icon: ZapIcon         },
}

function StatCard({ Icon, label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-ico" style={{ background: `${color}1a`, color }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="stat-val">{value}</div>
        <div className="stat-lbl">{label}</div>
      </div>
    </div>
  )
}

export default function ConsultationHistory() {
  const [items,       setItems]       = useState([])
  const [stats,       setStats]       = useState(null)
  const [filterType,  setFilterType]  = useState('')
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(0)
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const LIMIT = 15

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getHistory({ limit: LIMIT, offset: page * LIMIT, eventType: filterType || undefined, search: search || undefined })
    setItems(res.items)
    setTotal(res.total)
    setLoading(false)
  }, [page, filterType, search])

  useEffect(() => { load() }, [load])

  // C-03: getStats is async — must await; also normalize snake_case → camelCase
  useEffect(() => {
    getStats().then(data => {
      if (!data) return
      setStats({
        total:        data.total        ?? 0,
        today:        data.today        ?? 0,
        byType:       data.by_type      ?? data.byType      ?? {},
        mostSearched: data.top_drugs?.[0]?.drug_name ?? data.mostSearched ?? null,
      })
    }).catch(() => setStats(null))
  }, [items])

  // B-01: clamp page to valid range when total changes (e.g. filter reduces results)
  useEffect(() => {
    setPage(p => {
      if (total === 0) return 0
      const maxPage = Math.ceil(total / LIMIT) - 1
      return p > maxPage ? maxPage : p
    })
  }, [total])

  async function handleClear() {
    // ConsultationHistory solo es visible para admin (tab gated en App.jsx),
    // así que scope='all' borra el historial completo.
    if (!window.confirm('¿Borrar TODO el historial del sistema? Esta acción no se puede deshacer.')) return
    const res = await clearHistory({ scope: 'all' })
    if (!res.ok) { alert(`No se pudo limpiar el historial: ${res.error}`); return }
    setItems([]); setTotal(0); setStats(null)
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="wrap">
      {/* ── Header ── */}
      <div className="hist-hdr">
        <div>
          <h2>
            <FileTextIcon size={22} style={{ color: 'var(--blue)' }} />
            Historial de Consultas
          </h2>
          <p>
            Módulo de Auditoría — registro de todas las acciones del sistema.
            <span className="sp-badge">Listo para Procedimientos Almacenados</span>
          </p>
        </div>
        <div className="hist-acts">
          <button className="btnp" onClick={exportToCsv} disabled={total === 0} style={{ width: 'auto', padding: '8px 18px' }}>
            Exportar CSV
          </button>
          <button className="btnp btnr" onClick={handleClear} disabled={total === 0} style={{ width: 'auto', padding: '8px 18px' }}>
            Limpiar
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="stat-row">
          <StatCard Icon={FileTextIcon}  label="Total registros" value={stats.total}                        color="#003087" />
          <StatCard Icon={FileTextIcon}  label="Hoy"             value={stats.today}                        color="#16a34a" />
          <StatCard Icon={SearchIcon}    label="Búsquedas"       value={stats.byType?.DRUG_SEARCH || 0}     color="#d97706" />
          <StatCard Icon={SparklesIcon}  label="Consultas IA"    value={stats.byType?.AI_CONSULTATION || 0} color="#CC0000" />
          {stats.mostSearched && (
            <StatCard Icon={SyringeIcon} label="Más buscado"     value={stats.mostSearched}                 color="#7c3aed" />
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="hist-filters">
        <div className="hist-search">
          <SearchIcon size={16} />
          <input
            placeholder="Buscar fármaco, consulta..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            maxLength={100}
          />
        </div>
        <select
          className="fc"
          style={{ width: 'auto', minWidth: 180 }}
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(0) }}
        >
          <option value="">Todos los tipos</option>
          {Object.entries(EVENT_META).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="ld"><div className="sp" /><p>Cargando historial...</p></div>
      ) : items.length === 0 ? (
        <div className="empty">
          <FileTextIcon size={40} style={{ color: 'var(--border)', marginBottom: 10 }} />
          <h3>Sin registros</h3>
          <p>Las búsquedas, cálculos y consultas con IA aparecerán aquí automáticamente.</p>
        </div>
      ) : (
        <>
          <div className="hist-tbl-wrap">
            <table className="hist-tbl">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha / Hora</th>
                  <th>Fármaco</th>
                  <th>Especie</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const ev = EVENT_META[item.eventType] || { label: item.eventType, color: 'var(--gray)', Icon: FileTextIcon }
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="evt-badge" style={{ background: `${ev.color}18`, color: ev.color }}>
                          {ev.label}
                        </span>
                      </td>
                      <td style={{ color: 'var(--soft)', fontSize: '.78rem' }}>{formatDate(item.timestamp)}</td>
                      <td>{item.drugName || item.drug || '—'}</td>
                      <td>{item.species || '—'}</td>
                      <td style={{ color: 'var(--soft)', fontSize: '.78rem' }}>
                        {item.doseCalculated
                          ? `${item.doseCalculated} mg → ${item.volMl} mL`
                          : item.query?.slice(0, 60) || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="hist-page">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
            <span>Página {page + 1} de {Math.ceil(total / LIMIT)}</span>
            <button disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
          </div>
        </>
      )}

      {/* ── SP Info box ── */}
      <div className="sp-box">
        <h4>Arquitectura para Procedimientos Almacenados</h4>
        <p>
          Este módulo está preparado para conectarse a un backend. Cada evento llama a{' '}
          <code>auditService.logEvent()</code> que invoca <code>POST /api/audit/log</code>,
          donde el servidor ejecuta <code>EXEC sp_InsertAuditLog</code>.
        </p>
        <div className="sp-code">
          {`-- SQL Server ejemplo\nEXEC sp_InsertAuditLog\n  @EventType   = 'DOSE_CALCULATED',\n  @DrugName    = 'Amoxicilina',\n  @Species     = 'Perro',\n  @Weight      = 25.0,\n  @TotalDose   = 275.00,\n  @UserId      = NULL,\n  @Timestamp   = GETDATE()`}
        </div>
      </div>
    </div>
  )
}
