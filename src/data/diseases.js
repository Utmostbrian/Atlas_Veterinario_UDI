export const DISEASES = [
  {
    id: 1,
    name: 'Mastitis Bovina',
    species: 'Bovino',
    color: '#003087',
    description:
      'Inflamación de la glándula mamaria de origen infeccioso. Principal causa de pérdidas económicas en ganadería lechera.',
    drugs: ['Amoxicilina', 'Oxitetraciclina', 'Meloxicam', 'Flunixin Meglumina'],
    protocol:
      'Antibiótico intramamario + sistémico. AINE para control de la inflamación. Ordeño completo previo al tratamiento.',
    severity: 'Alta',
  },
  {
    id: 2,
    name: 'Neumonía Bovina',
    species: 'Bovino',
    color: '#1a4aad',
    description:
      'Complejo respiratorio bovino (CRB). Principal causa de mortalidad en terneros de feedlot y engorde.',
    drugs: ['Enrofloxacina', 'Oxitetraciclina', 'Penicilina G Procaínica', 'Flunixin Meglumina'],
    protocol:
      'Antibiótico de amplio espectro de inicio precoz. AINE para reducir fiebre e inflamación pulmonar.',
    severity: 'Alta',
  },
  {
    id: 3,
    name: 'Anaplasmosis',
    species: 'Bovino',
    color: '#CC0000',
    description:
      'Enfermedad hemoparasitaria transmitida por garrapatas. Causada por Anaplasma marginale. Cursa con anemia hemolítica.',
    drugs: ['Oxitetraciclina'],
    protocol:
      'Oxitetraciclina como único tratamiento específico (10–20 mg/kg IM c/24 h por 3–5 días). La ivermectina controla las garrapatas vectores pero NO tiene actividad contra Anaplasma marginale y no debe usarse como tratamiento de la enfermedad.',
    severity: 'Alta',
  },
  {
    id: 4,
    name: 'Fasciolosis Hepática',
    species: 'Bovinos, Ovinos',
    color: '#CC0000',
    description:
      'Parasitosis hepática por Fasciola hepatica. Causa pérdidas productivas severas y decomisos en matadero.',
    drugs: ['Closantel', 'Albendazol'],
    protocol:
      'Closantel para fasciolas adultas e inmaduras. Albendazol para tratamiento polivalente (nematodos + fasciola adulta).',
    severity: 'Media',
  },
  {
    id: 5,
    name: 'Cólico Equino',
    species: 'Equino',
    color: '#006699',
    description:
      'Dolor abdominal agudo en caballos. Puede ser espástico, obstructivo, flatulento o estrangulante.',
    drugs: ['Flunixin Meglumina', 'Ketoprofeno', 'Xilazina'],
    protocol:
      'Analgesia con flunixin IV. Sedación con xilazina si necesario. Evaluar necesidad de cirugía en cólico refractario.',
    severity: 'Alta',
  },
  {
    id: 6,
    name: 'Parvovirus Canino',
    species: 'Perro',
    color: '#6600cc',
    description:
      'Enfermedad viral grave con gastroenteritis hemorrágica y leucopenia. Alta mortalidad en cachorros no vacunados.',
    drugs: ['Amoxicilina', 'Enrofloxacina', 'Meloxicam'],
    protocol:
      'Tratamiento de soporte (fluidoterapia, antiemético). Antibióticos para prevenir sepsis bacteriana secundaria.',
    severity: 'Muy Alta',
  },
  {
    id: 7,
    name: 'Dermatofitosis (Tiña)',
    species: 'Perros, Gatos, Bovinos',
    color: '#009944',
    description:
      'Infección fúngica superficial por Microsporum canis, M. gypseum y Trichophyton. Zoonosis importante.',
    drugs: ['Itraconazol', 'Ketoconazol'],
    protocol:
      'Tratamiento sistémico + tópico (champú antifúngico). Desinfección del ambiente. Cuarentena del animal afectado.',
    severity: 'Media',
  },
  {
    id: 8,
    name: 'Sarna Sarcóptica',
    species: 'Perros, Bovinos',
    color: '#cc6600',
    description:
      'Infestación por ácaros Sarcoptes scabiei. Produce prurito intenso, alopecia y lesiones costrosas. Zoonosis.',
    drugs: ['Ivermectina'],
    protocol:
      'Ivermectina SC o pour-on. Repetir a los 14 días. Tratar contactos. Baño con acaricida tópico en casos localizados.',
    severity: 'Media',
  },
  {
    id: 9,
    name: 'Hiperadrenocorticismo (Cushing)',
    species: 'Perro',
    color: '#003087',
    description:
      'Exceso crónico de cortisol por neoplasia hipofisaria (PDH 80%) o adrenal. Signos: PU/PD, alopecia, abdomen péndulo.',
    drugs: ['Ketoconazol'],
    protocol:
      'Trilostano es el tratamiento de primera línea aprobado para PDH canino (2–5 mg/kg VO c/24 h; ajustar según test ACTH estimulación). Ketoconazol es segunda línea y uso paliativo (15 mg/kg/día VO dividido c/12 h). Mitotano disponible para casos refractarios. Monitoreo de ACTH y cortisol basal cada 3 meses.',
    severity: 'Media',
  },
  {
    id: 10,
    name: 'Verminosis Gastrointestinal',
    species: 'Bovinos, Ovinos, Caprinos',
    color: '#CC0000',
    description:
      'Parasitosis por nematodos GI (Haemonchus, Ostertagia, Trichostrongylus). Causa pérdidas productivas severas.',
    drugs: ['Ivermectina', 'Albendazol', 'Closantel'],
    protocol:
      'Rotación de principios activos para evitar resistencias. FAMACHA® para identificar animales críticos. Desparasitación estratégica.',
    severity: 'Alta',
  },
  {
    id: 11,
    name: 'Distocia / Parto Difícil',
    species: 'Bovinos, Equinos, Perros',
    color: '#1a4aad',
    description:
      'Parto complicado por inercia uterina primaria/secundaria, sobredimensionamiento fetal o mala presentación.',
    drugs: ['Oxitocina', 'Xilazina', 'Ketamina'],
    protocol:
      'Oxitocina solo si hay inercia sin obstrucción. Sedación con xilazina para relajación. Cesárea si necesario.',
    severity: 'Muy Alta',
  },
  {
    id: 12,
    name: 'Osteoartritis',
    species: 'Perros, Gatos, Equinos',
    color: '#006699',
    description:
      'Enfermedad articular degenerativa crónica. Dolor progresivo, rigidez y pérdida de función articular.',
    drugs: ['Meloxicam', 'Ketoprofeno', 'Flunixin Meglumina'],
    protocol:
      'AINE COX-2 selectivo (meloxicam) como base. Fisioterapia. Control de peso. Suplementos de condroprotectores.',
    severity: 'Media',
  },
]
