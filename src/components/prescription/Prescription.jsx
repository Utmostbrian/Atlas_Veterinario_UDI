import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { savePrescription } from '../../services/prescriptionService'
import { getAnimals } from '../../services/catalogService'
import { CheckSquareIcon, FileEditIcon, FileTextIcon, SyringeIcon } from '../../Icons/Icons'
import udiLogo from '../../Icons/icons_final/UDILOGOSVG.svg'
import {
  AGE_UNITS,
  ATLAS_DRUG_NAMES,
  SPECIES_OPTIONS,
  findDrugMatch,
  getSpeciesOption,
  inputNumber,
  mapPrescriptionErrors,
  prescriptionSchema,
} from './prescriptionValidation'

const ROUTES = [
  'VO (oral)',
  'IM (intramuscular)',
  'IV (intravenosa)',
  'SC (subcutanea)',
  'Topico',
  'Intramamario',
  'Intravaginal',
  'Pour-on (bovino)',
]

const EMPTY_DRUG = () => ({
  name: '',
  quantity: '',
  dose: '',
  route: '',
  freq: '',
  duration: '',
  notes: '',
})

const INITIAL_DRUGS = [EMPTY_DRUG()]

const INITIAL_PATIENT = {
  name: '',
  species: '',
  speciesOther: '',
  breed: '',
  weight: '',
  ageValue: '',
  ageUnit: 'anos',
  owner: '',
  ownerPhone: '',
}

