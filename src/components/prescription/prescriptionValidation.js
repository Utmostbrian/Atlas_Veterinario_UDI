import { z } from 'zod'
import { DRUGS_DATABASE } from '../../data/drugsDatabase'

const DECIMAL_RE = /^\d+(?:[.,]\d+)?$/
const PHONE_RE = /^\d{6,15}$/
const HAS_LETTER = /[a-zA-ZÀ-ÿ]/
const ALPHA_NAME = /^[a-zA-ZÀ-ÿ\s\-'.]+$/

export const AGE_UNITS = ['dias', 'meses', 'anos']

export const SPECIES_OPTIONS = [
  { value: 'Canino', label: 'Canino', clinicalSpecies: 'Perro', minKg: 0.1, maxKg: 100 },
  { value: 'Felino', label: 'Felino', clinicalSpecies: 'Gato', minKg: 0.1, maxKg: 20 },
  { value: 'Equino', label: 'Equino', clinicalSpecies: 'Equino', minKg: 0.1, maxKg: 1000 },
  { value: 'Bovino', label: 'Bovino', clinicalSpecies: 'Bovino', minKg: 0.1, maxKg: 1000 },
  { value: 'Ave', label: 'Ave', clinicalSpecies: 'Ave', minKg: 0.1, maxKg: 50 },
  { value: 'Reptil/Anfibio', label: 'Reptil/Anfibio', clinicalSpecies: 'Reptil/Anfibio', minKg: 0.1, maxKg: 300 },
  { value: 'Otros', label: 'Otros', clinicalSpecies: 'Otros', minKg: 0.1, maxKg: 1000 },
]

export const SPECIES_VALUES = SPECIES_OPTIONS.map((item) => item.value)
export const ATLAS_DRUG_NAMES = Object.keys(DRUGS_DATABASE).sort((a, b) => a.localeCompare(b))

export function inputNumber(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function getSpeciesOption(value) {
  return SPECIES_OPTIONS.find((item) => item.value === value) || null
}

export function findDrugMatch(drugInput) {
  if (!drugInput) return null
  const q = drugInput.trim().toLowerCase()
  if (!q) return null

  const exact = ATLAS_DRUG_NAMES.find((name) => name.toLowerCase() === q)
  if (exact) return { key: exact, rules: DRUGS_DATABASE[exact] }

  const partial = ATLAS_DRUG_NAMES.find((name) => {
    const normalized = name.toLowerCase()
    return q.startsWith(normalized) || q.includes(normalized)
  })
  if (partial) return { key: partial, rules: DRUGS_DATABASE[partial] }

  return null
}

function optionalAlpha(label, max) {
  return z.string().trim().max(max, `${label} demasiado largo.`).refine((value) => {
    return !value || ALPHA_NAME.test(value)
  }, `${label} solo puede contener letras, espacios, puntos o guiones.`)
}

function requiredDecimal(label, min, max, unit = '') {
  const suffix = unit ? ` ${unit}` : ''
  return z.string().trim()
    .min(1, `${label} es obligatorio.`)
    .regex(DECIMAL_RE, `${label} solo acepta numeros positivos.`)
    .refine((value) => inputNumber(value) >= min, `${label} debe ser al menos ${min}${suffix}.`)
    .refine((value) => inputNumber(value) <= max, `${label} no puede superar ${max}${suffix}.`)
}

function optionalDecimal(label, min, max) {
  return z.string().trim().refine((value) => {
    if (!value) return true
    return DECIMAL_RE.test(value) && inputNumber(value) >= min && inputNumber(value) <= max
  }, `${label} debe ser un numero entre ${min} y ${max}.`)
}

const drugSchema = z.object({
  name: z.string().trim()
    .min(1, 'Selecciona un farmaco del Atlas.')
    .refine((value) => Boolean(findDrugMatch(value)), 'El farmaco debe existir en el Atlas Farmacologico.'),
  quantity: requiredDecimal('Cantidad', 0.001, 10000),
  dose: requiredDecimal('Dosis', 0.0001, 100000),
  route: z.string().trim().min(1, 'Selecciona la via de administracion.'),
  freq: requiredDecimal('Frecuencia', 1, 168, 'h'),
  duration: requiredDecimal('Duracion', 1, 365, 'dias'),
  notes: z.string().trim().max(300, 'Las instrucciones no pueden superar 300 caracteres.').optional(),
})

export const prescriptionSchema = z.object({
  patient: z.object({
    name: optionalAlpha('El nombre del animal', 80),
    species: z.enum(SPECIES_VALUES, { error: 'Selecciona una especie controlada.' }),
    speciesOther: z.string().trim().max(60, 'Detalle de especie demasiado largo.').optional(),
    breed: optionalAlpha('La raza', 60),
    weight: requiredDecimal('Peso', 0.1, 1000, 'kg'),
    ageValue: optionalDecimal('Edad', 0.1, 3650),
    ageUnit: z.enum(AGE_UNITS, { error: 'Selecciona una unidad de edad valida.' }),
    owner: z.string().trim().max(80, 'Nombre de propietario demasiado largo.').refine((value) => {
      return !value || HAS_LETTER.test(value)
    }, 'El propietario debe contener letras.'),
    ownerPhone: z.string().trim().refine((value) => {
      return !value || PHONE_RE.test(value)
    }, 'Telefono solo acepta numeros, entre 6 y 15 digitos.'),
  }).superRefine((patient, ctx) => {
    const option = getSpeciesOption(patient.species)
    const weight = inputNumber(patient.weight)

    if (patient.species === 'Otros' && !HAS_LETTER.test(patient.speciesOther || '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['speciesOther'],
        message: 'Describe la especie cuando seleccionas Otros.',
      })
    }

    if (option && weight != null && (weight < option.minKg || weight > option.maxKg)) {
      ctx.addIssue({
        code: 'custom',
        path: ['weight'],
        message: `Peso fuera de rango para ${option.label} (${option.minKg}-${option.maxKg} kg).`,
      })
    }
  }),
  drugs: z.array(drugSchema).min(1, 'Agrega al menos un medicamento.'),
  diagnosis: z.string().trim().max(500, 'El diagnostico no puede superar 500 caracteres.').refine((value) => {
    return !value || (HAS_LETTER.test(value) && value.length >= 5)
  }, 'El diagnostico debe tener texto descriptivo de al menos 5 caracteres.'),
  vetName: z.string().trim()
    .min(4, 'El nombre del veterinario es obligatorio.')
    .max(100, 'Nombre del veterinario demasiado largo.')
    .regex(ALPHA_NAME, 'Solo letras, espacios, puntos o guiones.'),
  vetReg: z.string().trim()
    .min(3, 'La matricula es obligatoria.')
    .max(40, 'Matricula demasiado larga.')
    .regex(/\d/, 'La matricula debe contener al menos un numero.'),
})

export function mapPrescriptionErrors(zodError) {
  const errors = {}

  for (const issue of zodError.issues) {
    const [scope, second, third] = issue.path

    if (scope === 'patient') {
      const key = second === 'ageValue' ? 'age' : second
      errors[key] = issue.message
      continue
    }

    if (scope === 'drugs') {
      if (typeof second === 'number' && third) {
        errors[`drug_${second}_${third}`] = issue.message
      } else {
        errors.drugs_global = issue.message
      }
      continue
    }

    if (typeof scope === 'string') {
      errors[scope] = issue.message
    }
  }

  return errors
}
