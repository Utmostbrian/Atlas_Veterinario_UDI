# Guía de Configuración — Supabase Backend

## Atlas Farmacológico Veterinario · UDI

---

## 1. Crear el Proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project**
2. Nombre: `atlas-vet-udi`
3. Database password: guárdala en lugar seguro
4. Región: Sao Paulo (más cercana a Bolivia)

---

## 2. Ejecutar las Migraciones SQL

En el panel de Supabase → **SQL Editor** → **New query**:

**Ejecuta en orden:**

```
supabase/migrations/20260515_001_initial_schema.sql   ← primero
supabase/migrations/20260515_002_prescriptions.sql    ← segundo
```

Copia y pega el contenido de cada archivo y haz clic en **Run**.

Esto crea:
- Tablas: `profiles`, `drugs`, `diseases`, `audit_logs`, `prescriptions`
- Funciones (Stored Procedures): `sp_insert_audit_log`, `sp_get_audit_history`, `sp_get_dashboard_kpis`, `sp_save_prescription`, `sp_get_prescriptions`, `sp_get_prescription_stats`
- Triggers: `on_auth_user_created` (perfil automático), `prescription_audit_trigger` (auditoría automática)
- Vista: `v_prescription_summary`
- Índices de rendimiento en todas las tablas críticas
- Row Level Security (RLS) en todas las tablas

---

## 3. Configurar Variables de Entorno del Frontend

En la raíz del proyecto, crea el archivo `.env`:

```bash
# Supabase (obtén estos valores en: Supabase → Settings → API)
VITE_SUPABASE_URL=https://XXXXXXXXXXXXXXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Solo para desarrollo local (en producción la clave va en Supabase Secrets)
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
```

Los valores de Supabase están en: **Settings → API → Project URL** y **anon public key**.

---

## 4. Crear el Usuario Administrador

En Supabase → **Authentication → Users → Add user**:

- Email: `admin@udi.edu.bo`
- Password: (elige una contraseña segura)
- Auto Confirm User: **activado**

Después, en **SQL Editor**, asigna el rol de administrador:

```sql
UPDATE public.profiles
SET role = 'admin', name = 'Administrador UDI'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@udi.edu.bo'
);
```

---

## 5. Crear Cuentas de Estudiantes

Para cada estudiante, en **Authentication → Users → Add user**:
- Email: `nombre.apellido@udi.edu.bo`
- Auto Confirm User: **activado**

El trigger `on_auth_user_created` crea automáticamente el perfil con `role = 'student'`.

Para cambiar el nombre del estudiante:
```sql
UPDATE public.profiles
SET name = 'María García López'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'maria.garcia@udi.edu.bo'
);
```

---

## 6. Desplegar la Edge Function (Proxy Anthropic)

### Instalar Supabase CLI (una sola vez):
```bash
npm install -g supabase
```

### Login y vincular proyecto:
```bash
supabase login
supabase link --project-ref XXXXXXXXXXXXXXXX
```

### Agregar la API Key de Anthropic como secreto seguro:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Desplegar la función:
```bash
supabase functions deploy anthropic-proxy
```

La función queda disponible en:
`https://XXXXXXXXXXXXXXXX.supabase.co/functions/v1/anthropic-proxy`

---

## 7. Verificar que Todo Funciona

### Test de autenticación:
```bash
npm run dev
```
Abre `http://localhost:5173` e inicia sesión con el usuario admin.

### Test de Stored Procedures (en SQL Editor):
```sql
-- Test sp_get_dashboard_kpis
SELECT * FROM public.sp_get_dashboard_kpis(30);

-- Test sp_get_audit_history (reemplaza con un UUID real)
SELECT * FROM public.sp_get_audit_history(
  p_user_id := 'uuid-del-admin',
  p_admin_view := true,
  p_limit := 10
);

-- Test índices (para demostrar rendimiento ante el tribunal)
EXPLAIN ANALYZE
SELECT * FROM public.audit_logs
WHERE event_type = 'DRUG_SEARCH'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 8. Arquitectura del Backend (Para Presentar al Tribunal)

```
Browser (React SPA)
  │
  ├─── HTTPS ──► Supabase Auth (JWT)
  │                └── Token válido → acceso permitido
  │
  ├─── HTTPS ──► Supabase Edge Function: /anthropic-proxy
  │                ├── Verifica JWT del usuario
  │                ├── Rate limiting: 10 req/min por usuario
  │                └── Llama a Anthropic con la API Key (nunca sale al cliente)
  │
  └─── HTTPS ──► Supabase Database (PostgreSQL)
                  ├── RLS: cada usuario solo ve sus datos
                  ├── sp_insert_audit_log()    ← Stored Procedure 1
                  ├── sp_get_audit_history()   ← Stored Procedure 2
                  ├── sp_get_dashboard_kpis()  ← Stored Procedure 3
                  ├── sp_save_prescription()   ← Stored Procedure 4
                  ├── sp_get_prescriptions()   ← Stored Procedure 5
                  ├── sp_get_prescription_stats() ← Stored Procedure 6
                  └── Triggers automáticos de auditoría
```

---

## 9. Checklist Final (DoD Tier 1)

- [x] Backend real operativo (Supabase Edge Function como API REST)
- [x] Base de datos PostgreSQL con esquema completo
- [x] 6 Stored Procedures implementados y ejecutándose
- [x] Autenticación JWT (Supabase Auth)
- [x] API Key de Anthropic en el servidor (nunca en el cliente)
- [x] Audit log escribe en PostgreSQL (fuente primaria)
- [x] Índices de rendimiento demostrables con EXPLAIN ANALYZE
- [x] RLS (Row Level Security) en todas las tablas
- [x] Triggers automáticos de auditoría para recetas
- [x] Validación de inputs en Stored Procedures (errores tipados)
- [x] Rate limiting en Edge Function (10 req/min)