function parseMgPerKg(value) {
  const numeric = inputNumber(value)
  if (numeric != null) return numeric

  const match = String(value || '').match(/(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*kg/i)
  if (!match) return null
  return inputNumber(match[1])
}

function matchDrugRules(drugInput) {
  return findDrugMatch(drugInput)
}

function doseUnitFor(drugName) {
  return matchDrugRules(drugName)?.rules?.doseUnit || 'mg/kg'
}

function displayDose(drug) {
  const value = inputNumber(drug.dose)
  if (value == null) return drug.dose
  return `${value} ${doseUnitFor(drug.name)}`
}

function displayFrequency(drug) {
  const value = inputNumber(drug.freq)
  return value == null ? drug.freq : `cada ${value} h`
}

function displayDuration(drug) {
  const value = inputNumber(drug.duration)
  return value == null ? drug.duration : `${value} dias`
}

function displaySpecies(patient) {
  if (patient.species === 'Otros' && patient.speciesOther?.trim()) {
    return `Otros (${patient.speciesOther.trim()})`
  }
  return patient.species
}

function printElement(element, title = 'Receta Veterinaria UDI') {
  if (!element) return

  const printHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
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
  ${element.innerHTML}
  <script>
    window.addEventListener('load', function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    });
  </script>
</body>
</html>`

  const blob = new Blob([printHtml], { type: 'text/html' })
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

export default function Prescription() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const previewRef = useRef(null)
  const memoryScope = user?.id ?? 'anon'

  const [patient, setPatient] = useLocalStorage(`vet_memory_${memoryScope}_prescription_patient`, INITIAL_PATIENT)
  const [drugs, setDrugs] = useLocalStorage(`vet_memory_${memoryScope}_prescription_drugs`, INITIAL_DRUGS)
  const [diagnosis, setDiagnosis] = useLocalStorage(`vet_memory_${memoryScope}_prescription_diagnosis`, '')
  const [vetName, setVetName] = useLocalStorage(`vet_memory_${memoryScope}_prescription_vet_name`, '')
  const [vetReg, setVetReg] = useLocalStorage(`vet_memory_${memoryScope}_prescription_vet_reg`, '')
  const [generated, setGenerated] = useLocalStorage(`vet_memory_${memoryScope}_prescription_generated`, false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)

  const [animals, setAnimals] = useState([])
  const [catalogError, setCatalogError] = useState(null)

  useEffect(() => {
    let alive = true
    getAnimals()
      .then((rows) => {
        if (alive) setAnimals(rows)
      })
      .catch((err) => {
        if (alive) setCatalogError(err.message)
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (user?.name && !vetName) setVetName(user.name)
    if (user?.licenseNumber && !vetReg) setVetReg(user.licenseNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => {
    if (!saveStatus) return undefined
    const timer = setTimeout(() => setSaveStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  const speciesOption = useMemo(() => getSpeciesOption(patient.species), [patient.species])
  const selectedAnimal = useMemo(() => {
    if (!patient.species) return null
    const target = patient.species.toLowerCase()
    return animals.find((row) => row.common_name?.toLowerCase() === target) || null
  }, [animals, patient.species])
  const stdSpecies = speciesOption?.clinicalSpecies || selectedAnimal?.standard_species || null

  function clearError(key) {
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function updatePatient(field, value) {
    const nextValue = field === 'ownerPhone' ? value.replace(/\D/g, '') : value

    setPatient((prev) => ({
      ...prev,
      [field]: nextValue,
      ...(field === 'species' && nextValue !== 'Otros' ? { speciesOther: '' } : null),
    }))

    clearError(field === 'ageValue' ? 'age' : field)
    if (field === 'species') {
      clearError('speciesOther')
      clearError('weight')
    }
  }

  function allowedRoutesFor(drugName) {
    const match = matchDrugRules(drugName)
    if (!match || !Array.isArray(match.rules.allowedRoutes)) return ROUTES
    return match.rules.allowedRoutes
  }

  function updateDrug(idx, field, value) {
    setDrugs((prev) => prev.map((drug, i) => {
      if (i !== idx) return drug
      const next = { ...drug, [field]: value }
      if (field === 'name') {
        const allowedRoutes = allowedRoutesFor(value)
        if (next.route && !allowedRoutes.includes(next.route)) next.route = ''
      }
      return next
    }))

    clearError(`drug_${idx}_${field}`)
    if (field === 'name') clearError(`drug_${idx}_route`)
  }

  function addDrug() {
    setDrugs((prev) => [...prev, EMPTY_DRUG()])
  }

  function removeDrug(idx) {
    if (drugs.length <= 1) return
    setDrugs((prev) => prev.filter((_, i) => i !== idx))
    setErrors((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`drug_${idx}_`)) delete next[key]
      })
      return next
    })
  }

  function validate() {
    const result = prescriptionSchema.safeParse({ patient, drugs, diagnosis, vetName, vetReg })
    const nextErrors = result.success ? {} : mapPrescriptionErrors(result.error)

    drugs.forEach((drug, idx) => {
      const routes = allowedRoutesFor(drug.name)
      if (drug.route && !routes.includes(drug.route)) {
        nextErrors[`drug_${idx}_route`] = 'Via no permitida para este farmaco.'
      }
    })

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function doseWarning(drug) {
    if (!stdSpecies || !drug?.name?.trim() || !drug?.dose?.trim()) return null
    const match = matchDrugRules(drug.name)
    if (!match) return null

    const range = match.rules.dosageRange?.[stdSpecies]
    if (!range || range.min == null || range.max == null) {
      const allowed = Object.keys(match.rules.dosageRange || {}).join(', ')
      return {
        type: 'info',
        message: `${match.key} no tiene rango clinico para ${stdSpecies}${allowed ? ` (usa: ${allowed})` : ''}.`,
      }
    }

    const dose = parseMgPerKg(drug.dose)
    if (dose == null) return null
    if (dose > range.max) {
      return { type: 'warn', message: `Dosis ${dose} ${doseUnitFor(drug.name)} supera el maximo (${range.max}) para ${match.key} en ${stdSpecies}.` }
    }
    if (dose < range.min) {
      return { type: 'info', message: `Dosis ${dose} ${doseUnitFor(drug.name)} por debajo del minimo (${range.min}) para ${match.key} en ${stdSpecies}.` }
    }
    return null
  }

  async function handleGenerate() {
    if (!validate()) return

    setGenerated(true)
    if (!user) return

    const enrichedDrugs = drugs.map((drug) => {
      const match = matchDrugRules(drug.name)
      const doseValue = inputNumber(drug.dose)
      const doseUnit = doseUnitFor(drug.name)
      const enriched = {
        name: match?.key || drug.name.trim(),
        quantity: inputNumber(drug.quantity),
        dose: displayDose(drug),
        dose_value: doseValue,
        dose_unit: doseUnit,
        route: drug.route,
        freq: displayFrequency(drug),
        frequency_hours: inputNumber(drug.freq),
        duration: displayDuration(drug),
        duration_days: inputNumber(drug.duration),
        notes: drug.notes?.trim() || '',
      }

      if (doseUnit === 'mg/kg' && doseValue != null) enriched.mg_per_kg = doseValue
      if (match && stdSpecies && doseUnit === 'mg/kg') {
        const range = match.rules.dosageRange?.[stdSpecies]
        if (range?.max != null) enriched.max_allowed_mgkg = range.max
      }

      return enriched
    })

    const ageString = patient.ageValue ? `${patient.ageValue} ${patient.ageUnit}` : ''
    const patientForSave = {
      ...patient,
      species: patient.species,
      speciesOther: patient.species === 'Otros' ? patient.speciesOther.trim() : null,
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

  function handleClearMemory() {
    setPatient(INITIAL_PATIENT)
    setDrugs([EMPTY_DRUG()])
    setDiagnosis('')
    setVetName('')
    setVetReg('')
    setGenerated(false)
    setErrors({})
    setSaveStatus(null)
  }

  const today = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })
  const validDrugsForPreview = drugs.filter((drug) => drug.name.trim())

  return (
    <div className="wrap">
      <datalist id="atlas-drug-list">
        {ATLAS_DRUG_NAMES.map((name) => <option key={name} value={name} />)}
      </datalist>

      <div className="hist-hdr" style={{ marginBottom: 22 }}>
        <div>
          <h2>
            <FileEditIcon size={22} style={{ color: 'var(--blue)' }} />
            Generador de Recetas Veterinarias
          </h2>
          <p>
            Completa los datos y genera una receta profesional lista para imprimir.
            {user && <span style={{ marginLeft: 6, color: 'var(--blue)' }}>La receta se guardara en tu historial.</span>}
          </p>
        </div>
        <div className="memory-actions">
          <button type="button" className="memory-clear-btn" onClick={handleClearMemory}>Limpiar</button>
          {user && (
            <button
              type="button"
              className="hist-btn"
              onClick={() => navigate('/dashboard/recetas/historial')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <FileTextIcon size={15} />
              Historial
            </button>
          )}
        </div>
      </div>

      <div className="receta-form" style={{ marginBottom: 24 }}>
        <div className="receta-hdr">
          <div className="receta-hdr-text">
            <h3>Datos del Paciente</h3>
            <p>Facultad de Veterinaria - UDI</p>
          </div>
        </div>

        <div className="receta-body">
          <div className="receta-section">
            <div className="receta-section-title">Paciente</div>

            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Nombre del animal</label>
                <input
                  className={`fc${errors.name ? ' fc--err' : ''}`}
                  value={patient.name}
                  onChange={(event) => updatePatient('name', event.target.value)}
                  placeholder="Ej: Luna"
                />
                {errors.name && <p className="fc-err-msg">{errors.name}</p>}
              </div>

              <div className="fgrp">
                <label className="flbl">Especie <span style={{ color: 'var(--blue)' }}>*</span></label>
                <select
                  className={`fc${errors.species ? ' fc--err' : ''}`}
                  value={patient.species}
                  onChange={(event) => updatePatient('species', event.target.value)}
                >
                  <option value="">Selecciona...</option>
                  {SPECIES_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {errors.species && <p className="fc-err-msg">{errors.species}</p>}
                {!errors.species && speciesOption && (
                  <p className="fc-hint-msg">
                    Rango esperado: <strong>{speciesOption.minKg}-{speciesOption.maxKg} kg</strong>
                    {stdSpecies && ` - clave clinica: ${stdSpecies}`}
                  </p>
                )}
                {catalogError && <p className="fc-err-msg">{catalogError}</p>}
              </div>
            </div>

            {patient.species === 'Otros' && (
              <div className="fgrp">
                <label className="flbl">Especifique la especie <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input
                  className={`fc${errors.speciesOther ? ' fc--err' : ''}`}
                  value={patient.speciesOther}
                  onChange={(event) => updatePatient('speciesOther', event.target.value)}
                  placeholder="Ej: Conejo, cobayo, pez ornamental"
                />
                {errors.speciesOther && <p className="fc-err-msg">{errors.speciesOther}</p>}
              </div>
            )}

            <div className="receta-3col">
              <div className="fgrp">
                <label className="flbl">Raza</label>
                <input
                  className={`fc${errors.breed ? ' fc--err' : ''}`}
                  value={patient.breed}
                  onChange={(event) => updatePatient('breed', event.target.value)}
                  placeholder="Ej: Golden"
                />
                {errors.breed && <p className="fc-err-msg">{errors.breed}</p>}
              </div>

              <div className="fgrp">
                <label className="flbl">Peso (kg) <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input
                  className={`fc${errors.weight ? ' fc--err' : ''}`}
                  type="number"
                  min={speciesOption?.minKg ?? 0.1}
                  max={speciesOption?.maxKg ?? 1000}
                  step="0.1"
                  value={patient.weight}
                  onChange={(event) => updatePatient('weight', event.target.value)}
                  placeholder="28"
                />
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
                    onChange={(event) => updatePatient('ageValue', event.target.value)}
                    placeholder="3"
                    style={{ flex: '1 1 0' }}
                  />
                  <select
                    className="fc"
                    value={patient.ageUnit}
                    onChange={(event) => updatePatient('ageUnit', event.target.value)}
                    style={{ flex: '0 0 110px' }}
                  >
                    {AGE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
                {errors.age && <p className="fc-err-msg">{errors.age}</p>}
              </div>
            </div>

            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Propietario</label>
                <input
                  className={`fc${errors.owner ? ' fc--err' : ''}`}
                  value={patient.owner}
                  onChange={(event) => updatePatient('owner', event.target.value)}
                  placeholder="Nombre del propietario"
                />
                {errors.owner && <p className="fc-err-msg">{errors.owner}</p>}
              </div>

              <div className="fgrp">
                <label className="flbl">Telefono</label>
                <input
                  className={`fc${errors.ownerPhone ? ' fc--err' : ''}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={patient.ownerPhone}
                  onChange={(event) => updatePatient('ownerPhone', event.target.value)}
                  placeholder="Ej: 70000000"
                />
                {errors.ownerPhone && <p className="fc-err-msg">{errors.ownerPhone}</p>}
              </div>
            </div>
          </div>

          <div className="receta-section">
            <div className="receta-section-title">Diagnostico / Indicacion</div>
            <textarea
              className={`fc${errors.diagnosis ? ' fc--err' : ''}`}
              rows={2}
              value={diagnosis}
              onChange={(event) => {
                setDiagnosis(event.target.value)
                clearError('diagnosis')
              }}
              placeholder="Diagnostico clinico o indicacion terapeutica..."
              style={{ resize: 'vertical' }}
            />
            {errors.diagnosis && <p className="fc-err-msg">{errors.diagnosis}</p>}
          </div>

          <div className="receta-section">
            <div className="receta-section-title">
              <SyringeIcon size={15} style={{ color: 'var(--blue)', marginRight: 2 }} />
              Medicamentos Prescritos <span style={{ color: 'var(--blue)' }}>*</span>
            </div>
            {errors.drugs_global && <p className="fc-err-msg" style={{ marginBottom: 8 }}>{errors.drugs_global}</p>}

            {drugs.map((drug, idx) => {
              const routesForDrug = allowedRoutesFor(drug.name)
              const match = matchDrugRules(drug.name)
              const unit = doseUnitFor(drug.name)
              const warning = doseWarning(drug)

              return (
                <div key={idx} className="rx-item" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.8rem', fontWeight: 700, color: 'var(--soft)', marginBottom: 9 }}>
                    <span>Medicamento {idx + 1}</span>
                    {drugs.length > 1 && (
                      <button type="button" className="rx-remove" onClick={() => removeDrug(idx)} aria-label={`Eliminar medicamento ${idx + 1}`}>
                        x
                      </button>
                    )}
                  </div>

                  <div className="receta-2col">
                    <div className="fgrp">
                      <label className="flbl">Farmaco <span style={{ color: 'var(--blue)' }}>*</span></label>
                      <input
                        className={`fc${errors[`drug_${idx}_name`] ? ' fc--err' : ''}`}
                        list="atlas-drug-list"
                        value={drug.name}
                        onChange={(event) => updateDrug(idx, 'name', event.target.value)}
                        placeholder="Buscar en Atlas Farmacologico"
                        autoComplete="off"
                      />
                      {errors[`drug_${idx}_name`] && <p className="fc-err-msg">{errors[`drug_${idx}_name`]}</p>}
                      {!errors[`drug_${idx}_name`] && match && (
                        <p className="fc-hint-msg">Farmaco validado: <strong>{match.key}</strong></p>
                      )}
                    </div>

                    <div className="fgrp">
                      <label className="flbl">Cantidad <span style={{ color: 'var(--blue)' }}>*</span></label>
                      <input
                        className={`fc${errors[`drug_${idx}_quantity`] ? ' fc--err' : ''}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={drug.quantity}
                        onChange={(event) => updateDrug(idx, 'quantity', event.target.value)}
                        placeholder="Ej: 10"
                      />
                      {errors[`drug_${idx}_quantity`] && <p className="fc-err-msg">{errors[`drug_${idx}_quantity`]}</p>}
                    </div>
                  </div>

                  <div className="receta-3col">
                    <div className="fgrp">
                      <label className="flbl">Dosis ({unit}) <span style={{ color: 'var(--blue)' }}>*</span></label>
                      <input
                        className={`fc${errors[`drug_${idx}_dose`] ? ' fc--err' : ''}`}
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={drug.dose}
                        onChange={(event) => updateDrug(idx, 'dose', event.target.value)}
                        placeholder="Ej: 5"
                      />
                      {errors[`drug_${idx}_dose`] && <p className="fc-err-msg">{errors[`drug_${idx}_dose`]}</p>}
                      {warning && <p className={warning.type === 'warn' ? 'fc-warn-msg' : 'fc-hint-msg'}>{warning.message}</p>}
                    </div>

                    <div className="fgrp">
                      <label className="flbl">Via <span style={{ color: 'var(--blue)' }}>*</span></label>
                      <select
                        className={`fc${errors[`drug_${idx}_route`] ? ' fc--err' : ''}`}
                        value={drug.route}
                        onChange={(event) => updateDrug(idx, 'route', event.target.value)}
                      >
                        <option value="">Selecciona...</option>
                        {routesForDrug.map((route) => <option key={route} value={route}>{route}</option>)}
                      </select>
                      {errors[`drug_${idx}_route`] && <p className="fc-err-msg">{errors[`drug_${idx}_route`]}</p>}
                      {!errors[`drug_${idx}_route`] && match && routesForDrug.length < ROUTES.length && (
                        <p className="fc-hint-msg">Vias filtradas para {match.key}.</p>
                      )}
                    </div>

                    <div className="fgrp">
                      <label className="flbl">Frecuencia (cada N horas) <span style={{ color: 'var(--blue)' }}>*</span></label>
                      <input
                        className={`fc${errors[`drug_${idx}_freq`] ? ' fc--err' : ''}`}
                        type="number"
                        min="1"
                        max="168"
                        step="1"
                        value={drug.freq}
                        onChange={(event) => updateDrug(idx, 'freq', event.target.value)}
                        placeholder="Ej: 12"
                      />
                      {errors[`drug_${idx}_freq`] && <p className="fc-err-msg">{errors[`drug_${idx}_freq`]}</p>}
                    </div>
                  </div>

                  <div className="receta-2col">
                    <div className="fgrp">
                      <label className="flbl">Duracion (dias) <span style={{ color: 'var(--blue)' }}>*</span></label>
                      <input
                        className={`fc${errors[`drug_${idx}_duration`] ? ' fc--err' : ''}`}
                        type="number"
                        min="1"
                        max="365"
                        step="1"
                        value={drug.duration}
                        onChange={(event) => updateDrug(idx, 'duration', event.target.value)}
                        placeholder="Ej: 7"
                      />
                      {errors[`drug_${idx}_duration`] && <p className="fc-err-msg">{errors[`drug_${idx}_duration`]}</p>}
                    </div>

                    <div className="fgrp">
                      <label className="flbl">Notas / Instrucciones</label>
                      <input
                        className="fc"
                        value={drug.notes}
                        onChange={(event) => updateDrug(idx, 'notes', event.target.value)}
                        placeholder="Ej: Administrar con alimento"
                      />
                    </div>
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              onClick={addDrug}
              style={{ width: '100%', padding: '9px', border: '1px dashed var(--border)', borderRadius: 'var(--rs)', color: 'var(--soft)', fontSize: '.82rem', background: 'none', cursor: 'pointer', marginTop: 4, transition: '.2s', fontFamily: "'Source Sans 3',sans-serif" }}
            >
              + Agregar medicamento
            </button>
          </div>

          <div className="receta-section">
            <div className="receta-section-title">Datos del Veterinario</div>
            <div className="receta-2col">
              <div className="fgrp">
                <label className="flbl">Nombre completo <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input
                  className={`fc${errors.vetName ? ' fc--err' : ''}`}
                  value={vetName}
                  onChange={(event) => {
                    setVetName(event.target.value)
                    clearError('vetName')
                  }}
                  placeholder="Dr. / Dra."
                />
                {errors.vetName && <p className="fc-err-msg">{errors.vetName}</p>}
              </div>

              <div className="fgrp">
                <label className="flbl">Registro / Matricula <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input
                  className={`fc${errors.vetReg ? ' fc--err' : ''}`}
                  value={vetReg}
                  onChange={(event) => {
                    setVetReg(event.target.value)
                    clearError('vetReg')
                  }}
                  placeholder="MV-12345"
                />
                {errors.vetReg && <p className="fc-err-msg">{errors.vetReg}</p>}
              </div>
            </div>
          </div>

          <button
            type="button"
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

          {saveStatus === 'saved' && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(22,163,74,.12)', borderRadius: 8, fontSize: '.83rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
              Receta guardada en tu historial.
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(220,38,38,.10)', borderRadius: 8, fontSize: '.83rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
              No se pudo guardar en el servidor. La receta se muestra correctamente.
            </div>
          )}
        </div>
      </div>

      {generated && validDrugsForPreview.length > 0 && (
        <div>
          <div ref={previewRef} className="receta-preview show" style={{ fontFamily: "'EB Garamond',serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '2px solid var(--blue)' }}>
              <img src={udiLogo} alt="UDI" style={{ width: 56, height: 56, objectFit: 'contain', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 800, color: 'var(--blue)' }}>Facultad de Veterinaria - UDI</div>
                <div style={{ fontSize: 12, color: 'var(--soft)' }}>Universidad para el Desarrollo y la Innovacion - Santa Cruz</div>
              </div>
            </div>

            <h2 style={{ fontSize: 14, fontWeight: 800, textAlign: 'center', color: 'var(--dark)', marginBottom: 4, letterSpacing: '.04em', fontFamily: "'Playfair Display',serif" }}>
              RECETA MEDICO-VETERINARIA
            </h2>
            <div style={{ fontSize: 12, color: 'var(--soft)', textAlign: 'right', marginBottom: 16 }}>Fecha: {today}</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>PACIENTE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 13, color: 'var(--text)' }}>
                {patient.name && <span><strong>Nombre:</strong> {patient.name}</span>}
                <span><strong>Especie:</strong> {displaySpecies(patient)}</span>
                {patient.breed && <span><strong>Raza:</strong> {patient.breed}</span>}
                {patient.weight && <span><strong>Peso:</strong> {patient.weight} kg</span>}
                {patient.ageValue && <span><strong>Edad:</strong> {patient.ageValue} {patient.ageUnit}</span>}
                {patient.owner && <span><strong>Propietario:</strong> {patient.owner}</span>}
                {patient.ownerPhone && <span><strong>Tel.:</strong> {patient.ownerPhone}</span>}
              </div>
            </div>

            {diagnosis.trim() && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>DIAGNOSTICO</div>
                <p style={{ fontSize: 13, color: 'var(--text)' }}>{diagnosis}</p>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--blue)', marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid var(--gl)' }}>&#8478; PRESCRIPCION</div>
              {validDrugsForPreview.map((drug, idx) => (
                <div key={`${drug.name}-${idx}`} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{idx + 1}. {matchDrugRules(drug.name)?.key || drug.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', paddingLeft: 12, marginTop: 2 }}>
                    Cantidad: {drug.quantity}
                    {drug.dose && ` | Dosis: ${displayDose(drug)}`}
                    {drug.route && ` | Via: ${drug.route}`}
                    {drug.freq && ` | ${displayFrequency(drug)}`}
                    {drug.duration && ` | Duracion: ${displayDuration(drug)}`}
                  </div>
                  {drug.notes.trim() && (
                    <div style={{ fontSize: 11, color: 'var(--soft)', paddingLeft: 12, fontStyle: 'italic' }}>* {drug.notes}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid var(--dark)', width: 200, margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{vetName}</div>
              <div style={{ fontSize: 12, color: 'var(--soft)' }}>Medico Veterinario - Reg. Prof.: {vetReg}</div>
            </div>

            <div style={{ marginTop: 20, fontSize: 10, color: 'var(--soft)', textAlign: 'center', borderTop: '1px solid var(--gl)', paddingTop: 10 }}>
              Receta valida por 30 dias - Facultad de Veterinaria UDI - {today}
            </div>
          </div>

          <button
            type="button"
            className="btnp"
            onClick={() => printElement(previewRef.current)}
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            Reimprimir PDF
          </button>
        </div>
      )}
    </div>
  )
}
