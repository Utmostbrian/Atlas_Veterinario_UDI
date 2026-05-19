import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { savePrescription } from '../../services/prescriptionService'
import { getAnimals, searchAnimalsLocal } from '../../services/catalogService'
import { DRUGS_DATABASE } from '../../data/drugsDatabase'
import { FileEditIcon, SyringeIcon, CheckSquareIcon } from '../../Icons/Icons'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'

const ROUTES = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario', 'Intravaginal']
const AGE_UNITS = ['días', 'meses', 'años']

// EMPTY_DRUG: el campo route arranca vacío para que la cascada
// fármaco→vía pueda imponer la primera opción válida.
const EMPTY_DRUG = () => ({ name: '', dose: '', route: '', freq: '', duration: '', notes: '' })

// Parseo de dosis ingresada por el usuario: extrae mg/kg si está expresado así.
// "5 mg/kg" → 5 | "0.2 mg/kg c/12h" → 0.2 | "1 comprimido" → null
function parseMgPerKg(doseStr) {
  if (!doseStr) return null
  const m = String(doseStr).match(/(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*kg/i)
  if (!m) return null
  return parseFloat(m[1].replace(',', '.'))
}

// Devuelve la entrada de DRUGS_DATABASE por coincidencia case-insensitive
// del nombre (acepta "Amoxicilina 500 mg" → match "Amoxicilina").
function matchDrugRules(drugInput) {
  if (!drugInput) return null
  const q = drugInput.trim().toLowerCase()
  if (!q) return null
  const keys = Object.keys(DRUGS_DATABASE)
  const exact = keys.find(k => k.toLowerCase() === q)
  if (exact) return { key: exact, rules: DRUGS_DATABASE[exact] }
  const partial = keys.find(k => q.startsWith(k.toLowerCase()) || q.includes(k.toLowerCase()))
  if (partial) return { key: partial, rules: DRUGS_DATABASE[partial] }
  return null
}

export default function Prescription() {
  const { user } = useAuth()
  const previewRef = useRef(null)
  const speciesWrapRef = useRef(null)

  // patient.species = common_name (lo que ve el usuario, ej. "Vaca")
  // selectedAnimal = fila completa del catálogo (incluye standard_species y rango de peso)
  const [patient,   setPatient]   = useState({ name: '', species: '', breed: '', weight: '', ageValue: '', ageUnit: 'años', owner: '', ownerPhone: '' })
  const [drugs,     setDrugs]     = useState([EMPTY_DRUG()])
  const [diagnosis, setDiagnosis] = useState('')
  const [vetName,   setVetName]   = useState('')
  const [vetReg,    setVetReg]    = useState('')
  const [generated, setGenerated] = useState(false)
  const [errors,    setErrors]    = useState({})
  const [saving,    setSaving]    = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // 'saved' | 'error' | null

  // Catálogo de animales — carga única al montar, búsqueda local.
  const [animals,          setAnimals]          = useState([])
  const [selectedAnimal,   setSelectedAnimal]   = useState(null)
  const [speciesOpen,      setSpeciesOpen]      = useState(false)
  const [speciesHighlight, setSpeciesHighlight] = useState(0)
  const [catalogError,     setCatalogError]     = useState(null)

  useEffect(() => {
    let alive = true
    getAnimals()
      .then(rows => { if (alive) setAnimals(rows) })
      .catch(err => { if (alive) setCatalogError(err.message) })
    return () => { alive = false }
  }, [])

  // Cierra el dropdown al hacer click fuera
  useEffect(() => {
    if (!speciesOpen) return
    const onClick = (ev) => {
      if (speciesWrapRef.current && !speciesWrapRef.current.contains(ev.target)) {
        setSpeciesOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [speciesOpen])

  // Sugerencias filtradas (memoizadas)
  const speciesSuggestions = useMemo(() => {
    if (!animals.length) return []
    return searchAnimalsLocal(animals, patient.species, 8)
  }, [animals, patient.species])

  // Standard species derivado del seleccionado (clave clínica)
  const stdSpecies = selectedAnimal?.standard_species || null

  // Pre-llenar datos del veterinario desde el perfil de usuario.
  // Sólo dependemos de user — vetName/vetReg quedan fuera intencionalmente para
  // evitar re-disparar cuando el usuario edite los campos manualmente.
  useEffect(() => {
    if (user?.name && !vetName)          setVetName(user.name)
    if (user?.licenseNumber && !vetReg)  setVetReg(user.licenseNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Selecciona un animal del dropdown: setea common_name y guarda la fila completa.
  function pickAnimal(row) {
    setSelectedAnimal(row)
    setPatient(prev => ({ ...prev, species: row.common_name }))
    setSpeciesOpen(false)
    setErrors(prev => { const e = { ...prev }; delete e.species; delete e.weight; return e })
  }

  // Edita el input de especie: si no hay match exacto, invalida la selección.
  function onSpeciesChange(value) {
    setPatient(prev => ({ ...prev, species: value }))
    setSpeciesOpen(true)
    setSpeciesHighlight(0)
    // Invalida la selección previa si el texto ya no coincide
    if (selectedAnimal && selectedAnimal.common_name.toLowerCase() !== value.trim().toLowerCase()) {
      setSelectedAnimal(null)
    }
    if (errors.species) setErrors(prev => { const e = { ...prev }; delete e.species; return e })
  }

  function onSpeciesKeyDown(ev) {
    if (!speciesOpen) return
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setSpeciesHighlight(i => Math.min(i + 1, speciesSuggestions.length - 1))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setSpeciesHighlight(i => Math.max(i - 1, 0))
    } else if (ev.key === 'Enter') {
      if (speciesSuggestions[speciesHighlight]) {
        ev.preventDefault()
        pickAnimal(speciesSuggestions[speciesHighlight])
      }
    } else if (ev.key === 'Escape') {
      setSpeciesOpen(false)
    }
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

    // Especie debe estar en el catálogo (no se permite texto libre).
    if (!patient.species.trim()) {
      e.species = 'La especie es obligatoria.'
    } else if (!selectedAnimal) {
      e.species = 'Especie no reconocida en el sistema. Selecciona una opción del catálogo.'
    }

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
      // Cascada fármaco→vía: si el fármaco tiene reglas y la vía no está permitida,
      // bloquear submit con un error claro.
      const match = matchDrugRules(d.name)
      if (match && d.route && Array.isArray(match.rules.allowedRoutes)
          && !match.rules.allowedRoutes.includes(d.route)) {
        e[`drug_${idx}_route`] = `Vía no permitida para ${match.key}.`
      }
    })

    // Validar peso: debe ser número positivo y, si hay animal seleccionado,
    // debe estar dentro del rango de la especie.
    if (patient.weight !== '') {
      const w = parseFloat(patient.weight)
      if (isNaN(w) || w <= 0) {
        e.weight = 'El peso debe ser un número mayor a 0.'
      } else if (selectedAnimal) {
        const min = parseFloat(selectedAnimal.weight_range_min)
        const max = parseFloat(selectedAnimal.weight_range_max)
        if (w < min || w > max) {
          e.weight = `Peso fuera de rango para ${selectedAnimal.common_name} (${min}–${max} kg).`
        }
      }
    }

    // Edad: si se ingresó un valor, debe ser número positivo
    if (patient.ageValue !== '' && patient.ageValue != null) {
      const a = parseFloat(patient.ageValue)
      if (isNaN(a) || a <= 0) e.age = 'La edad debe ser un número mayor a 0.'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Calcula advertencia mg/kg para una droga concreta dado el peso y la especie estándar.
  // No bloquea; devuelve un objeto {message} cuando hay que mostrar warning.
  function doseWarning(drug) {
    if (!stdSpecies || !drug?.name?.trim() || !drug?.dose?.trim()) return null
    const w = parseFloat(patient.weight)
    if (!w || w <= 0) return null
    const match = matchDrugRules(drug.name)
    if (!match) return null
    const range = match.rules.dosageRange?.[stdSpecies]
    if (!range || range.min == null || range.max == null) {
      // El fármaco no tiene rango clínico para esa especie estándar
      const allowed = Object.keys(match.rules.dosageRange || {}).join(', ')
      return { type: 'info', message: `${match.key} no tiene rango clínico para ${stdSpecies}${allowed ? ` (usa: ${allowed})` : ''}.` }
    }
    const mgkg = parseMgPerKg(drug.dose)
    if (mgkg == null) return null
    if (mgkg > range.max) {
      return { type: 'warn', message: `Dosis ${mgkg} mg/kg supera el máximo (${range.max} mg/kg) para ${match.key} en ${stdSpecies}.` }
    }
    if (mgkg < range.min) {
      return { type: 'info', message: `Dosis ${mgkg} mg/kg por debajo del mínimo (${range.min} mg/kg) para ${match.key} en ${stdSpecies}.` }
    }
    return null
  }

  // Devuelve la lista de vías permitidas para el fármaco; si no hay match,
  // devuelve el set completo.
  function allowedRoutesFor(drugName) {
    const match = matchDrugRules(drugName)
    if (!match || !Array.isArray(match.rules.allowedRoutes)) return ROUTES
    return ROUTES.filter(r => match.rules.allowedRoutes.includes(r))
  }

  async function handleGenerate() {
    if (!validate()) return

    setGenerated(true)

    // Solo guardar en Supabase si hay sesión activa
    if (!user) return

    // Enriquecer drugs con mg_per_kg + max_allowed_mgkg para que el SP
    // pueda detectar override y registrar PRESCRIPTION_DOSE_OVERRIDE.
    const enrichedDrugs = drugs
      .filter(d => d.name.trim())
      .map(d => {
        const enriched = { ...d }
        const match = matchDrugRules(d.name)
        const mgkg = parseMgPerKg(d.dose)
        if (mgkg != null) enriched.mg_per_kg = mgkg
        if (match && stdSpecies) {
          const range = match.rules.dosageRange?.[stdSpecies]
          if (range?.max != null) enriched.max_allowed_mgkg = range.max
        }
        return enriched
      })

    // Edad consolidada en un único string para la columna patient_age (TEXT)
    const ageString = patient.ageValue
      ? `${patient.ageValue} ${patient.ageUnit}`
      : ''

    const patientForSave = {
      ...patient,
      species: selectedAnimal?.common_name || patient.species,
      age: ageString,
    }

    setSaving(true)
    try {
      await savePrescription({
        patient: patientForSave,
        drugs: enrichedDrugs,
        diagnosis,
        vetName,
        vetLicense: vetReg,
        animalId: selectedAnimal?.id ?? null,
      })
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

    // M-08: document.write está deprecated y bloqueado bajo COEP/COOP estrictos.
    // Usamos blob URL como fuente del popup; si el browser lo bloquea, abrimos
    // como link (fallback A-03). Sin document.write en ningún caso.
    const printHtml = `<!DOCTYPE html>
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
    window.addEventListener('load', function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    });
  </script>
</body>
</html>`

    const blob = new Blob([printHtml], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)

    // N4: window.open con noopener en el tercer arg fuerza retorno null en
    // navegadores modernos, lo que activaba el fallback siempre y abría
    // dos pestañas. Quitamos noopener; el doc del print no comparte origen
    // con la SPA (es un blob:), así que el riesgo de window.opener es mínimo.
    const win = window.open(url, '_blank', 'width=860,height=900')
    if (!win) {
      // Popup bloqueado → fallback como link
      const a = document.createElement('a')
      a.href   = url
      a.target = '_blank'
      a.rel    = 'noopener noreferrer'
      a.click()
    }
    // Limpieza diferida: el navegador necesita el blob mientras imprime
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
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
              <div className="fgrp" ref={speciesWrapRef} style={{ position: 'relative' }}>
                <label className="flbl">Especie <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input
                  className={`fc${errors.species ? ' fc--err' : ''}`}
                  type="text"
                  value={patient.species}
                  onChange={e => onSpeciesChange(e.target.value)}
                  onFocus={() => setSpeciesOpen(true)}
                  onKeyDown={onSpeciesKeyDown}
                  placeholder="Ej: Vaca, Perro, Oveja…"
                  autoComplete="off"
                  spellCheck={false}
                />
                {speciesOpen && speciesSuggestions.length > 0 && (
                  <ul className="fc-autocomplete-list" role="listbox">
                    {speciesSuggestions.map((row, i) => (
                      <li
                        key={row.id}
                        role="option"
                        aria-selected={i === speciesHighlight}
                        className={`fc-autocomplete-item${i === speciesHighlight ? ' is-active' : ''}`}
                        onMouseDown={(ev) => { ev.preventDefault(); pickAnimal(row) }}
                        onMouseEnter={() => setSpeciesHighlight(i)}
                      >
                        <span style={{ fontWeight: 600 }}>{row.common_name}</span>
                        <span style={{ color: 'var(--soft)', fontSize: '.75rem', marginLeft: 6 }}>
                          → {row.standard_species} · {row.weight_range_min}–{row.weight_range_max} kg
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {errors.species && <p className="fc-err-msg">{errors.species}</p>}
                {!errors.species && selectedAnimal && (
                  <p className="fc-hint-msg">
                    Especie clínica: <strong>{selectedAnimal.standard_species}</strong> · rango {selectedAnimal.weight_range_min}–{selectedAnimal.weight_range_max} kg
                  </p>
                )}
                {catalogError && <p className="fc-err-msg">{catalogError}</p>}
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className={`fc${errors.age ? ' fc--err' : ''}`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={patient.ageValue}
                    onChange={e => updatePatient('ageValue', e.target.value)}
                    placeholder="3"
                    style={{ flex: '1 1 0' }}
                  />
                  <select
                    className="fc"
                    value={patient.ageUnit}
                    onChange={e => updatePatient('ageUnit', e.target.value)}
                    style={{ flex: '0 0 110px' }}
                  >
                    {AGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {errors.age && <p className="fc-err-msg">{errors.age}</p>}
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
                      placeholder="Ej: 5 mg/kg o 1 comprimido" />
                    {errors[`drug_${idx}_dose`] && <p className="fc-err-msg">{errors[`drug_${idx}_dose`]}</p>}
                    {(() => {
                      const w = doseWarning(d)
                      if (!w) return null
                      const cls = w.type === 'warn' ? 'fc-warn-msg' : 'fc-hint-msg'
                      return <p className={cls}>{w.message}</p>
                    })()}
                  </div>
                </div>
                <div className="receta-3col">
                  <div className="fgrp">
                    <label className="flbl">Vía</label>
                    {(() => {
                      const routesForDrug = allowedRoutesFor(d.name)
                      const match = matchDrugRules(d.name)
                      return (
                        <>
                          <select
                            className={`fc${errors[`drug_${idx}_route`] ? ' fc--err' : ''}`}
                            value={d.route}
                            onChange={e => updateDrug(idx, 'route', e.target.value)}
                          >
                            <option value="">Selecciona…</option>
                            {routesForDrug.map(r => <option key={r}>{r}</option>)}
                          </select>
                          {errors[`drug_${idx}_route`] && (
                            <p className="fc-err-msg">{errors[`drug_${idx}_route`]}</p>
                          )}
                          {!errors[`drug_${idx}_route`] && match && routesForDrug.length < ROUTES.length && (
                            <p className="fc-hint-msg">Vías filtradas para {match.key}.</p>
                          )}
                        </>
                      )
                    })()}
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
                {patient.ageValue && <span><strong>Edad:</strong> {patient.ageValue} {patient.ageUnit}</span>}
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
