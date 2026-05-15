import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { savePrescription } from '../../services/prescriptionService'
import { FileEditIcon, SyringeIcon, CheckSquareIcon } from '../../Icons/Icons'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'

const SPECIES   = ['Perro', 'Gato', 'Bovino', 'Equino', 'Ovino', 'Porcino', 'Caprino', 'Ave']
const ROUTES    = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario', 'Intravaginal']
const EMPTY_DRUG = () => ({ name: '', dose: '', route: 'VO (oral)', freq: '', duration: '', notes: '' })

export default function Prescription() {
  const { user } = useAuth()
  const previewRef = useRef(null)

  const [patient,   setPatient]   = useState({ name: '', species: 'Perro', breed: '', weight: '', age: '', owner: '', ownerPhone: '' })
  const [drugs,     setDrugs]     = useState([EMPTY_DRUG()])
  const [diagnosis, setDiagnosis] = useState('')
  const [vetName,   setVetName]   = useState('')
  const [vetReg,    setVetReg]    = useState('')
  const [generated, setGenerated] = useState(false)
  const [errors,    setErrors]    = useState({})
  const [saving,    setSaving]    = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // 'saved' | 'error' | null

  // Pre-llenar datos del veterinario desde el perfil de usuario
  useEffect(() => {
    if (user?.name && !vetName)          setVetName(user.name)
    if (user?.licenseNumber && !vetReg)  setVetReg(user.licenseNumber)
  }, [user])

  // Limpia el status de guardado después de 4 segundos
  useEffect(() => {
    if (!saveStatus) return
    const t = setTimeout(() => setSaveStatus(null), 4000)
    return () => clearTimeout(t)
  }, [saveStatus])

  function updatePatient(field, value) {
    setPatient(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e })
  }

  function updateDrug(idx, field, value) {
    setDrugs(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
    const key = `drug_${idx}_${field}`
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e })
  }

  function addDrug() {
    setDrugs(prev => [...prev, EMPTY_DRUG()])
  }

  function removeDrug(idx) {
    if (drugs.length <= 1) return
    setDrugs(prev => prev.filter((_, i) => i !== idx))
    // Limpiar errores de ese medicamento
    setErrors(prev => {
      const cleaned = { ...prev }
      Object.keys(cleaned).forEach(k => { if (k.startsWith(`drug_${idx}_`)) delete cleaned[k] })
      return cleaned
    })
  }

  function validate() {
    const e = {}

    if (!vetName.trim())    e.vetName = 'El nombre del veterinario es obligatorio.'
    if (!vetReg.trim())     e.vetReg  = 'El N° de registro/matrícula es obligatorio.'
    if (!patient.species)   e.species = 'La especie es obligatoria.'

    const validDrugs = drugs.filter(d => d.name.trim())
    if (validDrugs.length === 0) {
      e.drugs_global = 'Agrega al menos un medicamento con nombre.'
    }

    // Validar medicamentos con nombre: deben tener dosis y frecuencia
    drugs.forEach((d, idx) => {
      if (!d.name.trim()) return
      if (!d.dose.trim())     e[`drug_${idx}_dose`]     = 'Ingresa la dosis.'
      if (!d.freq.trim())     e[`drug_${idx}_freq`]      = 'Ingresa la frecuencia.'
      if (!d.duration.trim()) e[`drug_${idx}_duration`]  = 'Ingresa la duración.'
    })

    // Validar peso si se ingresó: debe ser un número positivo
    if (patient.weight !== '') {
      const w = parseFloat(patient.weight)
      if (isNaN(w) || w <= 0) e.weight = 'El peso debe ser un número mayor a 0.'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleGenerate() {
    if (!validate()) return

    setGenerated(true)

    // Solo guardar en Supabase si hay sesión activa
    if (!user) return

    setSaving(true)
    try {
      await savePrescription({ patient, drugs, diagnosis, vetName, vetLicense: vetReg })
      setSaveStatus('saved')
    } catch (err) {
      console.error('Error guardando receta:', err)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    const el = previewRef.current
    if (!el) return

    const win = window.open('', '_blank', 'width=860,height=900')
    // Guard: popups pueden estar bloqueados
    if (!win) {
      alert('Tu navegador bloqueó la ventana emergente. Habilita los popups para esta página y vuelve a intentarlo.')
      return
    }

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Receta Veterinaria · UDI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
  <style>
    :root { --blue:#CC0000; --dark:#1a1a2e; --text:#374151; --soft:#6B7280; --gl:#f8f9fa; --border:#e5e7eb; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'EB Garamond',serif; background:#fff; padding:32px; color:var(--text); }
    strong { font-weight:700; }
    button { display:none !important; }
    @media print { body { padding:16px; } }
  </style>
</head>
<body>
  ${el.innerHTML}
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    };
  </script>
</body>
</html>`)
    win.document.close()
  }

  const today = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })
  const validDrugsForPreview = drugs.filter(d => d.name.trim())

  return (
    <div className="wrap">
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.35rem', color: 'var(--dark)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <FileEditIcon size={22} style={{ color: 'var(--blue)' }} />
          Generador de Recetas Veterinarias
        </h2>
        <p style={{ fontSize: '.83rem', color: 'var(--soft)' }}>
          Completa los datos y genera una receta profesional lista para imprimir.
          {user && <span style={{ marginLeft: 6, color: 'var(--blue)' }}>· La receta se guardará en tu historial.</span>}
        </p>
      </div>

      {/* ── Formulario ── */}
      <div className="receta-form" style={{ marginBottom: 24 }}>
        <div className="receta-hdr">
          <div className="receta-hdr-text">
            <h3>Datos del Paciente</h3>
            <p>Facultad de Veterinaria · UDI</p>
          </div>
        </div>

        <div className="receta-body">

          {/* Paciente */}
          <div className="receta-section">
            <div className="receta-section-title">Paciente</div>
            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Nombre del animal</label>
                <input className="fc" value={patient.name}
                  onChange={e => updatePatient('name', e.target.value)} placeholder="Ej: Luna" />
              </div>
              <div className="fgrp">
                <label className="flbl">Especie <span style={{ color: 'var(--blue)' }}>*</span></label>
                <select className={`fc${errors.species ? ' fc--err' : ''}`} value={patient.species}
                  onChange={e => updatePatient('species', e.target.value)}>
                  {SPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
                {errors.species && <p className="fc-err-msg">{errors.species}</p>}
              </div>
            </div>
            <div className="receta-3col">
              <div className="fgrp">
                <label className="flbl">Raza</label>
                <input className="fc" value={patient.breed}
                  onChange={e => updatePatient('breed', e.target.value)} placeholder="Ej: Golden" />
              </div>
              <div className="fgrp">
                <label className="flbl">Peso (kg)</label>
                <input className={`fc${errors.weight ? ' fc--err' : ''}`}
                  type="number" min="0.01" step="0.1" value={patient.weight}
                  onChange={e => updatePatient('weight', e.target.value)} placeholder="28" />
                {errors.weight && <p className="fc-err-msg">{errors.weight}</p>}
              </div>
              <div className="fgrp">
                <label className="flbl">Edad</label>
                <input className="fc" value={patient.age}
                  onChange={e => updatePatient('age', e.target.value)} placeholder="3 años" />
              </div>
            </div>
            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Propietario</label>
                <input className="fc" value={patient.owner}
                  onChange={e => updatePatient('owner', e.target.value)} placeholder="Nombre del dueño" />
              </div>
              <div className="fgrp">
                <label className="flbl">Teléfono</label>
                <input className="fc" value={patient.ownerPhone}
                  onChange={e => updatePatient('ownerPhone', e.target.value)} placeholder="+591 7..." />
              </div>
            </div>
          </div>

          {/* Diagnóstico */}
          <div className="receta-section">
            <div className="receta-section-title">Diagnóstico / Indicación</div>
            <textarea className="fc" rows={2} value={diagnosis}
              onChange={e => setDiagnosis(e.target.value)}
              placeholder="Diagnóstico clínico o indicación terapéutica..."
              style={{ resize: 'vertical' }} />
          </div>

          {/* Medicamentos */}
          <div className="receta-section">
            <div className="receta-section-title">
              <SyringeIcon size={15} style={{ color: 'var(--blue)', marginRight: 2 }} />
              Medicamentos Prescritos <span style={{ color: 'var(--blue)' }}>*</span>
            </div>
            {errors.drugs_global && (
              <p className="fc-err-msg" style={{ marginBottom: 8 }}>{errors.drugs_global}</p>
            )}
            {drugs.map((d, idx) => (
              <div key={idx} className="rx-item" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.8rem', fontWeight: 700, color: 'var(--soft)', marginBottom: 9 }}>
                  <span>Medicamento {idx + 1}</span>
                  {drugs.length > 1 && (
                    <button className="rx-remove" onClick={() => removeDrug(idx)}>×</button>
                  )}
                </div>
                <div className="receta-2col">
                  <div className="fgrp">
                    <label className="flbl">Fármaco <span style={{ color: 'var(--blue)' }}>*</span></label>
                    <input className={`fc${errors.drugs_global ? ' fc--err' : ''}`}
                      value={d.name} onChange={e => updateDrug(idx, 'name', e.target.value)}
                      placeholder="Ej: Amoxicilina 500 mg" />
                  </div>
                  <div className="fgrp">
                    <label className="flbl">
                      Dosis {d.name.trim() && <span style={{ color: 'var(--blue)' }}>*</span>}
                    </label>
                    <input className={`fc${errors[`drug_${idx}_dose`] ? ' fc--err' : ''}`}
                      value={d.dose} onChange={e => updateDrug(idx, 'dose', e.target.value)}
                      placeholder="Ej: 1 comprimido" />
                    {errors[`drug_${idx}_dose`] && <p className="fc-err-msg">{errors[`drug_${idx}_dose`]}</p>}
                  </div>
                </div>
                <div className="receta-3col">
                  <div className="fgrp">
                    <label className="flbl">Vía</label>
                    <select className="fc" value={d.route}
                      onChange={e => updateDrug(idx, 'route', e.target.value)}>
                      {ROUTES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="fgrp">
                    <label className="flbl">
                      Frecuencia {d.name.trim() && <span style={{ color: 'var(--blue)' }}>*</span>}
                    </label>
                    <input className={`fc${errors[`drug_${idx}_freq`] ? ' fc--err' : ''}`}
                      value={d.freq} onChange={e => updateDrug(idx, 'freq', e.target.value)}
                      placeholder="c/12 h" />
                    {errors[`drug_${idx}_freq`] && <p className="fc-err-msg">{errors[`drug_${idx}_freq`]}</p>}
                  </div>
                  <div className="fgrp">
                    <label className="flbl">
                      Duración {d.name.trim() && <span style={{ color: 'var(--blue)' }}>*</span>}
                    </label>
                    <input className={`fc${errors[`drug_${idx}_duration`] ? ' fc--err' : ''}`}
                      value={d.duration} onChange={e => updateDrug(idx, 'duration', e.target.value)}
                      placeholder="7 días" />
                    {errors[`drug_${idx}_duration`] && <p className="fc-err-msg">{errors[`drug_${idx}_duration`]}</p>}
                  </div>
                </div>
                <div className="fgrp">
                  <label className="flbl">Notas / Instrucciones</label>
                  <input className="fc" value={d.notes}
                    onChange={e => updateDrug(idx, 'notes', e.target.value)}
                    placeholder="Ej: Administrar con alimento" />
                </div>
              </div>
            ))}
            <button
              onClick={addDrug}
              style={{ width: '100%', padding: '9px', border: '1px dashed var(--border)', borderRadius: 'var(--rs)', color: 'var(--soft)', fontSize: '.82rem', background: 'none', cursor: 'pointer', marginTop: 4, transition: '.2s', fontFamily: "'Source Sans 3',sans-serif" }}
            >
              + Agregar medicamento
            </button>
          </div>

          {/* Veterinario */}
          <div className="receta-section">
            <div className="receta-section-title">Datos del Veterinario</div>
            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Nombre completo <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input className={`fc${errors.vetName ? ' fc--err' : ''}`}
                  value={vetName} onChange={e => { setVetName(e.target.value); if (errors.vetName) setErrors(p => ({ ...p, vetName: undefined })) }}
                  placeholder="Dr. / Dra." />
                {errors.vetName && <p className="fc-err-msg">{errors.vetName}</p>}
              </div>
              <div className="fgrp">
                <label className="flbl">N° Registro / Matrícula <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input className={`fc${errors.vetReg ? ' fc--err' : ''}`}
                  value={vetReg} onChange={e => { setVetReg(e.target.value); if (errors.vetReg) setErrors(p => ({ ...p, vetReg: undefined })) }}
                  placeholder="MV-12345" />
                {errors.vetReg && <p className="fc-err-msg">{errors.vetReg}</p>}
              </div>
            </div>
          </div>

          {/* Botón Generar */}
          <button
            className="btnp"
            onClick={handleGenerate}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? (
              <>
                <span className="sp" style={{ width: 16, height: 16 }} />
                Guardando...
              </>
            ) : (
              <>
                <CheckSquareIcon size={17} />
                Generar Receta
              </>
            )}
          </button>

          {/* Status de guardado */}
          {saveStatus === 'saved' && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(22,163,74,.12)', borderRadius: 8, fontSize: '.83rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Receta guardada en tu historial.
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(220,38,38,.10)', borderRadius: 8, fontSize: '.83rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              No se pudo guardar en el servidor. La receta se muestra correctamente.
            </div>
          )}
        </div>
      </div>

      {/* ── Vista previa e impresión ── */}
      {generated && validDrugsForPreview.length > 0 && (
        <div>
          <div ref={previewRef} className="receta-preview show" style={{ fontFamily: "'EB Garamond',serif" }}>

            {/* Encabezado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '2px solid var(--blue)' }}>
              <img src={udiLogo} alt="UDI" style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>Facultad de Veterinaria · UDI</div>
                <div style={{ fontSize: 12, color: 'var(--soft)' }}>Universidad para el Desarrollo y la Innovación · Santa Cruz</div>
              </div>
            </div>

            <h2 style={{ fontSize: 14, fontWeight: 800, textAlign: 'center', color: 'var(--dark)', marginBottom: 4, letterSpacing: '.04em', fontFamily: "'Playfair Display',serif" }}>
              RECETA MÉDICO-VETERINARIA
            </h2>
            <div style={{ fontSize: 12, color: 'var(--soft)', textAlign: 'right', marginBottom: 16 }}>Fecha: {today}</div>

            {/* Paciente */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>PACIENTE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13, color: 'var(--text)' }}>
                {patient.name    && <span><strong>Nombre:</strong> {patient.name}</span>}
                <span><strong>Especie:</strong> {patient.species}</span>
                {patient.breed   && <span><strong>Raza:</strong> {patient.breed}</span>}
                {patient.weight  && <span><strong>Peso:</strong> {patient.weight} kg</span>}
                {patient.age     && <span><strong>Edad:</strong> {patient.age}</span>}
                {patient.owner   && <span><strong>Propietario:</strong> {patient.owner}</span>}
                {patient.ownerPhone && <span><strong>Tel.:</strong> {patient.ownerPhone}</span>}
              </div>
            </div>

            {/* Diagnóstico */}
            {diagnosis.trim() && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>DIAGNÓSTICO</div>
                <p style={{ fontSize: 13, color: 'var(--text)' }}>{diagnosis}</p>
              </div>
            )}

            {/* Prescripción */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>&#8478; PRESCRIPCIÓN</div>
              {validDrugsForPreview.map((d, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{i + 1}. {d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', paddingLeft: 12, marginTop: 2 }}>
                    Dosis: {d.dose}
                    {d.route    && ` | Vía: ${d.route}`}
                    {d.freq     && ` | ${d.freq}`}
                    {d.duration && ` | Duración: ${d.duration}`}
                  </div>
                  {d.notes.trim() && (
                    <div style={{ fontSize: 11, color: 'var(--soft)', paddingLeft: 12, fontStyle: 'italic' }}>* {d.notes}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Firma */}
            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid var(--dark)', width: 200, margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{vetName}</div>
              <div style={{ fontSize: 12, color: 'var(--soft)' }}>Médico Veterinario · Reg. Prof.: {vetReg}</div>
            </div>

            <div style={{ marginTop: 20, fontSize: 10, color: 'var(--soft)', textAlign: 'center', borderTop: '1px solid var(--gl)', paddingTop: 10 }}>
              Receta válida por 30 días · Facultad de Veterinaria UDI · {today}
            </div>
          </div>

          <button
            className="btnp"
            onClick={handlePrint}
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={17} height={17}>
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir Receta
          </button>
        </div>
      )}
    </div>
  )
}
