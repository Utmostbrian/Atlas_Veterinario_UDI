import { useState, useMemo, useEffect } from 'react'
import { DRUGS_DATABASE } from '../data/drugsDatabase'

const ALL_SPECIES = ['Perro', 'Gato', 'Bovino', 'Equino', 'Ovino', 'Porcino', 'Ave']
const ALL_ROUTES  = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario']
const UNITS       = ['mg/mL', 'UI/mL', '%', 'g/100mL']

export { ALL_SPECIES, ALL_ROUTES, UNITS }

/**
 * Convierte la concentración ingresada a mg/mL (o UI/mL) reales.
 * Reglas: 1% = 10 mg/mL · 1 g/100mL = 10 mg/mL · mg/mL y UI/mL: sin conversión.
 * @param {string} value Valor numérico como string (puede ser decimal)
 * @param {'mg/mL'|'UI/mL'|'%'|'g/100mL'} unit Unidad seleccionada por el usuario
 * @returns {number|null} Concentración efectiva en mg/mL, o null si el input es inválido
 */
export function toEffectiveConc(value, unit) {
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) return null
  if (unit === '%' || unit === 'g/100mL') return n * 10
  return n
}

function effectiveConcLabel(value, unit) {
  if (unit === '%')        return `${parseFloat(value) * 10} mg/mL (de ${value}%)`
  if (unit === 'g/100mL') return `${parseFloat(value) * 10} mg/mL (de ${value} g/100mL)`
  return null
}

// M-01: adaptive precision — prevents 0.0025 displaying as "0.00"
export function fmtNum(n) {
  if (!isFinite(n) || n === 0) return '0.00'
  if (n < 0.01) return n.toFixed(4)
  if (n < 0.1)  return n.toFixed(4)
  return n.toFixed(2)
}

