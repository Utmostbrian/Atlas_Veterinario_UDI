# Atlas Farmacológico Veterinario — UDI

Herramienta docente de referencia farmacológica con inteligencia artificial para la Facultad de Veterinaria de la Universidad UDI, Bolivia.

## Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **Atlas Farmacológico** | Base de datos visual de fármacos veterinarios con búsqueda y filtros por categoría y especie |
| **Calculadora de Dosis** | Cálculo de dosis por peso con validación clínica y perfil IA para fármacos no registrados |
| **Dilución / Goteo** | Calculadora de diluciones y velocidades de infusión |
| **Verificador de Interacciones** | Análisis de interacciones farmacológicas con IA |
| **Protocolos de Enfermedades** | Protocolos terapéuticos por enfermedad y especie |
| **Glosario** | Términos farmacológicos veterinarios |
| **Generador de Recetas** | Plantillas de recetas veterinarias |
| **Historial de Consultas** | Auditoría de uso (solo administradores) |

## Stack Técnico

- **Frontend:** React 18 + Vite 5 + React Router 7
- **Backend:** Supabase (PostgreSQL + Auth v2 + Edge Functions en Deno)
- **IA:** Anthropic Claude via proxy seguro (API key nunca llega al cliente)
- **Deploy:** Vercel (frontend estático) + Supabase (backend)

## Arquitectura de Seguridad

```
Browser → Supabase Edge Function (JWT auth) → Anthropic API
```

La API Key de Anthropic vive exclusivamente en Supabase Secrets. El cliente solo envía su JWT de sesión.

## Prerrequisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com)
- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [Anthropic](https://console.anthropic.com)

## Instalación Local

```bash
git clone https://github.com/Utmostbrian/Atlas_Veterinario_UDI.git
cd Atlas_Veterinario_UDI
npm install
cp .env.example .env
# Edita .env con tus valores de Supabase
npm run dev
```

La app estará disponible en `http://localhost:3000`.

## Variables de Entorno

| Variable | Descripción | Dónde obtenerla |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Clave anon pública de Supabase | Dashboard → Settings → API |
| `VITE_ANTHROPIC_API_KEY` | Solo para desarrollo local | console.anthropic.com |

En producción, `ANTHROPIC_API_KEY` vive en **Supabase Secrets** (nunca en Vercel).

## Secrets en Supabase Edge Functions

Configurar en: Dashboard → Edge Functions → Manage secrets

| Secret | Descripción |
|--------|-------------|
| `ANTHROPIC_API_KEY` | API Key de Anthropic Claude |
| `STUDENT_CLASS_CODE` | Código de acceso para estudiantes |
| `STUDENT_ACCOUNT_PASSWORD` | Contraseña de la cuenta compartida de estudiante |
| `ALLOWED_ORIGIN` | Dominio de producción en Vercel (para CORS) |

## Deploy en Vercel

1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Configura las variables de entorno (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
3. Vercel detecta Vite automáticamente — sin configuración adicional

## Base de Datos (Supabase)

Aplicar migraciones en orden:

```bash
supabase link --project-ref <tu-ref>
supabase db push
```

Las migraciones están en `supabase/migrations/`.

## Scripts Disponibles

```bash
npm run dev        # Servidor de desarrollo (puerto 3000)
npm run build      # Build de producción
npm run preview    # Preview del build
npm test           # Ejecutar tests unitarios
npm run test:watch # Tests en modo observador
npm run lint       # Análisis estático de código
```

## Autenticación

El sistema soporta dos tipos de usuario:

- **Admin** (`admin@udi.edu.bo`): acceso completo incluyendo historial de auditoría
- **Estudiante**: acceso con nombre + código de clase; usa cuenta compartida `estudiante@udi.edu.bo`

## Aviso Legal

Las dosis son **orientativas**. No reemplazan el juicio clínico profesional ni la prescripción veterinaria. Uso exclusivo con fines académicos.

---

*Escuela de Informatica y Telecomunicaciones — Universidad UDI, Bolivia*
