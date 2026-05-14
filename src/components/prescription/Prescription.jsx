import { useState, useRef } from 'react'
import { logPrescription } from '../../services/auditService'
import { FileEditIcon, SyringeIcon, CheckSquareIcon } from '../../Icons/Icons'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'

const SPECIES = ['Perro', 'Gato', 'Bovino', 'Equino', 'Ovino', 'Porcino', 'Caprino', 'Ave']
const ROUTES  = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario', 'Intravaginal']
const EMPTY_DRUG = { name: '', dose: '', route: 'VO (oral)', freq: '', duration: '', notes: '' }

export default function Prescription() {
  const previewRef = useRef(null)
  const [patient, setPatient]     = useState({ name:'', species:'Perro', breed:'', weight:'', age:'', owner:'', ownerPhone:'' })
  const [drugs, setDrugs]         = useState([{ ...EMPTY_DRUG }])
  const [diagnosis, setDiagnosis] = useState('')
  const [vetName, setVetName]     = useState('')
  const [vetReg, setVetReg]       = useState('')
  const [generated, setGenerated] = useState(false)

  function updatePatient(f, v) { setPatient(p => ({ ...p, [f]: v })) }
  function updateDrug(idx, f, v) { setDrugs(prev => prev.map((d, i) => i === idx ? { ...d, [f]: v } : d)) }
  function addDrug() { setDrugs(p => [...p, { ...EMPTY_DRUG }]) }
  function removeDrug(idx) { if (drugs.length > 1) setDrugs(p => p.filter((_, i) => i !== idx)) }

  function generatePrescription() {
    if (!vetName.trim()) {
      alert('Por favor ingresa el nombre del veterinario antes de generar la receta.')
      return
    }
    if (!vetReg.trim()) {
      alert('El número de registro profesional es obligatorio. Una receta sin matrícula no tiene validez legal.')
      return
    }
    if (!drugs.some(d => d.name.trim())) {
      alert('Agrega al menos un medicamento con nombre para generar la receta.')
      return
    }
    setGenerated(true)
    logPrescription({ drugName: drugs.map(d => d.name).filter(Boolean).join(', '), species: patient.species, weight: patient.weight, owner: patient.owner })
  }

  function handlePrint() {
    const el = previewRef.current
    if (!el) return
    const win = window.open('', '_blank', 'width=860,height=900')
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receta Veterinaria · UDI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --blue: #CC0000; --red: #CC0000;
      --dark: #1a1a2e; --text: #374151;
      --soft: #6B7280; --gl: #f8f9fa;
      --border: #e5e7eb;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'EB Garamond', serif; background: #fff; padding: 32px; color: var(--text); }
    strong { font-weight: 700; }
    .receta-preview { background: #fff; }
    @media print {
      body { padding: 16px; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  ${el.outerHTML}
  <script>
    window.onload = function() { window.print(); setTimeout(function(){ window.close(); }, 800); }
  </script>
</body>
</html>`)
    win.document.close()
  }

  const today = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="wrap">
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: '1.35rem', color: 'var(--dark)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <FileEditIcon size={22} style={{ color: 'var(--blue)' }} />
          Generador de Recetas Veterinarias
        </h2>
        <p style={{ fontSize: '.83rem', color: 'var(--soft)' }}>Completa los datos y genera una receta profesional lista para imprimir.</p>
      </div>

      {/* ── Form — full width ── */}
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
                <input className="fc" value={patient.name} onChange={e => updatePatient('name', e.target.value)} placeholder="Ej: Luna" />
              </div>
              <div className="fgrp">
                <label className="flbl">Especie</label>
                <select className="fc" value={patient.species} onChange={e => updatePatient('species', e.target.value)}>
                  {SPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="receta-3col">
              <div className="fgrp">
                <label className="flbl">Raza</label>
                <input className="fc" value={patient.breed} onChange={e => updatePatient('breed', e.target.value)} placeholder="Ej: Golden" />
              </div>
              <div className="fgrp">
                <label className="flbl">Peso (kg)</label>
                <input className="fc" type="number" value={patient.weight} onChange={e => updatePatient('weight', e.target.value)} placeholder="28" />
              </div>
              <div className="fgrp">
                <label className="flbl">Edad</label>
                <input className="fc" value={patient.age} onChange={e => updatePatient('age', e.target.value)} placeholder="3 años" />
              </div>
            </div>
            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Propietario</label>
                <input className="fc" value={patient.owner} onChange={e => updatePatient('owner', e.target.value)} placeholder="Nombre del dueño" />
              </div>
              <div className="fgrp">
                <label className="flbl">Teléfono</label>
                <input className="fc" value={patient.ownerPhone} onChange={e => updatePatient('ownerPhone', e.target.value)} placeholder="+591 7..." />
              </div>
            </div>
          </div>

          {/* Diagnóstico */}
          <div className="receta-section">
            <div className="receta-section-title">Diagnóstico / Indicación</div>
            <textarea className="fc" rows={2} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Diagnóstico clínico o indicación terapéutica..." style={{ resize: 'vertical' }} />
          </div>

          {/* Medicamentos */}
          <div className="receta-section">
            <div className="receta-section-title">
              <SyringeIcon size={15} style={{ color: 'var(--red)', marginRight: 2 }} />
              Medicamentos Prescritos
            </div>
            {drugs.map((d, idx) => (
              <div key={idx} className="rx-item" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.8rem', fontWeight: 700, color: 'var(--soft)', marginBottom: 9 }}>
                  <span>Medicamento {idx + 1}</span>
                  {drugs.length > 1 && <button className="rx-remove" onClick={() => removeDrug(idx)}>×</button>}
                </div>
                <div className="receta-2col">
                  <div className="fgrp">
                    <label className="flbl">Fármaco</label>
                    <input className="fc" value={d.name} onChange={e => updateDrug(idx, 'name', e.target.value)} placeholder="Ej: Amoxicilina 500mg" />
                  </div>
                  <div className="fgrp">
                    <label className="flbl">Dosis</label>
                    <input className="fc" value={d.dose} onChange={e => updateDrug(idx, 'dose', e.target.value)} placeholder="Ej: 1 comprimido" />
                  </div>
                </div>
                <div className="receta-3col">
                  <div className="fgrp">
                    <label className="flbl">Vía</label>
                    <select className="fc" value={d.route} onChange={e => updateDrug(idx, 'route', e.target.value)}>
                      {ROUTES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="fgrp">
                    <label className="flbl">Frecuencia</label>
                    <input className="fc" value={d.freq} onChange={e => updateDrug(idx, 'freq', e.target.value)} placeholder="c/12 h" />
                  </div>
                  <div className="fgrp">
                    <label className="flbl">Duración</label>
                    <input className="fc" value={d.duration} onChange={e => updateDrug(idx, 'duration', e.target.value)} placeholder="7 días" />
                  </div>
                </div>
                <div className="fgrp">
                  <label className="flbl">Notas / Instrucciones</label>
                  <input className="fc" value={d.notes} onChange={e => updateDrug(idx, 'notes', e.target.value)} placeholder="Ej: Administrar con alimento" />
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
                <label className="flbl">Nombre completo</label>
                <input className="fc" value={vetName} onChange={e => setVetName(e.target.value)} placeholder="Dr. / Dra." />
              </div>
              <div className="fgrp">
                <label className="flbl">N° Registro / Matrícula</label>
                <input className="fc" value={vetReg} onChange={e => setVetReg(e.target.value)} placeholder="MV-12345" />
              </div>
            </div>
          </div>

          <button className="btnp" onClick={generatePrescription} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CheckSquareIcon size={17} />
            Generar Receta
          </button>
        </div>
      </div>

      {/* ── Preview — below form ── */}
      {generated && (
        <div>
          <div ref={previewRef} className="receta-preview show" style={{ fontFamily: "'EB Garamond',serif" }}>
            {/* Header documento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '2px solid var(--blue)' }}>
              <img src={udiLogo} alt="UDI" style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>Facultad de Veterinaria · UDI</div>
                <div style={{ fontSize: 12, color: 'var(--soft)' }}>Universidad para el Desarrollo y la Innovación · Santa Cruz</div>
              </div>
            </div>

            <h2 style={{ fontSize: 14, fontWeight: 800, textAlign: 'center', color: 'var(--dark)', marginBottom: 4, letterSpacing: '.04em', fontFamily: "'Playfair Display',serif" }}>RECETA MÉDICO-VETERINARIA</h2>
            <div style={{ fontSize: 12, color: 'var(--soft)', textAlign: 'right', marginBottom: 16 }}>Fecha: {today}</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>PACIENTE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13, color: 'var(--text)' }}>
                <span><strong>Nombre:</strong> {patient.name || '—'}</span>
                <span><strong>Especie:</strong> {patient.species}</span>
                <span><strong>Raza:</strong> {patient.breed || '—'}</span>
                <span><strong>Peso:</strong> {patient.weight ? `${patient.weight} kg` : '—'}</span>
                <span><strong>Edad:</strong> {patient.age || '—'}</span>
                <span><strong>Propietario:</strong> {patient.owner || '—'}</span>
              </div>
            </div>

            {diagnosis && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>DIAGNÓSTICO</div>
                <p style={{ fontSize: 13, color: 'var(--text)' }}>{diagnosis}</p>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>℞ PRESCRIPCIÓN</div>
              {drugs.map((d, i) => d.name && (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{i + 1}. {d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', paddingLeft: 12, marginTop: 2 }}>Dosis: {d.dose} | Vía: {d.route} | {d.freq} | Duración: {d.duration}</div>
                  {d.notes && <div style={{ fontSize: 11, color: 'var(--soft)', paddingLeft: 12, fontStyle: 'italic' }}>* {d.notes}</div>}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid var(--dark)', width: 200, margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{vetName || 'Médico Veterinario'}</div>
              <div style={{ fontSize: 12, color: 'var(--soft)' }}>Reg. Prof.: {vetReg || '___________'}</div>
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
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir Receta
          </button>
        </div>
      )}
    </div>
  )
}