export function useDrugCalculator() {
  const [drugInput,     setDrugInputState]    = useState('')
  const [species,       setSpeciesState]      = useState('Perro')
  const [weight,        setWeight]            = useState('')
  const [dose,          setDose]              = useState('')
  const [conc,          setConc]              = useState('')
  const [unit,          setUnit]              = useState('mg/mL')
  const [route,         setRouteState]        = useState('VO (oral)')
  const [result,        setResult]            = useState(null)
  const [history,       setHistory]           = useState([])
  const [aiDrugProfile, setAiDrugProfileState] = useState(null)

  const matchedDrugName = useMemo(() => {
    const key = drugInput.trim()
    if (!key) return null
    return Object.keys(DRUGS_DATABASE).find(k => k.toLowerCase() === key.toLowerCase()) ?? null
  }, [drugInput])

  const effectiveDrug = matchedDrugName
    ? { name: matchedDrugName, ...DRUGS_DATABASE[matchedDrugName] }
    : aiDrugProfile

  const drugNotFound = drugInput.trim().length >= 3 && !matchedDrugName && !aiDrugProfile

  // C-02: total-dose mode — drug defines a fixed dose, not per-kg
  const isTotalDose = effectiveDrug?.doseMode === 'total'

  useEffect(() => {
    if (!matchedDrugName) return
    const db = DRUGS_DATABASE[matchedDrugName]
    setResult(null)
    if (!db.species.includes(species))     setSpeciesState(db.species[0])
    if (!db.allowedRoutes.includes(route)) setRouteState(db.allowedRoutes[0])
    // Handle UI unit for both UI/kg and total UI drugs
    setUnit(db.doseUnit === 'UI/kg' || db.doseUnit === 'UI' ? 'UI/mL' : 'mg/mL')
  }, [matchedDrugName]) // eslint-disable-line react-hooks/exhaustive-deps

  const availableSpecies = effectiveDrug ? effectiveDrug.species : ALL_SPECIES
  const availableRoutes  = effectiveDrug ? effectiveDrug.allowedRoutes : ALL_ROUTES

  // C-01: hardMaxError blocks calculation entirely (e.g. Enrofloxacina >5 mg/kg en gato = ceguera)
  // Separate from doseWarning which is advisory only.
  const hardMaxError = useMemo(() => {
    if (!effectiveDrug || !dose || !species) return null
    const range = effectiveDrug.dosageRange?.[species]
    if (!range?.hardMax) return null
    const d = parseFloat(dose)
    if (isNaN(d) || d <= 0) return null
    if (d > range.max)
      return `LÍMITE ABSOLUTO — ${effectiveDrug.name} en ${species}: máximo ${range.max} ${effectiveDrug.doseUnit}. Superar este límite causa daño irreversible. Cálculo bloqueado.`
    return null
  }, [matchedDrugName, aiDrugProfile, dose, species]) // eslint-disable-line react-hooks/exhaustive-deps

  const doseWarning = useMemo(() => {
    if (!effectiveDrug || !dose || !species) return null
    const range = effectiveDrug.dosageRange?.[species]
    if (!range) return null
    const d = parseFloat(dose)
    if (isNaN(d) || d <= 0) return null
    // hardMax violations shown via hardMaxError, not here
    if (range.hardMax && d > range.max) return null
    if (d < range.min)
      return `Dosis inferior al rango clínico (mín: ${range.min} ${effectiveDrug.doseUnit})`
    if (d > range.max)
      return `Dosis superior al rango clínico (máx: ${range.max} ${effectiveDrug.doseUnit})`
    return null
  }, [matchedDrugName, aiDrugProfile, dose, species]) // eslint-disable-line react-hooks/exhaustive-deps

  const routeError = useMemo(() => {
    if (!effectiveDrug || !route) return null
    return effectiveDrug.allowedRoutes.includes(route)
      ? null
      : `La vía "${route}" no está indicada para ${effectiveDrug.name}`
  }, [matchedDrugName, aiDrugProfile, route]) // eslint-disable-line react-hooks/exhaustive-deps

  const speciesError = useMemo(() => {
    if (!effectiveDrug || !species) return null
    return effectiveDrug.species.includes(species)
      ? null
      : `${effectiveDrug.name} no está indicado en ${species}`
  }, [matchedDrugName, aiDrugProfile, species]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentRange = useMemo(() => {
    if (!effectiveDrug || !species) return null
    return effectiveDrug.dosageRange?.[species] ?? null
  }, [matchedDrugName, aiDrugProfile, species]) // eslint-disable-line react-hooks/exhaustive-deps

  const weightError = useMemo(() => {
    // C-02: weight not required for total-dose drugs (Oxitocina, etc.)
    if (isTotalDose) return null
    if (!String(weight).trim()) return null
    const w = parseFloat(weight)
    if (isNaN(w) || w <= 0) return 'El peso debe ser un número positivo.'
    if (w > 5000)            return 'Peso fuera de rango clínico (máx. 5000 kg).'
    return null
  }, [weight, isTotalDose])

  const concError = useMemo(() => {
    if (!String(conc).trim()) return null
    const c = toEffectiveConc(conc, unit)
    if (c === null) return 'La concentración debe ser un número positivo.'
    if (c > 2000)   return 'Concentración muy alta. Verifica las unidades seleccionadas.'
    return null
  }, [conc, unit])

  const canCalculate = Boolean(
    effectiveDrug &&
    !routeError &&
    !speciesError &&
    !hardMaxError &&  // C-01: block when hardMax exceeded
    !weightError &&
    !concError &&
    // C-02: weight required only for per-kg drugs
    (isTotalDose || (weight && parseFloat(weight) > 0)) &&
    dose && parseFloat(dose) > 0 &&
    conc && toEffectiveConc(conc, unit) !== null
  )

  function setDrugInput(value) {
    setDrugInputState(value)
    setAiDrugProfileState(null)
    if (!value.trim()) setResult(null)
  }

  function setAiDrugProfile(profile) {
    setAiDrugProfileState(profile)
    setResult(null)
    if (!profile) return
    if (!profile.species.includes(species))      setSpeciesState(profile.species[0])
    if (!profile.allowedRoutes.includes(route))  setRouteState(profile.allowedRoutes[0])
    setUnit(profile.doseUnit === 'UI/kg' || profile.doseUnit === 'UI' ? 'UI/mL' : 'mg/mL')
  }

  function setSpecies(value) { setSpeciesState(value); setResult(null) }
  function setRoute(value)   { setRouteState(value);   setResult(null) }
  function handleWeight(value) { setWeight(value); setResult(null) }
  function handleDose(value)   { setDose(value);   setResult(null) }
  function handleConc(value)   { setConc(value);   setResult(null) }

  function pickConcentration(value) {
    setConc(String(value))
    const isUI = effectiveDrug?.doseUnit === 'UI/kg' || effectiveDrug?.doseUnit === 'UI'
    setUnit(isUI ? 'UI/mL' : 'mg/mL')
    setResult(null)
  }

  function calculate() {
    if (!canCalculate || !effectiveDrug) return null

    const w       = parseFloat(weight) || 0
    const d       = parseFloat(dose)
    const effConc = toEffectiveConc(conc, unit)
    const concNote = effectiveConcLabel(conc, unit)

    // C-02: total-dose drugs use dose directly, no per-kg multiplication
    const totalMass = isTotalDose ? d : w * d
    const volMl     = totalMass / effConc

    if (!isFinite(totalMass) || !isFinite(volMl) || volMl < 0) return null

    // M-01: adaptive precision for small values (microdoses)
    const fmtVol  = fmtNum(volMl)
    const fmtMass = fmtNum(totalMass)

    let volumeWarning = null
    if (volMl > 100) {
      volumeWarning = `Volumen muy alto (${volMl.toFixed(1)} mL). Verifica que la concentración sea correcta.`
    } else if (volMl < 0.01) {
      volumeWarning = `Volumen muy pequeño (${fmtVol} mL). Considera usar una jeringa de insulina o microdilución.`
    }

    const entry = {
      drug:          effectiveDrug.name,
      species,
      weight:        isTotalDose ? null : w,
      dosePerKg:     isTotalDose ? null : d,
      doseTotal:     isTotalDose ? d : null,
      doseMode:      effectiveDrug.doseMode ?? 'per_kg',
      doseUnit:      effectiveDrug.doseUnit,
      concentration: parseFloat(conc),
      effectiveConc: effConc,
      concNote,
      unit,
      route,
      totalMg:       fmtMass,
      volMl:         fmtVol,
      hadWarning:    !!doseWarning,
      volumeWarning,
      timestamp:     new Date().toLocaleString('es-BO'),
      aiCalculated:  !matchedDrugName && !!aiDrugProfile,
    }

    setResult(entry)
    setHistory(prev => [entry, ...prev].slice(0, 10))
    return entry
  }

  return {
    drugInput,  setDrugInput,
    species,    setSpecies,
    weight,     setWeight:    handleWeight,
    dose,       setDose:      handleDose,
    conc,       setConc:      handleConc,
    unit,       setUnit,
    route,      setRoute,
    result,     setResult,
    history,
    matchedDrug:   effectiveDrug,
    aiDrugProfile,
    setAiDrugProfile,
    drugNotFound,
    availableSpecies,
    availableRoutes,
    currentRange,
    doseWarning,
    hardMaxError,
    routeError,
    speciesError,
    weightError,
    concError,
    canCalculate,
    calculate,
    pickConcentration,
    isTotalDose,
  }
}
