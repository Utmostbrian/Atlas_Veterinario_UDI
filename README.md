# Atlas Farmacológico Veterinario — UDI

[![CI](https://github.com/Utmostbrian/Atlas_Veterinario_UDI/actions/workflows/ci.yml/badge.svg)](https://github.com/Utmostbrian/Atlas_Veterinario_UDI/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Herramienta docente de referencia farmacológica veterinaria con asistencia por IA, para la Facultad de Veterinaria — Universidad para el Desarrollo y la Innovación (UDI), Bolivia.

🌐 **Producción:** https://atlas-veterinario-udi.vercel.app

---

## Funcionalidades

### Módulos clínicos
| Módulo | Descripción |
|--------|-------------|
| **Atlas Farmacológico** | Catálogo de fármacos con búsqueda fuzzy (pg_trgm) y filtros por categoría/especie |
| **Calculadora de Dosis** | Cálculo por peso con validación clínica + perfil IA para fármacos no registrados |
| **Dilución / Goteo** | Calculadora de diluciones (C₁V₁=C₂V₂) y velocidades de infusión IV |
| **Verificador de Interacciones** | Análisis de interacciones farmacológicas con Claude |
| **Protocolos de Enfermedades** | Protocolos terapéuticos por enfermedad y especie |
| **Glosario** | Términos farmacológicos veterinarios |
| **Generador de Recetas** | Plantillas profesionales imprimibles con guardado en historial |
| **Vademécum vectorial** | Búsqueda semántica sobre PDFs ingeridos (pgvector + Claude para citas) |

### Chat IA Veterinario
- **Streaming en tiempo real** con Claude Sonnet 4.6 (fallback automático a Haiku/Opus)
- **Vision IA**: adjuntar imágenes de receta, etiqueta o síntoma para análisis
- **Modo llamada conversacional** tipo Gemini Live: orbe animado, loop *escuchar → pensar → hablar → re-escuchar*
- **Dictado por voz** (Web Speech API) para escribir mensajes hablando
- **Historial persistente de conversaciones** por usuario, con auto-restauración de la última sesión
- **Audit trail** automático: cada consulta IA queda registrada con actor + snapshot

### Administración
| Panel | Descripción |
|-------|-------------|
| **Dashboard admin** | KPIs en tiempo real: usuarios activos, consultas IA, recetas emitidas, login failures |
| **Gestión de usuarios** | Crear / eliminar / promover roles (admin / docente / estudiante) |
| **Historial de auditoría** | Trazabilidad completa de eventos clínicos de todos los usuarios |
| **Ingesta de vademécum** | Subida de PDFs → extracción → embeddings → tabla vectorial |
| **Login failures** | Bitácora de intentos fallidos con IP y user-agent |

---

## Stack

- **Frontend:** React 18 + Vite 5 + React Router 7 (SPA, code-split + manualChunks)
- **Backend:** Supabase (PostgreSQL 15 + pgvector + pg_trgm + Auth v2 + Edge Functions Deno)
- **IA:** Anthropic Claude (Sonnet 4.6 default, fallback Haiku 4.5 / Opus 4.7) vía proxy seguro
- **Voz:** Web Speech API (STT + TTS nativo del navegador, sin costos extra)
- **Hosting:** Vercel (frontend estático + edge cache) + Supabase (backend)
- **Testing:** Vitest + Testing Library
- **CI:** GitHub Actions con secrets-scan + migrations-lint + dependabot

---

## Arquitectura de seguridad

```
                      ┌─────────────────────┐
                      │  Vercel CDN + CSP   │
                      │  HSTS, X-Frame DENY │
                      │  Permissions-Policy │
                      └──────────┬──────────┘
                                 │
                      ┌──────────▼──────────┐
                      │   React SPA         │
                      │  Supabase JWT auth  │
                      └──────────┬──────────┘
                                 │ Bearer JWT
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
┌──────▼───────┐  ┌──────────────▼───────────┐  ┌──────────▼──────────┐
│  Postgres    │  │   Edge Functions Deno    │  │  Web Speech API     │
│  RLS + SPs   │  │  • anthropic-proxy       │  │  (cliente, gratis)  │
│  pgvector    │  │  • student-login         │  │  STT + TTS          │
│  pg_trgm     │  │  • admin-create-user     │  └─────────────────────┘
│  pg_cron     │  │  • admin-delete-user     │
└──────────────┘  │  • ingest-vademecum      │
                  └──────────────┬───────────┘
                                 │
                          ┌──────▼───────┐
                          │  Anthropic   │
                          │   Claude     │
                          └──────────────┘
```

**La API Key de Anthropic vive exclusivamente en Supabase Edge Function Secrets.**
El cliente nunca la ve, ni siquiera en modo admin.

### Controles activos
- **RLS** habilitado en todas las tablas con políticas row/role
- **Stored Procedures con `SECURITY DEFINER`** que validan rol admin/docente server-side (no confían en flags del cliente)
- **CSP estricta** vía header HTTP, con `connect-src` a `*.supabase.co` solamente
- **Permissions-Policy** con `microphone=(self)` para Web Speech API
- **CORS allowlist** en edge functions, fail-secure (`null` si no matchea) con regex para previews `*.vercel.app`
- **Rate limiting dual**: por IP (memoria) + por user_id (persistente en Postgres)
- **Allowlist de modelos** en proxy Anthropic: el cliente no controla qué cuesta cada llamada
- **Idempotencia** de audit logs vía `event_id` único
- **Audit trail** con `actor_name` (estudiantes en cuenta compartida) y `user_email_snapshot` (sobrevive borrado de cuenta)
- **Trigger `handle_new_user` hardcoded a rol student** — promoción a admin/docente solo vía SQL directo
- **SSE heartbeat** en proxy para sobrevivir timeouts de CDN
- **Login failures tracking** con IP + user-agent
- **Secrets scan** en CI bloquea push si detecta credenciales

---

## Prerrequisitos

- Node.js 20+
- Cuenta en [Supabase](https://supabase.com), [Vercel](https://vercel.com), [Anthropic](https://console.anthropic.com)

## Instalación local

```bash
git clone https://github.com/Utmostbrian/Atlas_Veterinario_UDI.git
cd Atlas_Veterinario_UDI
npm install
# Crear .env con tus credenciales (ver tabla abajo)
npm run dev          # http://localhost:3000
```

## Variables de entorno

### Frontend (`.env`)
| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anon pública (segura para el frontend) |

`VITE_ANTHROPIC_API_KEY` **no se usa** — el proxy con JWT cubre el caso.

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
4. Headers de seguridad (CSP, HSTS, Permissions-Policy) ya están en `vercel.json`

### Supabase (backend)
```bash
supabase link --project-ref <tu-ref>
supabase db push                              # aplica todas las migraciones
supabase functions deploy anthropic-proxy
supabase functions deploy student-login
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy ingest-vademecum
```

### Acciones manuales en Supabase Dashboard
1. **Authentication → Sign In/Up → desactivar "Allow new users to sign up"** (evita escalación)
2. **Crear admin manual:** `UPDATE public.profiles SET role='admin' WHERE id='<uuid>'`
3. **Crear docente manual:** `UPDATE public.profiles SET role='docente' WHERE id='<uuid>'`
4. **Settings → Edge Functions → Secrets:** setear los 4 secrets listados arriba
5. **Database → Extensions:** habilitar `pgvector`, `pg_trgm`, `pg_cron`

### Acciones manuales en GitHub
1. **Settings → Branches → Branch protection rules:** requerir status checks (`build`, `secrets-scan`, `migrations-lint`) y al menos 1 review antes de merge a `main`

---

## Scripts

```bash
npm run dev          # Servidor dev (puerto 3000)
npm run build        # Build de producción
npm run preview      # Preview del build
npm test             # Tests unitarios (Vitest)
npm run test:watch   # Tests en modo watch
npm run lint         # ESLint flat config
```

## Autenticación

| Rol | Acceso | Login |
|-----|--------|-------|
| **Estudiante** | Atlas, calculadoras, glosario, recetas, chat IA | Email Estudiantil  + password |
| **Docente** | Todo lo anterior + auditoría limitada | Email institucional + password |
| **Admin** | Todo lo anterior + gestión de usuarios + KPIs + ingesta de vademécum | Email institucional + password |

El trigger `handle_new_user` siempre asigna rol `student` — promoción a admin/docente solo vía SQL directo (anti-escalación).

## Migraciones de DB

`supabase/migrations/` (orden cronológico):

| Migración | Contenido |
|-----------|-----------|
| `20260515000001_initial_schema` | Tablas base, RLS, SPs, triggers |
| `20260515000002_prescriptions` | SP de recetas y vista de reporting |
| `20260516000001_rate_limits` | Rate limit persistente |
| `20260517000001_bugfix_indexes_retention` | Índices compuestos, retención |
| `20260517000002_security_hardening` | Admin validation server-side, actor_name, audit_failures |
| `20260518000001_profile_photo_and_trgm_indexes` | Foto de perfil, GIN trgm para búsqueda fuzzy |
| `20260518000002_hardening_r6` | Anti-escalación, email snapshot, pg_cron cleanup |
| `20260518000003_chat_history` | Tablas `chat_conversations` + `chat_messages` con SPs |
| `20260518000004_add_docente_role` | Rol `docente` con permisos elevados |
| `20260518000005_admin_dashboard_kpis` | Vistas materializadas para KPIs del dashboard admin |
| `20260518000006_login_failures_and_user_mgmt` | Bitácora de login failures + SPs de user management |
| `20260518000007_catalog_animals_and_clinical_validation` | Catálogo de especies + reglas de validación clínica |
| `20260519000001_vademecum_pgvector` | Tabla vectorial con extensión pgvector |
| `20260519000002_vademecum_text_search` | Índices de búsqueda textual sobre vademécum |
| `20260519000003_vademecum_clear_fn` | Función para limpiar el vademécum |
| `20260519000004_fix_vademecum_search` | Corrección del SP de búsqueda |
| `20260520000001_fix_chat_messages_ambiguous_id` | Fix de ambigüedad SQL en `sp_get_chat_messages` |

## Estructura del proyecto

```
src/
├── components/
│   ├── admin/        # Dashboard, gestión de usuarios, ingesta vademécum
│   ├── atlas/        # Catálogo farmacológico
│   ├── audit/        # Historial de auditoría
│   ├── auth/         # Login, registro, perfil
│   ├── calculator/   # Calculadora de dosis, dilución
│   ├── chat/         # AIChatFloating, VoiceCallModal, HistoryPanel
│   ├── diseases/     # Protocolos por enfermedad
│   ├── glossary/     # Glosario
│   ├── interactions/ # Verificador de interacciones
│   ├── layout/       # Navbar, sidebar, footer
│   ├── prescription/ # Generador de recetas
│   ├── quiz/         # Quiz de farmacología
│   └── ui/           # Componentes reutilizables
├── hooks/
│   ├── useChat.js               # Streaming chat con historial persistente
│   ├── useSpeechRecognition.js  # STT (Web Speech API)
│   ├── useSpeechSynthesis.js    # TTS con cola de oraciones
│   ├── useDrugCalculator.js     # Lógica de cálculo de dosis
│   └── useLocalStorage.js       # Wrapper de localStorage con SSR-safe
├── services/
│   ├── anthropicService.js      # Cliente del proxy de Claude con streaming
│   ├── chatHistoryService.js    # RPCs de historial de chat
│   └── auditService.js          # Logging de eventos
├── context/AuthContext.jsx      # Estado de autenticación global
├── Icons/Icons.jsx              # Iconos SVG inline estilo Lucide
└── utils/                       # Helpers (markdown, sentence buffer, etc.)

supabase/
├── functions/        # Edge functions Deno
│   ├── anthropic-proxy/      # Proxy seguro a Claude con SSE + fallback de modelos
│   ├── student-login/        # Login estudiantes con rate limit
│   ├── admin-create-user/    # Crear usuario (solo admin)
│   ├── admin-delete-user/    # Eliminar usuario (solo admin)
│   └── ingest-vademecum/     # Ingesta PDF → embeddings → pgvector
└── migrations/       # SQL versionado (17 migraciones)
```

## Aviso legal

Las dosis son **orientativas**. No reemplazan el juicio clínico profesional ni la prescripción veterinaria. Uso exclusivo con fines académicos. Ver [LICENSE](LICENSE) para el disclaimer completo.

---

*Escuela de Informatica y Telecomunicaciones — Universidad UDI, Bolivia · 2026*
