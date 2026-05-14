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
  { id: 'atlas',  label: 'Atlas Farmacológico', Icon: BookOpenIcon,   roles: ['admin', 'student'] },
  { id: 'calc',   label: 'Calculadora Dosis',   Icon: CalculatorIcon, roles: ['admin', 'student'] },
  { id: 'dil',    label: 'Dilución / Goteo',    Icon: FlaskIcon,      roles: ['admin', 'student'] },
  { id: 'inter',  label: 'Interacciones',       Icon: ZapIcon,        roles: ['admin', 'student'] },
  { id: 'enf',    label: 'Protocolos',          Icon: ActivityIcon,   roles: ['admin', 'student'] },
  { id: 'glos',   label: 'Glosario',            Icon: BookIcon,       roles: ['admin', 'student'] },
  { id: 'receta', label: 'Recetas',             Icon: FileEditIcon,   roles: ['admin', 'student'] },
  { id: 'audit',  label: 'Historial',           Icon: FileTextIcon,   roles: ['admin']            },
]
