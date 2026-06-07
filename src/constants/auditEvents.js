export const AUDIT_EVENT_META = {
  AUTH_LOGIN: {
    label: 'Inicio de sesión',
    plural: 'Inicios de sesión',
    color: '#64748b',
  },
  DRUG_SEARCH: {
    label: 'Busqueda real',
    plural: 'Busquedas reales',
    color: '#003087',
  },
  DRUG_CARD_OPEN: {
    label: 'Ficha consultada',
    plural: 'Fichas consultadas',
    color: '#0891b2',
  },
  DISEASE_PROTOCOL_VIEW: {
    label: 'Protocolo consultado',
    plural: 'Protocolos consultados',
    color: '#0f766e',
  },
  DOSE_CALCULATED: {
    label: 'Dosis calculada',
    plural: 'Dosis calculadas',
    color: '#16a34a',
  },
  DOSE_VALIDATED: {
    label: 'Dosis validada',
    plural: 'Dosis validadas',
    color: '#7c3aed',
  },
  AI_CONSULTATION: {
    label: 'Consulta IA',
    plural: 'Consultas IA',
    color: '#0D9488',
  },
  PRESCRIPTION_GEN: {
    label: 'Receta generada',
    plural: 'Recetas',
    color: '#9A3412',
  },
  INTERACTION_CHECK: {
    label: 'Interaccion',
    plural: 'Interacciones',
    color: '#d97706',
  },
  PRESCRIPTION_DOSE_OVERRIDE: {
    label: 'Override de dosis',
    plural: 'Overrides de dosis',
    color: '#dc2626',
  },
}

export function eventLabel(eventType, { plural = false } = {}) {
  const meta = AUDIT_EVENT_META[eventType]
  if (!meta) return eventType
  return plural ? (meta.plural ?? meta.label) : meta.label
}

export function eventColor(eventType) {
  return AUDIT_EVENT_META[eventType]?.color ?? '#475569'
}
