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
      // Plumb's 10ª ed.: 7–10 mg/kg para infecciones; 10 mg/kg en infecciones severas
      Bovino: { min: 7,  max: 10 },
    },
    allowedRoutes: ['VO (oral)', 'IM (intramuscular)', 'SC (subcutánea)', 'Intramamario'],
    // 50 mg/mL = suspensión oral; 150 mg/mL = Vetrimoxin LA inyectable
    // Intramamario: tubos de 200 mg — dosis fija por cuarto mamario (no calcular por kg)
    standardConcentrations: [50, 150],
    doseUnit: 'mg/kg',
    note: 'Bovino vía Intramamario: se usan tubos de dosis fija (200 mg/cuarto mamario) — no calcular por kg. La calculadora aplica solo a las vías sistémicas (IM, SC, VO).',
  },

  'Enrofloxacina': {
    species: ['Perro', 'Gato', 'Bovino'],
    dosageRange: {
      Perro:  { min: 5,   max: 20  },
      // hardMax: true — superar este límite bloquea el cálculo (ceguera irreversible, FDA/AAFP)
      Gato:   { min: 2.5, max: 5, hardMax: true },
      Bovino: { min: 2.5, max: 5  },
    },
    allowedRoutes: ['VO (oral)', 'IM (intramuscular)', 'SC (subcutánea)'],
    // Baytril 2.5% = 25 mg/mL, 5% = 50 mg/mL, 10% = 100 mg/mL
    standardConcentrations: [25, 50, 100],
    doseUnit: 'mg/kg',
    note: 'GATOS — LÍMITE ABSOLUTO: máximo 5 mg/kg/día. Cualquier dosis superior causa degeneración retinal irreversible y CEGUERA PERMANENTE (FDA label, AAFP guidelines). La calculadora bloquea el cálculo si se supera este límite.',
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
      // Plumb's Veterinary Drug Handbook 10ª ed.: dosis estándar 22 000 UI/kg
      Bovino: { min: 22000, max: 22000 },
      Equino: { min: 22000, max: 22000 },
      Ovino:  { min: 22000, max: 22000 },
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
    // Pour-on bovino: formulación al 5% (500 µg/kg = 0.5 mg/kg), dosis diferente a SC.
    // Se documenta en nota clínica; la calculadora usa la vía SC/VO para el cálculo de dosis.
    allowedRoutes: ['SC (subcutánea)', 'VO (oral)', 'Pour-on (bovino)'],
    // 1 mg/mL = solución oral (pequeños animales); 10 mg/mL = inyectable bovino/equino (Ivomec 1%)
    // Pour-on: 5 mg/mL (Ivomec Pour-on 0.5%)
    standardConcentrations: [1, 5, 10],
    doseUnit: 'mg/kg',
    note: 'TÓXICO en razas MDR1/ABCB1+ (Collie, Pastor Australiano, Shetland). Para profilaxis cardiaca en Perro: 0.006 mg/kg/mes. Vía SC/VO: 0.2 mg/kg en bovinos/equinos. POUR-ON (bovino): dosis 0.5 mg/kg con formulación al 5% (500 µg/kg) — dosis diferente a la inyectable. Diluir la presentación de 10 mg/mL para pequeños animales.',
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
    note: 'Bovinos: 10× más sensibles que equinos — usar 0.05–0.1 mg/kg IM. IV produce efectos en 1–2 min. ANTAGONISTAS: Bovinos/Equinos: Yohimbina 0.1–0.125 mg/kg IV lento (antagonista de elección para Xilazina). Pequeños animales: Yohimbina o Atipamezol (Atipamezol es selectivo para medetomidina/dexmedetomidina, no para Xilazina específicamente).',
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
      // Dosis clínica establecida como DOSIS TOTAL (no por kg) — Plumb's 10ª ed.
      Bovino: { min: 20, max: 40 },
      Equino: { min: 20, max: 40 },
      Perro:  { min: 2,  max: 5  },
      Gato:   { min: 2,  max: 5  },
    },
    allowedRoutes: ['IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)'],
    // Syntocinon 10 UI/mL y 20 UI/mL
    standardConcentrations: [10, 20],
    // doseMode 'total': la calculadora usa la dosis directamente sin multiplicar por peso
    doseMode: 'total',
    doseUnit: 'UI',
    note: 'ATENCIÓN — DOSIS TOTAL (no por kg): Bovino/Equino 20–40 UI totales; Perro/Gato 2–5 UI totales. La calculadora opera en modo "dosis total". CONTRAINDICADO ante obstrucción o mala presentación fetal. Riesgo de tetania uterina con sobredosis.',
  },

  // ── INHIBIDORES ADRENALES ─────────────────────────────────────────────────

  'Trilostano': {
    species: ['Perro'],
    dosageRange: {
      // Dosis inicial Plumb's 10ª ed.: 2–5 mg/kg VO c/24h; ajustar según test ACTH estimulación
      Perro: { min: 2, max: 5 },
    },
    allowedRoutes: ['VO (oral)'],
    // Vetoryl cápsulas: 10 mg, 30 mg, 60 mg, 120 mg
    standardConcentrations: [10, 30, 60, 120],
    doseUnit: 'mg/kg',
    note: 'TRATAMIENTO DE PRIMERA LÍNEA para Hiperadrenocorticismo canino (PDH/HAC) — Plumb\'s, FDA, EMA. Dosis inicial 2–5 mg/kg VO c/24h. Ajustar según test ACTH estimulación (cortisol post-ACTH objetivo: 27–150 nmol/L). No iniciar si creatinina elevada o hipoadrenocorticismo. Monitoreo de cortisol y electrolitos cada 3 meses. No usar en gestación.',
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

// En modo desarrollo: avisa si un fármaco de la calculadora no existe en el Atlas visual.
// Esto detecta desincronías entre drugs.js y drugsDatabase.js.
if (import.meta.env?.DEV) {
  import('./drugs').then(({ DRUGS }) => {
    const atlasNames = new Set(DRUGS.map(d => d.name.toLowerCase()))
    for (const name of Object.keys(DRUGS_DATABASE)) {
      if (!atlasNames.has(name.toLowerCase())) {
        console.warn(`[drugsDatabase] "${name}" está en la calculadora pero no en el Atlas visual (drugs.js).`)
      }
    }
  })
}
