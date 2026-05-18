import {
  BookOpenIcon,
  CalculatorIcon,
  FlaskIcon,
  ZapIcon,
  ActivityIcon,
  BookIcon,
  FileEditIcon,
  FileTextIcon,
} from '../Icons/Icons'

export const TABS = [
  { id: 'atlas',  label: 'Atlas Farmacológico', Icon: BookOpenIcon,   roles: ['admin', 'docente', 'student'] },
  { id: 'calc',   label: 'Calculadora Dosis',   Icon: CalculatorIcon, roles: ['admin', 'docente', 'student'] },
  { id: 'dil',    label: 'Dilución / Goteo',    Icon: FlaskIcon,      roles: ['admin', 'docente', 'student'] },
  { id: 'inter',  label: 'Interacciones',       Icon: ZapIcon,        roles: ['admin', 'docente', 'student'] },
  { id: 'enf',    label: 'Protocolos',          Icon: ActivityIcon,   roles: ['admin', 'docente', 'student'] },
  { id: 'glos',   label: 'Glosario',            Icon: BookIcon,       roles: ['admin', 'docente', 'student'] },
  { id: 'receta', label: 'Recetas',             Icon: FileEditIcon,   roles: ['admin', 'docente', 'student'] },
  { id: 'audit',  label: 'Historial',           Icon: FileTextIcon,   roles: ['admin', 'docente']            },
]
