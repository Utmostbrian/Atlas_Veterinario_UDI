export const CATEGORY_MAP = {
  AB: { label: 'Antibiótico',      color: 'var(--cat-ab)' },
  AP: { label: 'Antiparasitario',  color: 'var(--cat-ap)' },
  AI: { label: 'Antiinflamatorio', color: 'var(--cat-ai)' },
  AN: { label: 'Anestésico',       color: 'var(--cat-an)' },
  AF: { label: 'Antifúngico',      color: 'var(--cat-af)' },
  HO: { label: 'Hormona',          color: 'var(--cat-ho)' },
}

export const DRUGS = [
  {
    id: 1,
    name: 'Amoxicilina',
    latin: 'Amoxicillin trihydratum',
    category: 'AB',
    routes: 'IM / SC / VO',
    species: 'Perros, Gatos, Bovinos',
    description:
      'Antibiótico betalactámico de amplio espectro. Inhibe la síntesis de pared celular bacteriana. Bactericida tiempo-dependiente.',
    dosages: [
      ['Perro / Gato', '11–22 mg/kg', 'VO', 'c/8–12 h'],
      ['Bovino',       '7 mg/kg',     'IM', 'c/24 h'],
    ],
    warnings: 'Evitar en animales con alergia a betalactámicos.',
    interactions: 'Antagonismo con tetraciclinas y macrólidos.',
  },
  {
    id: 2,
    name: 'Enrofloxacina',
    latin: 'Enrofloxacinum',
    category: 'AB',
    routes: 'IM / SC / VO',
    species: 'Perros, Gatos, Bovinos',
    description:
      'Fluoroquinolona bactericida de amplio espectro. Inhibe la ADN-girasa bacteriana. Eficaz frente a gramnegativos.',
    dosages: [
      ['Perro',   '5–20 mg/kg',   'VO',  'c/24 h'],
      ['Bovino',  '2.5–5 mg/kg',  'SC',  'c/24 h'],
    ],
    warnings: 'No usar en animales jóvenes en crecimiento. Fotosensibilización en gatos.',
    interactions: 'Reducción de absorción con antiácidos de aluminio/magnesio.',
  },
  {
    id: 3,
    name: 'Oxitetraciclina',
    latin: 'Oxytetracyclinum',
    category: 'AB',
    routes: 'IM / IV / VO',
    species: 'Bovinos, Equinos, Porcinos',
    description:
      'Tetraciclina de amplio espectro, bacteriostática. Inhibe síntesis proteica bacteriana al unirse al ribosoma 30S.',
    dosages: [
      ['Bovino', '6.6–11 mg/kg', 'IM',      'c/24 h'],
      ['Equino', '6.6 mg/kg',   'IV lenta', 'c/12 h'],
    ],
    warnings: 'Nefrotóxica en dosis altas. No usar en animales con insuficiencia renal.',
    interactions: 'Quelación con calcio, magnesio y hierro. Incompatible con penicilinas IV.',
  },
  {
    id: 4,
    name: 'Penicilina G Procaínica',
    latin: 'Penicillinum G procainum',
    category: 'AB',
    routes: 'IM',
    species: 'Bovinos, Equinos, Ovinos',
    description:
      'Betalactámico de depósito con liberación lenta. Activo frente a grampositivos y espiroquetas.',
    dosages: [
      ['Bovino', '22.000 UI/kg', 'IM profunda', 'c/24 h'],
      ['Equino', '22.000 UI/kg', 'IM profunda', 'c/24 h'],
    ],
    warnings: 'No administrar IV. Riesgo de shock anafiláctico.',
    interactions: 'Antagonismo con tetraciclinas. Sinergismo con aminoglucósidos.',
  },
  {
    id: 5,
    name: 'Ivermectina',
    latin: 'Ivermectinum',
    category: 'AP',
    routes: 'SC / VO / Pour-on',
    species: 'Bovinos, Equinos, Ovinos, Perros',
    description:
      'Macrólido antiparasitario de amplio espectro. Activo frente a nematodos y ectoparásitos. Premio Nobel 2015.',
    dosages: [
      ['Bovino',              '0.2 mg/kg',   'SC',  'Dosis única'],
      ['Perro (preventivo)', '0.006 mg/kg',  'VO',  'Mensual'],
    ],
    warnings: 'Tóxico en Collies y razas MDR1+. No usar en animales <6 semanas.',
    interactions: 'No combinar con otros fármacos que inhiban la glicoproteína-P.',
  },
  {
    id: 6,
    name: 'Albendazol',
    latin: 'Albendazolum',
    category: 'AP',
    routes: 'VO',
    species: 'Bovinos, Ovinos, Porcinos',
    description:
      'Benzimidazol de amplio espectro. Activo frente a nematodos, cestodos y trematodos inmaduros.',
    dosages: [
      ['Bovino', '7.5 mg/kg', 'VO', 'Dosis única'],
      ['Ovino',  '5 mg/kg',   'VO', 'Dosis única'],
    ],
    warnings: 'Teratogénico. No usar en el primer tercio de gestación.',
    interactions: 'Absorción aumentada con alimentos grasos.',
  },
  {
    id: 7,
    name: 'Closantel',
    latin: 'Closantelum',
    category: 'AP',
    routes: 'SC / VO',
    species: 'Bovinos, Ovinos',
    description:
      'Salicilanilida eficaz frente a Fasciola hepatica adulta e inmadura y ectoparásitos.',
    dosages: [
      ['Bovino', '10 mg/kg', 'SC',    'Dosis única'],
      ['Ovino',  '10 mg/kg', 'SC/VO', 'Dosis única'],
    ],
    warnings: 'Margen de seguridad estrecho. Alta fijación a proteínas plasmáticas.',
    interactions: 'Potencia la toxicidad de otros fasciolicidas.',
  },
  {
    id: 8,
    name: 'Meloxicam',
    latin: 'Meloxicamum',
    category: 'AI',
    routes: 'SC / IV / VO',
    species: 'Perros, Gatos, Bovinos, Equinos',
    description:
      'AINE selectivo COX-2. Excelente perfil de seguridad gastrointestinal. Uso en dolor postquirúrgico y osteoartritis.',
    dosages: [
      ['Perro',   '0.2 mg/kg (1er día), luego 0.1 mg/kg', 'VO/SC', 'c/24 h'],
      ['Bovino',  '0.5 mg/kg',                             'IV/SC',  'c/24 h'],
    ],
    warnings: 'Evitar en animales con insuficiencia renal o hepática. No combinar con corticoides.',
    interactions: 'Riesgo aumentado de nefrotoxicidad con aminoglucósidos y ciclosporina.',
  },
  {
    id: 9,
    name: 'Flunixin Meglumina',
    latin: 'Flunixinum megluminum',
    category: 'AI',
    routes: 'IV / IM',
    species: 'Bovinos, Equinos, Porcinos',
    description:
      'AINE potente de acción rápida, no selectivo COX. Referencia en cólico equino, mastitis bovina y endotoxemia.',
    dosages: [
      ['Equino', '1.1 mg/kg',  'IV lenta', 'c/12 h'],
      ['Bovino', '2.2 mg/kg',  'IV',       'c/24 h'],
    ],
    warnings: 'Ulcerógeno GI con uso prolongado. No usar SC (necrosis tisular).',
    interactions: 'Potencia anticoagulantes. Nefrotóxico combinado con aminoglucósidos.',
  },
  {
    id: 10,
    name: 'Ketoprofeno',
    latin: 'Ketoprofenum',
    category: 'AI',
    routes: 'IM / IV / VO',
    species: 'Bovinos, Equinos, Perros',
    description:
      'AINE del grupo profenos. Potente acción antiinflamatoria, analgésica y antipirética. Inhibe COX y lipoxigenasa.',
    dosages: [
      ['Bovino', '3 mg/kg',   'IV/IM', 'c/24 h'],
      ['Equino', '2.2 mg/kg', 'IV',    'c/24 h'],
    ],
    warnings: 'Uso limitado a 5 días. Puede causar úlceras GI.',
    interactions: 'No combinar con otros AINEs ni corticoides.',
  },
  {
    id: 11,
    name: 'Ketamina',
    latin: 'Ketaminum',
    category: 'AN',
    routes: 'IV / IM',
    species: 'Perros, Gatos, Bovinos, Equinos',
    description:
      'Anestésico disociativo antagonista NMDA. Analgesia profunda, mantenimiento de reflejos protectores. Referencia en campo veterinario.',
    dosages: [
      ['Perro (+ diazepam)', '5–10 mg/kg',  'IV', 'Dosis única'],
      ['Gato',               '11–33 mg/kg', 'IM', 'Dosis única'],
    ],
    warnings: 'Aumenta presión intraocular e intracraneal. No usar en epilépticos.',
    interactions: 'Combinar con benzodiacepinas o xilazina para relajación muscular.',
  },
  {
    id: 12,
    name: 'Xilazina',
    latin: 'Xylazinum',
    category: 'AN',
    routes: 'IV / IM',
    species: 'Bovinos, Equinos, Perros, Gatos',
    description:
      'Agonista alfa-2 adrenérgico sedante, analgésico y miorrelajante. Esencial en anestesia de campo veterinaria.',
    dosages: [
      ['Bovino', '0.05–0.1 mg/kg',  'IM',       'Dosis única'],
      ['Equino', '0.5–1.1 mg/kg',   'IV lenta',  'Dosis única'],
    ],
    warnings: 'Bovinos muy sensibles. Depresión cardiovascular y respiratoria. Antagonista: Atipamezol / Yohimbina.',
    interactions: 'Potencia todos los depresores del SNC.',
  },
  {
    id: 13,
    name: 'Propofol',
    latin: 'Propofolum',
    category: 'AN',
    routes: 'IV exclusivo',
    species: 'Perros, Gatos',
    description:
      'Anestésico de inducción IV ultra-corto. Recuperación rápida y suave. Estándar en anestesia de pequeños animales.',
    dosages: [
      ['Perro (premedicado)', '1–2 mg/kg', 'IV lenta', 'Dosis única'],
      ['Gato',               '6–8 mg/kg', 'IV lenta', 'Dosis única'],
    ],
    warnings: 'Solo IV. Puede causar apnea transitoria. Formulación: emulsión lipídica, no reutilizar viales.',
    interactions: 'Potencia opioides y benzodiacepinas. No mezclar con otros fármacos en la misma jeringa.',
  },
  {
    id: 14,
    name: 'Itraconazol',
    latin: 'Itraconazolum',
    category: 'AF',
    routes: 'VO',
    species: 'Perros, Gatos, Aves',
    description:
      'Azol antifúngico de amplio espectro. Primera elección en dermatomicosis, aspergilosis y candidiasis sistémica.',
    dosages: [
      ['Perro', '5 mg/kg',     'VO c/alimentos', 'c/24 h'],
      ['Gato',  '5–10 mg/kg',  'VO',             'c/24 h'],
    ],
    warnings: 'Hepatotóxico con uso prolongado. Monitorear enzimas hepáticas.',
    interactions: 'Inhibidor CYP3A4: múltiples interacciones. Aumenta niveles de ciclosporina y digoxina.',
  },
  {
    id: 15,
    name: 'Ketoconazol',
    latin: 'Ketoconazolum',
    category: 'AF',
    routes: 'VO',
    species: 'Perros, Gatos',
    description:
      'Azol antifúngico oral. Segunda línea tras itraconazol. Usado también en hiperadrenocorticismo canino (Cushing).',
    dosages: [
      ['Perro (micosis)', '10 mg/kg',      'VO c/alimentos', 'c/24 h'],
      ['Perro (Cushing)', '15 mg/kg/día',  'VO',             'c/12 h'],
    ],
    warnings: 'Hepatotóxico. No usar en gestación. Puede causar náusea y anorexia.',
    interactions: 'Potente inhibidor CYP. Aumenta niveles de ciclosporina, benzodiacepinas y corticoides.',
  },
  {
    id: 16,
    name: 'Oxitocina',
    latin: 'Oxytocinum',
    category: 'HO',
    routes: 'IM / IV / SC',
    species: 'Bovinos, Equinos, Perros, Gatos',
    description:
      'Hormona uterotónica y galactógoga. Esencial en obstetricia veterinaria para inducción del parto y letdown lácteo.',
    dosages: [
      ['Bovino',      '20–40 UI', 'IM / IV lenta', 'Dosis única'],
      ['Perro / Gato', '2–5 UI',  'IM / SC',        'c/30 min'],
    ],
    warnings: 'No usar ante obstrucción o mala presentación fetal. Riesgo de rotura uterina.',
    interactions: 'Sinergismo con prostaglandinas. Potencia anestésicos generales.',
  },
  {
    id: 17,
    name: 'Progesterona',
    latin: 'Progesteronum',
    category: 'HO',
    routes: 'IM / Implante SC',
    species: 'Bovinos, Equinos, Ovinos',
    description:
      'Hormona gestacional. Esencial en sincronización de celos (CIDR) y soporte de gestación en protocolos IATF.',
    dosages: [
      ['Bovino (CIDR)', 'Disp. 1.38 g', 'Intravaginal', '7 días'],
      ['Ovino (CIDR)',  'Disp. 0.3 g',  'Intravaginal', '14 días'],
    ],
    warnings: 'No usar en hembras no gestantes (hiperplasia endometrial quística en gatas).',
    interactions: 'Antagoniza estrógenos exógenos. Parte de protocolos Ovsynch / Select Synch.',
  },
]

export const CATEGORIES = Object.entries(CATEGORY_MAP).map(([key, val]) => ({
  key,
  ...val,
}))
