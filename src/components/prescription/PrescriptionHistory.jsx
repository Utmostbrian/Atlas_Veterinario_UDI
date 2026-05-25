import { useEffect, useMemo, useState } from 'react'
import { getPrescriptions } from '../../services/prescriptionService'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { useAuth } from '../../context/AuthContext'
import { FileTextIcon, SearchIcon } from '../../Icons/Icons'

const PAGE_SIZE = 20

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function parseDrugs(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toDateInputValue(value) {
  if (!value) return ''
  const dateValue = new Date(value)
  const year = dateValue.getFullYear()
  const month = String(dateValue.getMonth() + 1).padStart(2, '0')
  const day = String(dateValue.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function speciesLabel(row) {
  if (row.patient_species_other) return `${row.patient_species} (${row.patient_species_other})`
  return row.patient_species || '-'
}

function drugSummary(row) {
  const drugs = parseDrugs(row.drugs)
  if (!drugs.length) return '-'
  if (drugs.length === 1) return drugs[0].name || '-'
  return `${drugs[0].name || 'Farmaco'} +${drugs.length - 1}`
}

function printPrescription(row) {
  const drugs = parseDrugs(row.drugs)
  const date = formatDate(row.created_at)
  const drugsHtml = drugs.map((drug, index) => `
    <div style="margin-bottom:10px">
      <div style="font-size:14px;font-weight:700;color:var(--dark)">${index + 1}. ${escapeHtml(drug.name)}</div>
      <div style="font-size:12px;color:var(--text);padding-left:12px;margin-top:2px">
        ${drug.quantity ? `Cantidad: ${escapeHtml(drug.quantity)} | ` : ''}
        ${drug.dose ? `Dosis: ${escapeHtml(drug.dose)} | ` : ''}
        ${drug.route ? `Via: ${escapeHtml(drug.route)} | ` : ''}
        ${drug.freq ? `${escapeHtml(drug.freq)} | ` : ''}
        ${drug.duration ? `Duracion: ${escapeHtml(drug.duration)}` : ''}
      </div>
      ${drug.notes ? `<div style="font-size:11px;color:var(--soft);padding-left:12px;font-style:italic">* ${escapeHtml(drug.notes)}</div>` : ''}
    </div>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Receta Veterinaria UDI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
  <style>
    :root { --blue:#CC0000; --dark:#1a1a2e; --text:#374151; --soft:#6B7280; --gl:#f8f9fa; --border:#e5e7eb; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'EB Garamond',serif; background:#fff; padding:32px; color:var(--text); }
    strong { font-weight:700; }
    @media print { body { padding:16px; } }
  </style>
</head>
<body>
  <div style="border:2px solid var(--blue);border-radius:8px;padding:28px 32px">
    <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:2px solid var(--blue)">
      <div style="font-family:'Playfair Display',serif;font-size:15px;font-weight:800;color:var(--blue)">Facultad de Veterinaria - UDI</div>
      <div style="font-size:12px;color:var(--soft)">Universidad para el Desarrollo y la Innovacion - Santa Cruz</div>
    </div>
    <h2 style="font-size:14px;font-weight:800;text-align:center;color:var(--dark);margin-bottom:4px;letter-spacing:.04em;font-family:'Playfair Display',serif">RECETA MEDICO-VETERINARIA</h2>
    <div style="font-size:12px;color:var(--soft);text-align:right;margin-bottom:16px">Fecha: ${escapeHtml(date)}</div>
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--blue);margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid var(--gl)">PACIENTE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:13px;color:var(--text)">
        <span><strong>Nombre:</strong> ${escapeHtml(row.patient_name || 'Sin nombre')}</span>
        <span><strong>Especie:</strong> ${escapeHtml(speciesLabel(row))}</span>
        ${row.patient_breed ? `<span><strong>Raza:</strong> ${escapeHtml(row.patient_breed)}</span>` : ''}
        ${row.patient_weight ? `<span><strong>Peso:</strong> ${escapeHtml(row.patient_weight)} kg</span>` : ''}
        ${row.patient_age ? `<span><strong>Edad:</strong> ${escapeHtml(row.patient_age)}</span>` : ''}
        ${row.owner_name ? `<span><strong>Propietario:</strong> ${escapeHtml(row.owner_name)}</span>` : ''}
        ${row.owner_phone ? `<span><strong>Tel.:</strong> ${escapeHtml(row.owner_phone)}</span>` : ''}
      </div>
    </div>
    ${row.diagnosis ? `
      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--blue);margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid var(--gl)">DIAGNOSTICO</div>
        <p style="font-size:13px;color:var(--text)">${escapeHtml(row.diagnosis)}</p>
      </div>` : ''}
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--blue);margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid var(--gl)">&#8478; PRESCRIPCION</div>
      ${drugsHtml}
    </div>
    <div style="margin-top:28px;text-align:center">
      <div style="border-top:1px solid var(--dark);width:200px;margin:0 auto 8px"></div>
      <div style="font-size:13px;font-weight:700;color:var(--dark)">${escapeHtml(row.vet_name)}</div>
      <div style="font-size:12px;color:var(--soft)">Medico Veterinario - Reg. Prof.: ${escapeHtml(row.vet_license)}</div>
    </div>
  </div>
  <script>
    window.addEventListener('load', function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    });
  </script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'width=860,height=900')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function PrescriptionHistory() {
  const { user } = useAuth()
  const memoryScope = user?.id ?? 'anon'
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useLocalStorage(`vet_memory_${memoryScope}_rx_history_search`, '')
  const [date, setDate] = useLocalStorage(`vet_memory_${memoryScope}_rx_history_date`, '')
  const [page, setPage] = useLocalStorage(`vet_memory_${memoryScope}_rx_history_page`, 0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)

    getPrescriptions({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      search: search.trim() || undefined,
    })
      .then((res) => {
        if (!alive) return
        setItems(res.items)
        setTotal(res.total)
      })
      .catch((err) => {
        if (alive) setError(err.message || 'No se pudo cargar el historial.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => { alive = false }
  }, [page, search])

  const visibleItems = useMemo(() => {
    if (!date) return items
    return items.filter((item) => toDateInputValue(item.created_at) === date)
  }, [items, date])

  function handleClearMemory() {
    setSearch('')
    setDate('')
    setPage(0)
    setSelected(null)
  }

  return (
    <div className="wrap hist-page-wrap">
      <div className="hist-hdr">
        <div>
          <h2>
            <FileTextIcon size={22} style={{ color: 'var(--blue)' }} />
            Historial de Recetas
          </h2>
          <p>Recetas generadas por estudiantes, medicos y administradores.</p>
        </div>
        <button type="button" className="memory-clear-btn" onClick={handleClearMemory}>Limpiar</button>
      </div>

      <div className="hist-filters">
        <div className="hist-search">
          <SearchIcon size={16} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Buscar por paciente, propietario o diagnostico"
          />
        </div>
        <input
          className="fc hist-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-label="Filtrar por fecha"
        />
      </div>

      {loading && (
        <div className="ld">
          <div className="sp" />
          <p>Cargando historial...</p>
        </div>
      )}

      {error && <div className="fc-err-msg" style={{ marginBottom: 12 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="hist-tbl-wrap">
            <table className="hist-tbl">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Especie</th>
                  <th>Medicamentos</th>
                  <th>Veterinario</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <strong>{row.patient_name || 'Sin nombre'}</strong>
                      {row.owner_name && <div className="hist-subtle">{row.owner_name}</div>}
                    </td>
                    <td>{speciesLabel(row)}</td>
                    <td>{drugSummary(row)}</td>
                    <td>{row.vet_name || '-'}</td>
                    <td>
                      <div className="hist-row-actions">
                        <button type="button" onClick={() => setSelected(row)}>Ver detalle</button>
                        <button type="button" onClick={() => printPrescription(row)}>Reimprimir PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleItems.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--soft)', padding: 24 }}>
                      No hay recetas para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="hist-page">
            <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Anterior</button>
            <span>Pagina {page + 1} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
          </div>
        </>
      )}

      {selected && (
        <div className="rx-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <div className="rx-modal" role="dialog" aria-modal="true" aria-label="Detalle de receta" onClick={(event) => event.stopPropagation()}>
            <div className="rx-modal-head">
              <div>
                <h3>Detalle de receta</h3>
                <p>{formatDateTime(selected.created_at)}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar">x</button>
            </div>

            <div className="rx-detail-grid">
              <div><span>Paciente</span><strong>{selected.patient_name || 'Sin nombre'}</strong></div>
              <div><span>Especie</span><strong>{speciesLabel(selected)}</strong></div>
              <div><span>Peso</span><strong>{selected.patient_weight ? `${selected.patient_weight} kg` : '-'}</strong></div>
              <div><span>Veterinario</span><strong>{selected.vet_name || '-'}</strong></div>
            </div>

            {selected.diagnosis && (
              <div className="rx-detail-section">
                <h4>Diagnostico</h4>
                <p>{selected.diagnosis}</p>
              </div>
            )}

            <div className="rx-detail-section">
              <h4>Medicamentos</h4>
              {parseDrugs(selected.drugs).map((drug, index) => (
                <div key={`${drug.name}-${index}`} className="rx-detail-drug">
                  <strong>{index + 1}. {drug.name}</strong>
                  <span>
                    {drug.quantity ? `Cantidad: ${drug.quantity} | ` : ''}
                    {drug.dose ? `Dosis: ${drug.dose} | ` : ''}
                    {drug.route ? `Via: ${drug.route} | ` : ''}
                    {drug.freq ? `${drug.freq} | ` : ''}
                    {drug.duration ? `Duracion: ${drug.duration}` : ''}
                  </span>
                  {drug.notes && <em>{drug.notes}</em>}
                </div>
              ))}
            </div>

            <div className="rx-modal-actions">
              <button type="button" onClick={() => printPrescription(selected)}>Reimprimir PDF</button>
              <button type="button" onClick={() => setSelected(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
