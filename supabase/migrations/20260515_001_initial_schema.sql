-- ============================================================
-- Atlas Farmacológico Veterinario — UDI
-- Esquema inicial de base de datos (PostgreSQL / Supabase)
-- Equivalente a los Stored Procedures del Reporte DoD
-- ============================================================

-- ============================================================
-- TABLA: Perfiles de usuario (extiende auth.users de Supabase)
-- Equivalente a: CREATE TABLE users (DoD Punto 2.2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'student'
                            CHECK (role IN ('admin', 'veterinarian', 'student')),
  license_number TEXT       NULL,          -- Número de matrícula / colegiado
  institution   TEXT        NOT NULL DEFAULT 'UDI',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfiles de usuario del sistema Atlas Vet. Rol: admin | veterinarian | student';

-- ============================================================
-- TABLA: Catálogo de fármacos
-- Equivalente a: CREATE TABLE drugs + drug_dosage_ranges (DoD 2.2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.drugs (
  id                      SERIAL      PRIMARY KEY,
  name                    TEXT        NOT NULL UNIQUE,
  latin_name              TEXT        NULL,
  category                TEXT        NOT NULL,   -- AB, AP, AI, AN, AF, HO
  description             TEXT        NULL,
  warnings                TEXT        NULL,
  interactions            TEXT        NULL,
  dose_unit               TEXT        NOT NULL DEFAULT 'mg/kg',
  dosage_range            JSONB       NULL,        -- { "Perro": {min, max}, ... }
  species                 TEXT[]      NULL,
  allowed_routes          TEXT[]      NULL,
  standard_concentrations NUMERIC[]   NULL,
  note                    TEXT        NULL,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.drugs IS 'Catálogo de fármacos veterinarios con rangos de dosis por especie';
COMMENT ON COLUMN public.drugs.dosage_range IS 'JSONB: {"Perro": {"min": 5, "max": 20}, "Gato": {...}}';

-- ============================================================
-- TABLA: Protocolos de enfermedades
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diseases (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL,
  species     TEXT[]      NULL,
  color       TEXT        NULL,
  description TEXT        NULL,
  drug_names  TEXT[]      NULL,
  protocol    TEXT        NULL,
  severity    TEXT        NULL CHECK (severity IN ('Baja', 'Media', 'Alta', 'Muy Alta')),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: Audit Log centralizado — FUENTE DE VERDAD EN EL SERVIDOR
-- Equivalente a: CREATE TABLE audit_log (DoD 2.2)
-- Con campo event_id para IDEMPOTENCIA (como en sp_InsertAuditLog DoD 2.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT        UNIQUE NOT NULL,    -- Idempotencia: previene duplicados
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      TEXT        NOT NULL
                              CHECK (event_type IN (
                                'DRUG_SEARCH', 'DOSE_CALCULATED', 'DOSE_VALIDATED',
                                'AI_CONSULTATION', 'PRESCRIPTION_GEN', 'INTERACTION_CHECK'
                              )),
  drug_name       TEXT        NULL,
  species         TEXT        NULL,
  weight_kg       NUMERIC(8,2) NULL,
  dose_calculated TEXT        NULL,
  vol_ml          TEXT        NULL,
  route           TEXT        NULL,
  query_text      TEXT        NULL,
  summary         TEXT        NULL,
  ip_address      TEXT        NULL,               -- Registrado en Edge Function
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_logs IS 'Audit trail centralizado en servidor. Idempotente por event_id. Nunca modificable por el cliente.';

-- ============================================================
-- TABLA: Recetas / Prescripciones
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_name     TEXT        NULL,
  patient_species  TEXT        NULL,
  patient_breed    TEXT        NULL,
  patient_weight   NUMERIC(8,2) NULL,
  patient_age      TEXT        NULL,
  owner_name       TEXT        NULL,
  owner_phone      TEXT        NULL,
  diagnosis        TEXT        NULL,
  drugs            JSONB       NOT NULL DEFAULT '[]',
  vet_name         TEXT        NULL,
  vet_license      TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES DE RENDIMIENTO (DoD 2.2 — demostrable con EXPLAIN ANALYZE)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_created_at   ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type   ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_drug_name    ON public.audit_logs (drug_name);
CREATE INDEX IF NOT EXISTS idx_audit_user_id      ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_user ON public.prescriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_drugs_name         ON public.drugs (name);
CREATE INDEX IF NOT EXISTS idx_drugs_category     ON public.drugs (category);

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER drugs_updated_at
  BEFORE UPDATE ON public.drugs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-crear perfil al registrar usuario (Supabase Auth)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, institution)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'institution', 'UDI')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCIÓN: Obtener rol del usuario (usada en RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID DEFAULT auth.uid())
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- FUNCIÓN: sp_InsertAuditLog (DoD 2.3 — SP 1)
-- IDEMPOTENTE: Previene duplicados por reintentos del cliente
-- El campo ip_address es calculado por el servidor (Edge Function)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_insert_audit_log(
  p_event_id        TEXT,
  p_user_id         UUID,
  p_event_type      TEXT,
  p_drug_name       TEXT    DEFAULT NULL,
  p_species         TEXT    DEFAULT NULL,
  p_weight_kg       NUMERIC DEFAULT NULL,
  p_dose_calculated TEXT    DEFAULT NULL,
  p_vol_ml          TEXT    DEFAULT NULL,
  p_query_text      TEXT    DEFAULT NULL,
  p_summary         TEXT    DEFAULT NULL,
  p_ip_address      TEXT    DEFAULT NULL,
  p_metadata        JSONB   DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Idempotencia: si el event_id ya existe, retorna su ID sin error
  INSERT INTO public.audit_logs (
    event_id, user_id, event_type, drug_name, species,
    weight_kg, dose_calculated, vol_ml, query_text,
    summary, ip_address, metadata
  )
  VALUES (
    p_event_id, p_user_id, p_event_type, p_drug_name, p_species,
    p_weight_kg, p_dose_calculated, p_vol_ml, p_query_text,
    p_summary, p_ip_address, p_metadata
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- Fallo silencioso: el audit nunca interrumpe la operación principal
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: sp_GetAuditHistory (DoD 2.3 — SP 2)
-- Paginación con total sin query extra (equivalente a COUNT(*) OVER())
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_get_audit_history(
  p_user_id    UUID    DEFAULT NULL,
  p_limit      INT     DEFAULT 50,
  p_offset     INT     DEFAULT 0,
  p_event_type TEXT    DEFAULT NULL,
  p_search     TEXT    DEFAULT NULL,
  p_admin_view BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id              UUID,
  event_id        TEXT,
  user_id         UUID,
  event_type      TEXT,
  drug_name       TEXT,
  species         TEXT,
  weight_kg       NUMERIC,
  dose_calculated TEXT,
  vol_ml          TEXT,
  route           TEXT,
  query_text      TEXT,
  summary         TEXT,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ,
  total_count     BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.event_id,
    al.user_id,
    al.event_type,
    al.drug_name,
    al.species,
    al.weight_kg,
    al.dose_calculated,
    al.vol_ml,
    al.route,
    al.query_text,
    al.summary,
    al.ip_address,
    al.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM public.audit_logs al
  WHERE
    (p_admin_view OR al.user_id = p_user_id)
    AND (p_event_type IS NULL OR al.event_type = p_event_type)
    AND (
      p_search IS NULL
      OR al.drug_name ILIKE '%' || p_search || '%'
      OR al.query_text ILIKE '%' || p_search || '%'
      OR al.species ILIKE '%' || p_search || '%'
    )
  ORDER BY al.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCIÓN: sp_GetDashboardKPIs (DoD 2.3 — SP 4)
-- Métricas para el panel de administración
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_get_dashboard_kpis(
  p_days INT DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  v_from        TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_total       BIGINT;
  v_today       BIGINT;
  v_by_type     JSONB;
  v_top_drugs   JSONB;
  v_by_hour     JSONB;
  v_by_species  JSONB;
BEGIN
  -- Total eventos en el período
  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs
  WHERE created_at >= v_from;

  -- Eventos de hoy
  SELECT COUNT(*) INTO v_today
  FROM public.audit_logs
  WHERE created_at >= NOW()::DATE;

  -- Distribución por tipo de evento
  SELECT jsonb_object_agg(event_type, total)
  INTO v_by_type
  FROM (
    SELECT event_type, COUNT(*) AS total
    FROM public.audit_logs
    WHERE created_at >= v_from
    GROUP BY event_type
  ) t;

  -- Top 10 fármacos más consultados (DoD KPI)
  SELECT jsonb_agg(row_to_json(t))
  INTO v_top_drugs
  FROM (
    SELECT drug_name, COUNT(*) AS total_searches
    FROM public.audit_logs
    WHERE event_type = 'DRUG_SEARCH'
      AND drug_name IS NOT NULL
      AND created_at >= v_from
    GROUP BY drug_name
    ORDER BY total_searches DESC
    LIMIT 10
  ) t;

  -- Actividad por hora del día (heatmap — DoD KPI)
  SELECT jsonb_agg(row_to_json(t) ORDER BY hour_of_day)
  INTO v_by_hour
  FROM (
    SELECT EXTRACT(HOUR FROM created_at)::INT AS hour_of_day,
           COUNT(*) AS events_count
    FROM public.audit_logs
    WHERE created_at >= v_from
    GROUP BY hour_of_day
    ORDER BY hour_of_day
  ) t;

  -- Distribución por especie
  SELECT jsonb_object_agg(species, total)
  INTO v_by_species
  FROM (
    SELECT species, COUNT(*) AS total
    FROM public.audit_logs
    WHERE species IS NOT NULL AND created_at >= v_from
    GROUP BY species
  ) t;

  RETURN jsonb_build_object(
    'period_days',  p_days,
    'total',        v_total,
    'today',        v_today,
    'by_type',      COALESCE(v_by_type, '{}'),
    'top_drugs',    COALESCE(v_top_drugs, '[]'),
    'by_hour',      COALESCE(v_by_hour, '[]'),
    'by_species',   COALESCE(v_by_species, '{}')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY — Defensa en profundidad
-- ============================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diseases     ENABLE ROW LEVEL SECURITY;

-- Profiles: cada usuario ve y edita solo el suyo; admin ve todos
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Audit logs: usuarios insertan solo los suyos; admin lee todos
CREATE POLICY "audit_insert_own"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "audit_select_own"
  ON public.audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "audit_select_admin"
  ON public.audit_logs FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Prescripciones: CRUD propio; admin lee todas
CREATE POLICY "prescriptions_own"
  ON public.prescriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prescriptions_select_admin"
  ON public.prescriptions FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Fármacos: lectura pública autenticada; escritura solo admin
CREATE POLICY "drugs_select_authenticated"
  ON public.drugs FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "drugs_write_admin"
  ON public.drugs FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Enfermedades: igual que fármacos
CREATE POLICY "diseases_select_authenticated"
  ON public.diseases FOR SELECT
  TO authenticated USING (TRUE);

CREATE POLICY "diseases_write_admin"
  ON public.diseases FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
