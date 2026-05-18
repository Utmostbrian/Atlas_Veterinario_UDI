# Atlas Farmacológico Veterinario — UDI

[![CI](https://github.com/Utmostbrian/Atlas_Veterinario_UDI/actions/workflows/ci.yml/badge.svg)](https://github.com/Utmostbrian/Atlas_Veterinario_UDI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Herramienta docente de referencia farmacológica veterinaria con asistencia por IA, para la Facultad de Veterinaria — Universidad para el Desarrollo y la Innovación (UDI), Bolivia.

🌐 **Producción:** https://atlas-veterinario-udi.vercel.app

---

## Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **Atlas Farmacológico** | Catálogo de fármacos veterinarios con búsqueda y filtros por categoría/especie |
| **Calculadora de Dosis** | Cálculo por peso con validación clínica + perfil IA para fármacos no registrados |
| **Dilución / Goteo** | Calculadora de diluciones (C₁V₁=C₂V₂) y velocidades de infusión IV |
| **Verificador de Interacciones** | Análisis de interacciones farmacológicas con Claude |
| **Protocolos de Enfermedades** | Protocolos terapéuticos por enfermedad y especie |
| **Glosario** | Términos farmacológicos veterinarios |
| **Generador de Recetas** | Plantillas profesionales imprimibles con guardado en historial |
| **Historial / Auditoría** | Trazabilidad de eventos clínicos (solo administradores) |

---

## Stack

- **Frontend:** React 18 + Vite 5 + React Router 7 (SPA, code-split + manualChunks)
- **Backend:** Supabase (PostgreSQL 15 + Auth v2 + Edge Functions Deno)
- **IA:** Anthropic Claude (Sonnet 4.6 default, fallback Haiku/Opus) vía proxy seguro
- **Hosting:** Vercel (frontend estático + edge cache) + Supabase (backend)
- **CI:** GitHub Actions con secrets-scan + migrations-lint + dependabot

---

## Arquitectura de seguridad

```
                      ┌─────────────────────┐
                      │  Vercel CDN + CSP   │
                      │  HSTS, X-Frame DENY │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │   React SPA         │
                      │  Supabase JWT auth  │
                      └──────────┬──────────┘
                                 │ Bearer JWT
              ┌──────────────────┼──────────────────┐
              │                  │                  │
   ┌──────────▼─────────┐  ┌─────▼──────┐  ┌────────▼────────┐
   │ Supabase Postgres  │  │   Edge:    │  │   Edge:         │
   │ RLS + SPs admin-   │  │ anthropic- │  │  student-login  │
   │ validation server- │  │  proxy     │  │  (rate-limited) │
   │ side               │  └─────┬──────┘  └─────────────────┘
   └────────────────────┘        │
                           ┌─────▼──────┐
                           │ Anthropic  │
                           │  Claude    │
                           └────────────┘
```

**La API Key de Anthropic vive exclusivamente en Supabase Edge Function Secrets.**
El cliente nunca la ve, ni siquiera en modo admin.

### Controles activos
- **RLS** habilitado en todas las tablas con políticas row/role
- **Stored Procedures con `SECURITY DEFINER`** que validan el rol admin server-side (no confían en flags del cliente)
- **CSP estricta** vía header HTTP (no meta-tag), con `connect-src` a `*.supabase.co` solamente
- **CORS allowlist** en edge functions, fail-secure (`null` si no matchea) con regex para previews `*.vercel.app`
- **Rate limiting dual**: por IP (memoria) + por user_id (persistente en Postgres)
- **Allowlist de modelos** en proxy Anthropic: el cliente no controla qué cuesta cada llamada
- **Idempotencia** de audit logs vía `event_id` único
- **Audit trail** con `actor_name` (estudiantes en cuenta compartida) y `user_email_snapshot` (sobrevive borrado de cuenta)
- **Trigger `handle_new_user` hardcoded a rol student** — promoción a admin solo vía SQL directo
- **SSE heartbeat** en proxy para sobrevivir timeouts de CDN
- **Secrets scan** en CI (regex sobre git tree) bloquea push si detecta credenciales

---

## Prerrequisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com), [Vercel](https://vercel.com), [Anthropic](https://console.anthropic.com)

## Instalación local

```bash
git clone https://github.com/Utmostbrian/Atlas_Veterinario_UDI.git
cd Atlas_Veterinario_UDI
npm install
cp .env.example .env
# Edita .env con tu URL/anon key de Supabase
npm run dev          # http://localhost:3000
```

## Variables de entorno

### Frontend (`.env`)
| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anon pública (segura para el frontend) |

`VITE_ANTHROPIC_API_KEY` **no se usa más** — el proxy con JWT cubre el caso.

### Supabase Edge Function Secrets
| Secret | Descripción |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Clave de Anthropic Claude (server-side only) |
| `ALLOWED_ORIGIN` | Allowlist CORS, separado por coma. Sin esto solo permite localhost. |
| `STUDENT_CLASS_CODE` | Código de clase para login estudiantes |
| `STUDENT_ACCOUNT_PASSWORD` | Password de la cuenta compartida `estudiante@udi.edu.bo` |

## Deploy

### Vercel (frontend)
1. Conectar repo en vercel.com
2. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
3. Vercel detecta Vite automáticamente

### Supabase (backend)
```bash
supabase link --project-ref <tu-ref>
supabase db push                              # aplica migraciones
supabase functions deploy anthropic-proxy
supabase functions deploy student-login
```

### Acciones manuales en Supabase Dashboard
1. **Authentication → Sign In/Up → desactivar "Allow new users to sign up"** (evita escalación)
2. **Crear admin manual:** `UPDATE public.profiles SET role='admin' WHERE id='<uuid>'`
3. **Settings → Edge Functions → Secrets:** setear los 4 secrets listados arriba

### Acciones manuales en GitHub
1. **Settings → Branches → Branch protection rules:** requerir status checks (`build`, `secrets-scan`, `migrations-lint`) y al menos 1 review antes de merge a `main`

---

## Scripts

```bash
npm run dev          # Servidor dev (puerto 3000)
npm run build        # Build de producción
npm run preview      # Preview del build
npm test             # Tests unitarios
npm run test:watch   # Tests en modo watch
npm run lint         # ESLint flat config
```

## Autenticación

| Rol | Acceso | Login |
|-----|--------|-------|
| **Estudiante** | Atlas, calculadoras, glosario, recetas, chat IA | Nombre + código de clase |
| **Admin** | Todo lo anterior + historial de auditoría con datos de todos los usuarios | Email institucional + password |

El trigger `handle_new_user` siempre asigna rol `student` — promoción a admin solo vía SQL directo (anti-escalación).

## Migraciones de DB

`supabase/migrations/` (orden cronológico):
- `20260515000001_initial_schema` — tablas, RLS, SPs, triggers
- `20260515000002_prescriptions` — SP de recetas y vista de reporting
- `20260516000001_rate_limits` — rate limit persistente
- `20260517000001_bugfix_indexes_retention` — índices compuestos, retención
- `20260517000002_security_hardening` — admin validation server-side, actor_name, audit_failures
- `20260518000001_profile_photo_and_trgm_indexes` — foto perfil, GIN trgm
- `20260518000002_hardening_r6` — anti-escalación, email snapshot, pg_cron cleanup

## Aviso legal

Las dosis son **orientativas**. No reemplazan el juicio clínico profesional ni la prescripción veterinaria. Uso exclusivo con fines académicos. Ver [LICENSE](LICENSE) para el disclaimer completo.

---

*Escuela de Informatica y Telecomunicaciones — Universidad UDI, Bolivia · 2026*
