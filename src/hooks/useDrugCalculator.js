import { useState, useMemo, useEffect } from 'react'
import { DRUGS_DATABASE } from '../data/drugsDatabase'

const ALL_SPECIES = ['Perro', 'Gato', 'Bovino', 'Equino', 'Ovino', 'Porcino', 'Ave']
const ALL_ROUTES  = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario']
const UNITS       = ['mg/mL', 'UI/mL', '%', 'g/100mL']

export { ALL_SPECIES, ALL_ROUTES, UNITS }

/**
 * Convierte la concentración ingresada a mg/mL (o UI/mL) reales.
 *   1% = 10 mg/mL  |  1 g/100mL = 10 mg/mL  |  mg/mL y UI/mL: sin conversión
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
  // Perfil clínico obtenido de la IA cuando el fármaco no está en DRUGS_DATABASE
  const [aiDrugProfile, setAiDrugProfileState] = useState(null)

  // ─── Búsqueda en DB (string estable como dep de memos) ──────────────────
  const matchedDrugName = useMemo(() => {
    const key = drugInput.trim()
    if (!key) return null
    return Object.keys(DRUGS_DATABASE).find(k => k.toLowerCase() === key.toLowerCase()) ?? null
  }, [drugInput])

  // ─── Fármaco efectivo: DB tiene prioridad sobre perfil IA ───────────────
  // effectiveDrug es un nuevo objeto cada render — se usa para render, NO como dep de memos.
  // Para memos se usan matchedDrugName (string) y aiDrugProfile (React state), ambos estables.
  const effectiveDrug = matchedDrugName
    ? { name: matchedDrugName, ...DRUGS_DATABASE[matchedDrugName] }
    : aiDrugProfile  // null si no hay perfil IA

  // drugNotFound: escribió ≥3 chars, no hay match en DB, y no hay perfil IA cargado
  const drugNotFound = drugInput.trim().length >= 3 && !matchedDrugName && !aiDrugProfile

  // ─── Auto-ajuste al cambiar fármaco en DB ────────────────────────────────
  useEffect(() => {
    if (!matchedDrugName) return
    const db = DRUGS_DATABASE[matchedDrugName]
    setResult(null)
    if (!db.species.includes(species))     setSpeciesState(db.species[0])
    if (!db.allowedRoutes.includes(route)) setRouteState(db.allowedRoutes[0])
    setUnit(db.doseUnit === 'UI/kg' ? 'UI/mL' : 'mg/mL')
  }, [matchedDrugName]) // eslint-disable-line react-hooks/exhaustive-deps

  const availableSpecies = effectiveDrug ? effectiveDrug.species : ALL_SPECIES
  const availableRoutes  = effectiveDrug ? effectiveDrug.allowedRoutes : ALL_ROUTES

  // ─── Validaciones ────────────────────────────────────────────────────────
  // Deps: matchedDrugName (string estable) + aiDrugProfile (React state, estable entre renders).
  // effectiveDrug se accede dentro de cada memo; como sus deps son los dos anteriores,
  // el memo se recalcula exactamente cuando effectiveDrug cambiaría conceptualmente.

  const doseWarning = useMemo(() => {
    if (!effectiveDrug || !dose || !species) return null
    const range = effectiveDrug.dosageRange?.[species]
    if (!range) return null
    const d = parseFloat(dose)
    if (isNaN(d) || d <= 0) return null
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
    if (!String(weight).trim()) return null
    const w = parseFloat(weight)
    if (isNaN(w) || w <= 0) return 'El peso debe ser un número positivo.'
    if (w > 5000)            return 'Peso fuera de rango clínico (máx. 5000 kg).'
    return null
  }, [weight])

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
    !weightError &&
    !concError &&
    weight && parseFloat(weight) > 0 &&
    dose   && parseFloat(dose)   > 0 &&
    conc   && toEffectiveConc(conc, unit) !== null
  )

  // ─── Setters públicos ────────────────────────────────────────────────────

  function setDrugInput(value) {
    setDrugInputState(value)
    setAiDrugProfileState(null) // resetear perfil IA al cambiar el fármaco
    if (!value.trim()) setResult(null)
  }

  /**
   * Carga un perfil IA y ajusta la UI automáticamente,
   * igual que hace matchedDrugName con los fármacos de DB.
   * El profile debe tener la misma estructura que una entrada de DRUGS_DATABASE.
   */
  function setAiDrugProfile(profile) {
    setAiDrugProfileState(profile)
    setResult(null)
    if (!profile) return
    if (!profile.species.includes(species))      setSpeciesState(profile.species[0])
    if (!profile.allowedRoutes.includes(route))  setRouteState(profile.allowedRoutes[0])
    setUnit(profile.doseUnit === 'UI/kg' ? 'UI/mL' : 'mg/mL')
  }

  function setSpecies(value) { setSpeciesState(value); setResult(null) }
  function setRoute(value)   { setRouteState(value);   setResult(null) }

  function handleWeight(value) { setWeight(value); setResult(null) }
  function handleDose(value)   { setDose(value);   setResult(null) }
  function handleConc(value)   { setConc(value);   setResult(null) }

  function pickConcentration(value) {
    setConc(String(value))
    setUnit(effectiveDrug?.doseUnit === 'UI/kg' ? 'UI/mL' : 'mg/mL')
    setResult(null)
  }

  // ─── Cálculo ─────────────────────────────────────────────────────────────

  function calculate() {
    if (!canCalculate || !effectiveDrug) return null

    const w        = parseFloat(weight)
    const d        = parseFloat(dose)
    const effConc  = toEffectiveConc(conc, unit)
    const concNote = effectiveConcLabel(conc, unit)

    const totalMass = w * d
    const volMl     = totalMass / effConc

    // Sanity: resultado debe ser finito y positivo
    if (!isFinite(totalMass) || !isFinite(volMl) || volMl < 0) return null

    // Bug 2 fix: precisión adaptativa para microdosis
    const fmtVol = volMl < 0.1 ? volMl.toFixed(4) : volMl.toFixed(2)

    // Bug 3 fix: advertencias de volumen clínicamente absurdo
    let volumeWarning = null
    if (volMl > 100) {
      volumeWarning = `Volumen muy alto (${volMl.toFixed(1)} mL). Verifica que la concentración sea correcta.`
    } else if (volMl < 0.01) {
      volumeWarning = `Volumen muy pequeño (${fmtVol} mL). Considera usar una jeringa de insulina o microdilución.`
    }

    const entry = {
      drug:          effectiveDrug.name,
      species,
      weight:        w,
      dosePerKg:     d,
      doseUnit:      effectiveDrug.doseUnit,
      concentration: parseFloat(conc),
      effectiveConc: effConc,
      concNote,
      unit,
      route,
      totalMg:       totalMass.toFixed(2),
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
    // matchedDrug ahora es effectiveDrug — transparente para el componente
    matchedDrug:   effectiveDrug,
    // Perfil IA separado — para que el componente distinga el origen
    aiDrugProfile,
    setAiDrugProfile,
    drugNotFound,
    availableSpecies,
    availableRoutes,
    currentRange,
    doseWarning,
    routeError,
    speciesError,
    weightError,
    concError,
    canCalculate,
    calculate,
    pickConcentration,
  }
}
