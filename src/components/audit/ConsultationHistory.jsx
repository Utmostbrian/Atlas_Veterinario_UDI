import { useState, useEffect, useCallback } from 'react'
import { getHistory, exportToCsv, clearHistory } from '../../services/auditService'
import { SearchIcon, FileTextIcon, CalculatorIcon, CheckSquareIcon, SparklesIcon, FileEditIcon, ZapIcon } from '../../Icons/Icons'
import ConfirmDialog from '../ui/ConfirmDialog'

const EVENT_META = {
  DRUG_SEARCH:       { label: 'Búsqueda',        color: '#003087', Icon: SearchIcon      },
  DOSE_CALCULATED:   { label: 'Dosis calculada',  color: '#16a34a', Icon: CalculatorIcon  },
  DOSE_VALIDATED:    { label: 'Dosis validada',   color: '#7c3aed', Icon: CheckSquareIcon },
  AI_CONSULTATION:   { label: 'Consulta IA',      color: '#CC0000', Icon: SparklesIcon    },
  PRESCRIPTION_GEN:  { label: 'Receta generada',  color: '#9A3412', Icon: FileEditIcon    },
  INTERACTION_CHECK: { label: 'Interacciones',    color: '#d97706', Icon: ZapIcon         },
}

export default function ConsultationHistory() {
  const [items,       setItems]       = useState([])
  const [filterType,  setFilterType]  = useState('')
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(0)
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [clearing,    setClearing]    = useState(false)
  const LIMIT = 15

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getHistory({ limit: LIMIT, offset: page * LIMIT, eventType: filterType || undefined, search: search || undefined })
    setItems(res.items)
    setTotal(res.total)
    setLoading(false)
  }, [page, filterType, search])

  useEffect(() => { load() }, [load])

  // B-01: clamp page to valid range when total changes (e.g. filter reduces results)
  useEffect(() => {
    setPage(p => {
      if (total === 0) return 0
      const maxPage = Math.ceil(total / LIMIT) - 1
      return p > maxPage ? maxPage : p
    })
  }, [total])

  function handleClear() {
    setConfirmOpen(true)
  }

  async function confirmClear() {
    // ConsultationHistory solo es visible para admin (tab gated en App.jsx),
    // así que scope='all' borra el historial completo.
    setClearing(true)
    try {
      const res = await clearHistory({ scope: 'all' })
      if (!res.ok) {
        setConfirmOpen(false)
        alert(`No se pudo limpiar el historial: ${res.error}`)
        return
      }
      setItems([]); setTotal(0)
      setConfirmOpen(false)
    } finally {
      setClearing(false)
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="hist-hdr">
        <div>
          <h2>
            <FileTextIcon size={22} style={{ color: 'var(--blue)' }} />
            Log de Eventos
          </h2>
          <p>
            Registro detallado de todas las acciones del sistema. Filtra por tipo o por texto.
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

      <ConfirmDialog
        open={confirmOpen}
        title="Borrar todo el historial"
        message="Se eliminarán TODOS los registros de auditoría del sistema (búsquedas, cálculos, recetas, consultas IA) de todos los usuarios. Esta acción no se puede deshacer."
        confirmLabel="Borrar historial"
        cancelLabel="Cancelar"
        destructive
        loading={clearing}
        onConfirm={confirmClear}
        onCancel={() => { if (!clearing) setConfirmOpen(false) }}
      />
    </div>
  )
}
