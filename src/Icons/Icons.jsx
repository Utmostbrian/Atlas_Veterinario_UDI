/* Componentes SVG inline — todos usan stroke="currentColor" para heredar color del CSS */

function Ico({ size = 20, className = '', style = {}, sw = 2, children }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

/* ── Atlas Farmacológico ── */
export function BookOpenIcon(p) {
  return <Ico {...p}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </Ico>
}

/* ── Calculadora de Dosis ── */
export function CalculatorIcon(p) {
  return <Ico {...p}>
    <rect width="16" height="20" x="4" y="2" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="16" y1="14" x2="16" y2="18" />
    <path d="M16 10h.01" />
    <path d="M12 10h.01" />
    <path d="M8 10h.01" />
    <path d="M12 14h.01" />
    <path d="M8 14h.01" />
    <path d="M12 18h.01" />
    <path d="M8 18h.01" />
  </Ico>
}

/* ── Dilución / Goteo ── */
export function FlaskIcon(p) {
  return <Ico {...p}>
    <rect width="18" height="14" x="3" y="8" rx="2" />
    <path d="M12 5a3 3 0 1 0-3 3" />
    <line x1="9" y1="18" x2="9" y2="18" />
    <line x1="15" y1="18" x2="15" y2="18" />
  </Ico>
}

/* ── Interacciones ── */
export function ZapIcon(p) {
  return <Ico {...p}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </Ico>
}

/* ── Protocolos / Pulso ── */
export function ActivityIcon(p) {
  return <Ico {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Ico>
}

/* ── Glosario ── */
export function BookIcon(p) {
  return <Ico {...p}>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    <path d="M8 7h6" />
    <path d="M8 11h8" />
  </Ico>
}

/* ── Receta Veterinaria ── */
export function FileEditIcon(p) {
  return <Ico {...p}>
    <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
    <path d="M2 12h4" />
    <path d="M2 18h4" />
    <path d="m21.38 5.63-8.6 8.6a2 2 0 0 1-1.39.58H8.5v-2.89c0-.53.21-1.04.59-1.4l8.59-8.59a2.83 2.83 0 1 1 4 4z" />
  </Ico>
}

/* ── Historial / Documento ── */
export function FileTextIcon(p) {
  return <Ico {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <line x1="10" y1="9" x2="8" y2="9" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </Ico>
}

/* ── IA / Sparkles (FAB del chat) ── */
export function SparklesIcon(p) {
  return <Ico sw={2.2} {...p}>
    <path d="M10 3L11.5 8.5L17 10L11.5 11.5L10 17L8.5 11.5L3 10L8.5 8.5L10 3Z" />
    <path d="M19 15L19.5 17.5L22 18L19.5 18.5L19 21L18.5 18.5L16 18L18.5 17.5L19 15Z" />
  </Ico>
}

/* ── Búsqueda ── */
export function SearchIcon(p) {
  return <Ico sw={2.2} {...p}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Ico>
}

/* ── Balanza / Comparador ── */
export function ScaleIcon(p) {
  return <Ico {...p}>
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M7 21h10" />
    <path d="M12 3v18" />
    <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
  </Ico>
}

/* ── Droplet / Dilución ── */
export function DropletIcon(p) {
  return <Ico {...p}>
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
  </Ico>
}

/* ── Jeringa / Vacunas ── */
export function SyringeIcon(p) {
  return <Ico {...p}>
    <path d="m18 2 4 4" />
    <path d="m17 7 3-3" />
    <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
    <path d="m9 11 4 4" />
    <path d="m5 19-3 3" />
    <path d="m14 4 6 6" />
  </Ico>
}

/* ── Check / Confirmado ── */
export function CheckSquareIcon(p) {
  return <Ico {...p}>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </Ico>
}

/* ── Cerrar / Close (X) ── */
export function CloseIcon(p) {
  return <Ico {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Ico>
}

/* ── Advertencia / Warning (triángulo !) ── */
export function WarningIcon(p) {
  return <Ico {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Ico>
}

/* ── Globo / Globe ── */
export function GlobeIcon(p) {
  return <Ico {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Ico>
}

/* ── Info / AlertCircle (círculo !) ── */
export function AlertCircleIcon(p) {
  return <Ico {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </Ico>
}

/* ── Menú hamburguesa ── */
export function MenuIcon(p) {
  return <Ico {...p}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </Ico>
}

/* ── Sol / Modo claro ── */
export function SunIcon(p) {
  return <Ico {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Ico>
}

/* ── Luna / Modo oscuro ── */
export function MoonIcon(p) {
  return <Ico {...p}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </Ico>
}
