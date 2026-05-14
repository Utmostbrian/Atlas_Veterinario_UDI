/**
 * Base de datos clínica interna para validación de la calculadora de dosis.
 *
 * Fuentes: Plumb's Veterinary Drug Handbook (10th ed.), Botana LM et al.
 * "Farmacología y Terapéutica Veterinaria", FDA veterinary drug labels.
 *
 * doseUnit             : unidad del rango de dosis ('mg/kg' | 'UI/kg')
 * standardConcentrations: concentraciones comerciales reales en mg/mL o UI/mL
 * note                 : advertencia clínica mostrada en UI
 */
export const DRUGS_DATABASE = {

  // ── ANTIBIÓTICOS ──────────────────────────────────────────────────────────

  'Amoxicilina': {
    species: ['Perro', 'Gato', 'Bovino'],
    dosageRange: {
      Perro:  { min: 11, max: 22 },
      Gato:   { min: 11, max: 22 },
      Bovino: { min: 7,  max: 10 },
    },
    allowedRoutes: ['VO (oral)', 'IM (intramuscular)', 'SC (subcutánea)'],
    // 50 mg/mL = suspensión oral; 150 mg/mL = Vetrimoxin LA inyectable
    standardConcentrations: [50, 150],
    doseUnit: 'mg/kg',
  },

  'Enrofloxacina': {
    species: ['Perro', 'Gato', 'Bovino'],
    dosageRange: {
      Perro:  { min: 5,   max: 20 },
      // CRÍTICO: FDA/AAFP limitan a 5 mg/kg/día en gatos por riesgo de ceguera irreversible
      Gato:   { min: 2.5, max: 5  },
      Bovino: { min: 2.5, max: 5  },
    },
    allowedRoutes: ['VO (oral)', 'IM (intramuscular)', 'SC (subcutánea)'],
    // Baytril 2.5% = 25 mg/mL, 5% = 50 mg/mL, 10% = 100 mg/mL
    standardConcentrations: [25, 50, 100],
    doseUnit: 'mg/kg',
    note: 'GATOS: máximo 5 mg/kg/día. Dosis superiores causan degeneración retinal irreversible (ceguera). Monitorear si se usan ≥5 mg/kg.',
  },

  'Oxitetraciclina': {
    species: ['Bovino', 'Equino', 'Porcino'],
    dosageRange: {
      Bovino:  { min: 6.6, max: 11 },
      Equino:  { min: 6.6, max: 11 },
      Porcino: { min: 6.6, max: 11 },
    },
    allowedRoutes: ['IM (intramuscular)', 'IV (intravenosa)', 'VO (oral)'],
    // OTC injectable 50 mg/mL; LA-200 = 200 mg/mL
    standardConcentrations: [50, 100, 200],
    doseUnit: 'mg/kg',
    note: 'IV: administrar diluida y muy lenta (≥15 min). Nefrotóxica en dosis altas.',
  },

  'Penicilina G Procaínica': {
    species: ['Bovino', 'Equino', 'Ovino'],
    dosageRange: {
      Bovino: { min: 20000, max: 22000 },
      Equino: { min: 20000, max: 22000 },
      Ovino:  { min: 20000, max: 22000 },
    },
    allowedRoutes: ['IM (intramuscular)'],
    // Presentaciones: 300,000 UI/mL y 400,000 UI/mL
    standardConcentrations: [300000, 400000],
    doseUnit: 'UI/kg',
    note: 'SOLO VÍA IM PROFUNDA. La administración IV puede causar muerte súbita. Ingresar dosis en UI/kg y concentración en UI/mL.',
  },

  // ── ANTIPARASITARIOS ──────────────────────────────────────────────────────

  'Ivermectina': {
    species: ['Bovino', 'Equino', 'Ovino', 'Perro'],
    dosageRange: {
      Bovino: { min: 0.2,   max: 0.2   },
      Equino: { min: 0.2,   max: 0.2   },
      Ovino:  { min: 0.2,   max: 0.2   },
      // 0.006 mg/kg = profilaxis heartworm mensual; hasta 0.05 mg/kg para sarna
      Perro:  { min: 0.006, max: 0.05  },
    },
    allowedRoutes: ['SC (subcutánea)', 'VO (oral)'],
    // 1 mg/mL = solución oral diluida (pequeños animales); 10 mg/mL = inyectable bovino/equino (Ivomec 1%)
    standardConcentrations: [1, 10],
    doseUnit: 'mg/kg',
    note: 'TÓXICO en razas MDR1/ABCB1+ (Collie, Pastor Australiano). Para profilaxis cardiaca en Perro: 0.006 mg/kg/mes. Diluir la presentación de 10 mg/mL para dosis pequeñas en animales de compañía.',
  },

  'Albendazol': {
    species: ['Bovino', 'Ovino', 'Porcino'],
    dosageRange: {
      Bovino:  { min: 7.5, max: 10  },
      Ovino:   { min: 5,   max: 7.5 },
      Porcino: { min: 5,   max: 10  },
    },
    allowedRoutes: ['VO (oral)'],
    // Suspensión oral 2.5% = 25 mg/mL, 5% = 50 mg/mL, 10% = 100 mg/mL
    standardConcentrations: [25, 50, 100],
    doseUnit: 'mg/kg',
    note: 'TERATOGÉNICO. Contraindicado en el primer tercio de gestación (días 1–45 en bovinos).',
  },

  'Closantel': {
    species: ['Bovino', 'Ovino'],
    dosageRange: {
      Bovino: { min: 10, max: 10 },
      Ovino:  { min: 10, max: 10 },
    },
    allowedRoutes: ['SC (subcutánea)', 'VO (oral)'],
    // Flukiver injectable 10% = 100 mg/mL
    standardConcentrations: [100],
    doseUnit: 'mg/kg',
    note: 'Margen terapéutico estrecho. No superar la dosis única recomendada. Alta fijación proteica plasmática.',
  },

  // ── ANTIINFLAMATORIOS ─────────────────────────────────────────────────────

  'Meloxicam': {
    species: ['Perro', 'Gato', 'Bovino', 'Equino'],
    dosageRange: {
      Perro:  { min: 0.1, max: 0.2 },
      Gato:   { min: 0.05, max: 0.1 },
      Bovino: { min: 0.5, max: 0.5 },
      Equino: { min: 0.6, max: 0.6 },
    },
    allowedRoutes: ['VO (oral)', 'SC (subcutánea)', 'IV (intravenosa)'],
    // 0.5 mg/mL = Metacam oral gatos; 1.5 mg/mL = Metacam oral perros;
    // 5 mg/mL = Metacam inyectable; 20 mg/mL = Inflacam grandes animales
    standardConcentrations: [0.5, 1.5, 5, 20],
    doseUnit: 'mg/kg',
    note: 'Perro: dosis de carga 0.2 mg/kg, luego 0.1 mg/kg/día. Gato: máximo 0.1 mg/kg/día con extrema precaución. Evitar en insuficiencia renal o hepática.',
  },

  'Flunixin Meglumina': {
    species: ['Bovino', 'Equino', 'Porcino'],
    dosageRange: {
      Bovino:  { min: 1.1, max: 2.2 },
      Equino:  { min: 1.1, max: 1.1 },
      Porcino: { min: 2.2, max: 2.2 },
    },
    allowedRoutes: ['IV (intravenosa)', 'IM (intramuscular)'],
    // Banamine 5% = 50 mg/mL
    standardConcentrations: [50],
    doseUnit: 'mg/kg',
    note: 'NUNCA administrar SC: causa necrosis tisular grave. IV lenta en equinos. Ulcerógeno GI con uso prolongado.',
  },

  'Ketoprofeno': {
    species: ['Bovino', 'Equino', 'Perro'],
    dosageRange: {
      Bovino: { min: 3,   max: 3   },
      Equino: { min: 2.2, max: 2.2 },
      Perro:  { min: 1,   max: 2   },
    },
    allowedRoutes: ['IM (intramuscular)', 'IV (intravenosa)', 'VO (oral)'],
    // Ketofen 1% = 10 mg/mL (única concentración veterinaria estándar)
    standardConcentrations: [10],
    doseUnit: 'mg/kg',
    note: 'Uso máximo 5 días consecutivos. No combinar con otros AINEs ni corticoides.',
  },

  // ── ANESTÉSICOS ───────────────────────────────────────────────────────────

  'Ketamina': {
    species: ['Perro', 'Gato', 'Bovino', 'Equino'],
    dosageRange: {
      Perro:  { min: 5,  max: 10  },
      Gato:   { min: 11, max: 33  },
      Bovino: { min: 2,  max: 4   },
      Equino: { min: 2,  max: 2.2 },
    },
    allowedRoutes: ['IV (intravenosa)', 'IM (intramuscular)'],
    // 50 mg/mL (Ketaset), 100 mg/mL (más común en veterinaria), 200 mg/mL (Ketavet)
    standardConcentrations: [50, 100, 200],
    doseUnit: 'mg/kg',
    note: 'Aumenta presión intraocular e intracraneal. Requiere premedicación con benzodiacepina o xilazina para relajación muscular adecuada.',
  },

  'Xilazina': {
    species: ['Bovino', 'Equino', 'Perro', 'Gato'],
    dosageRange: {
      Bovino: { min: 0.05, max: 0.1  },
      Equino: { min: 0.5,  max: 1.1  },
      Perro:  { min: 0.5,  max: 2    },
      Gato:   { min: 1,    max: 2    },
    },
    allowedRoutes: ['IV (intravenosa)', 'IM (intramuscular)'],
    // Rompun 2% = 20 mg/mL (pequeños animales), Rompun 10% = 100 mg/mL (grandes animales)
    standardConcentrations: [20, 100],
    doseUnit: 'mg/kg',
    note: 'Bovinos: 10× más sensibles que equinos — usar 0.05–0.1 mg/kg IM. IV produce efectos en 1–2 min. Antagonista: Yohimbina o Atipamezol.',
  },

  'Propofol': {
    species: ['Perro', 'Gato'],
    dosageRange: {
      // Premedicado: 1–4 mg/kg; no premedicado: 4–6 mg/kg (ajustar al efecto)
      Perro: { min: 1, max: 6 },
      // Premedicado: 2–4 mg/kg; no premedicado: 4–6 mg/kg
      // NO usar >6 mg/kg; riesgo de apnea y síndrome de Heinz en uso repetido
      Gato:  { min: 2, max: 6 },
    },
    allowedRoutes: ['IV (intravenosa)'],
    // Propofol 1% = 10 mg/mL (única presentación estándar)
    standardConcentrations: [10],
    doseUnit: 'mg/kg',
    note: 'EXCLUSIVO IV. Titular lentamente hasta efecto. Apnea transitoria posible. En gatos: NO usar en infusión continua prolongada (síndrome de Heinz). No reutilizar viales abiertos.',
  },

  // ── ANTIFÚNGICOS ──────────────────────────────────────────────────────────

  'Itraconazol': {
    species: ['Perro', 'Gato', 'Ave'],
    dosageRange: {
      Perro: { min: 5,  max: 10 },
      Gato:  { min: 5,  max: 10 },
      Ave:   { min: 10, max: 20 },
    },
    allowedRoutes: ['VO (oral)'],
    // Solución oral 10 mg/mL (Sporanox oral solution)
    standardConcentrations: [10],
    doseUnit: 'mg/kg',
    note: 'Hepatotóxico con uso prolongado (>30 días). Monitorear ALT/AST mensualmente. Tomar con alimento para mejorar absorción.',
  },

  'Ketoconazol': {
    species: ['Perro', 'Gato'],
    dosageRange: {
      Perro: { min: 10, max: 15 },
      Gato:  { min: 5,  max: 10 },
    },
    allowedRoutes: ['VO (oral)'],
    // Suspensión magistral oral 20 mg/mL (compounded); comprimidos 200 mg
    standardConcentrations: [20],
    doseUnit: 'mg/kg',
    note: 'Potente inhibidor CYP3A4: múltiples interacciones farmacológicas. Hepatotóxico. No usar durante la gestación.',
  },

  // ── HORMONAS ──────────────────────────────────────────────────────────────

  'Oxitocina': {
    species: ['Bovino', 'Equino', 'Perro', 'Gato'],
    dosageRange: {
      // Bovino ~500 kg: 20–40 UI totales ÷ 500 kg ≈ 0.04–0.08 UI/kg
      Bovino: { min: 0.04, max: 0.08 },
      Equino: { min: 0.04, max: 0.08 },
      // Perro/Gato: 2–5 UI totales; para perro ~3 kg ≈ 0.5–1.5 UI/kg
      Perro:  { min: 0.5,  max: 1.5  },
      Gato:   { min: 0.5,  max: 1.5  },
    },
    allowedRoutes: ['IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)'],
    // Syntocinon 10 UI/mL y 20 UI/mL
    standardConcentrations: [10, 20],
    doseUnit: 'UI/kg',
    note: 'Dosis clínica habitual como dosis TOTAL (no por kg): Bovino 20–40 UI, Perro/Gato 2–5 UI. CONTRAINDICADO ante obstrucción o mala presentación fetal.',
  },

  'Progesterona': {
    species: ['Bovino', 'Equino', 'Ovino'],
    dosageRange: {
      // Bovino: 150 mg totales en vacas de ~500 kg ≈ 0.3 mg/kg
      Bovino: { min: 0.2, max: 0.5 },
      // Yegua: 150–300 mg totales en equino de ~500 kg ≈ 0.3–0.6 mg/kg
      Equino: { min: 0.3, max: 0.6 },
      Ovino:  { min: 0.2, max: 0.5 },
    },
    allowedRoutes: ['IM (intramuscular)', 'SC (subcutánea)'],
    // En aceite: 50 mg/mL, 100 mg/mL, 150 mg/mL
    standardConcentrations: [50, 100, 150],
    doseUnit: 'mg/kg',
    note: 'Para protocolos IATF con CIDR intravaginal: NO calcular por esta vía (dispositivo de dosis fija). Esta calculadora aplica solo a la forma inyectable en aceite.',
  },
}

/** Lista ordenada de todos los nombres de fármacos */
export const DRUG_NAMES = Object.keys(DRUGS_DATABASE).sort()
