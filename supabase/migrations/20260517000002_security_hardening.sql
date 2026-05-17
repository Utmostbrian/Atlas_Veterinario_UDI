-- ============================================================
-- Atlas Vet — Security Hardening Migration
-- A-01: Reescritura de SPs para validación server-side del rol
-- A-04: Tracking de actor_name (estudiantes con cuenta compartida)
-- A-07: Logging de fallas de auditoría en vez de silenciarlas
-- ============================================================

-- ------------------------------------------------------------
-- A-04: columna para identificar al actor real cuando la cuenta
-- es compartida (estudiantes). Indexada para reportes.
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_name TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_actor_name
  ON public.audit_logs (actor_name)
  WHERE actor_name IS NOT NULL;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS actor_name TEXT NULL;

-- ------------------------------------------------------------
-- A-07: tabla para registrar fallas de auditoría
-- (antes se silenciaban con EXCEPTION WHEN OTHERS THEN NULL)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_failures (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    TEXT        NULL,
  user_id     UUID        NULL,
  event_type  TEXT        NULL,
  error_msg   TEXT        NOT NULL,
  sqlstate    TEXT        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_failures_admin_select" ON public.audit_failures;
CREATE POLICY "audit_failures_admin_select"
  ON public.audit_failures FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ------------------------------------------------------------
-- A-07: sp_insert_audit_log re-emitido con p_actor_name y
-- logging de errores en lugar de retornar NULL silencioso.
-- ------------------------------------------------------------
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
  p_metadata        JSONB   DEFAULT '{}',
  p_actor_name      TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    event_id, user_id, event_type, drug_name, species,
    weight_kg, dose_calculated, vol_ml, query_text,
    summary, ip_address, metadata, actor_name
  )
  VALUES (
    p_event_id, p_user_id, p_event_type, p_drug_name, p_species,
    p_weight_kg, p_dose_calculated, p_vol_ml, p_query_text,
    p_summary, p_ip_address, p_metadata, p_actor_name
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- A-07: registrar la falla, no la enterramos en silencio
  BEGIN
    INSERT INTO public.audit_failures (event_id, user_id, event_type, error_msg, sqlstate)
    VALUES (p_event_id, p_user_id, p_event_type, SQLERRM, SQLSTATE);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_failures insert failed: % (orig: %)', SQLERRM, p_event_id;
  END;
  RAISE WARNING 'sp_insert_audit_log error for event %: % (%)', p_event_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------
-- A-01: sp_get_audit_history valida el rol server-side.
-- El parámetro p_admin_view es ignorado (queda por compatibilidad)
-- y reemplazado por una consulta al perfil del caller.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_audit_history(
  p_user_id    UUID    DEFAULT NULL,
  p_limit      INT     DEFAULT 50,
  p_offset     INT     DEFAULT 0,
  p_event_type TEXT    DEFAULT NULL,
  p_search     TEXT    DEFAULT NULL,
  p_admin_view BOOLEAN DEFAULT FALSE  -- ignorado intencionalmente
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
  actor_name      TEXT,
  created_at      TIMESTAMPTZ,
  total_count     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID    := auth.uid();
  v_is_admin BOOLEAN := COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = v_caller),
    FALSE
  );
  v_filter_user UUID;
BEGIN
  -- Solo el admin ve eventos de otros; cualquier otro caso se restringe al propio user
  v_filter_user := CASE WHEN v_is_admin THEN NULL ELSE v_caller END;

  -- Bound defensivo: nunca dejar limit fuera de control
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 1000 THEN p_limit := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

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
    al.actor_name,
    al.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM public.audit_logs al
  WHERE
    (v_filter_user IS NULL OR al.user_id = v_filter_user)
    AND (p_event_type IS NULL OR al.event_type = p_event_type)
    AND (
      p_search IS NULL
      OR al.drug_name  ILIKE '%' || p_search || '%'
      OR al.query_text ILIKE '%' || p_search || '%'
      OR al.species    ILIKE '%' || p_search || '%'
      OR al.actor_name ILIKE '%' || p_search || '%'
    )
  ORDER BY al.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ------------------------------------------------------------
-- A-01: sp_get_prescriptions con el mismo patrón
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_prescriptions(
  p_user_id    UUID,
  p_admin_view BOOLEAN DEFAULT FALSE,  -- ignorado, derivado del rol del caller
  p_limit      INT     DEFAULT 20,
  p_offset     INT     DEFAULT 0,
  p_species    TEXT    DEFAULT NULL,
  p_search     TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  user_id         UUID,
  patient_name    TEXT,
  patient_species TEXT,
  patient_breed   TEXT,
  patient_weight  NUMERIC,
  patient_age     TEXT,
  owner_name      TEXT,
  owner_phone     TEXT,
  diagnosis       TEXT,
  drugs           JSONB,
  vet_name        TEXT,
  vet_license     TEXT,
  created_at      TIMESTAMPTZ,
  total_count     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   UUID    := auth.uid();
  v_is_admin BOOLEAN := COALESCE(
    (SELECT role = 'admin' FROM public.profiles WHERE id = v_caller),
    FALSE
  );
  v_filter_user UUID;
BEGIN
  v_filter_user := CASE WHEN v_is_admin THEN NULL ELSE v_caller END;

  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 500 THEN p_limit := 20; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    p.patient_name,
    p.patient_species,
    p.patient_breed,
    p.patient_weight,
    p.patient_age,
    p.owner_name,
    p.owner_phone,
    p.diagnosis,
    p.drugs,
    p.vet_name,
    p.vet_license,
    p.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM public.prescriptions p
  WHERE
    (v_filter_user IS NULL OR p.user_id = v_filter_user)
    AND (p_species IS NULL OR p.patient_species = p_species)
    AND (
      p_search IS NULL
      OR p.patient_name ILIKE '%' || p_search || '%'
      OR p.owner_name   ILIKE '%' || p_search || '%'
      OR p.diagnosis    ILIKE '%' || p_search || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ------------------------------------------------------------
-- A-04: sp_save_prescription acepta actor_name
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_save_prescription(
  p_user_id        UUID,
  p_patient_name   TEXT,
  p_patient_species TEXT,
  p_patient_breed  TEXT    DEFAULT NULL,
  p_patient_weight NUMERIC DEFAULT NULL,
  p_patient_age    TEXT    DEFAULT NULL,
  p_owner_name     TEXT    DEFAULT NULL,
  p_owner_phone    TEXT    DEFAULT NULL,
  p_diagnosis      TEXT    DEFAULT NULL,
  p_drugs          JSONB   DEFAULT '[]',
  p_vet_name       TEXT    DEFAULT NULL,
  p_vet_license    TEXT    DEFAULT NULL,
  p_prescription_id UUID   DEFAULT NULL,
  p_actor_name     TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_patient_species IS NULL OR p_patient_species = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: La especie del paciente es obligatoria.' USING ERRCODE = 'P0001';
  END IF;
  IF p_vet_license IS NULL OR p_vet_license = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: El número de registro profesional es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  IF p_vet_name IS NULL OR p_vet_name = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: El nombre del veterinario es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  IF p_drugs = '[]'::JSONB OR jsonb_array_length(p_drugs) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: La receta debe incluir al menos un medicamento.' USING ERRCODE = 'P0001';
  END IF;

  IF p_prescription_id IS NOT NULL THEN
    UPDATE public.prescriptions
    SET
      patient_name    = p_patient_name,
      patient_species = p_patient_species,
      patient_breed   = p_patient_breed,
      patient_weight  = p_patient_weight,
      patient_age     = p_patient_age,
      owner_name      = p_owner_name,
      owner_phone     = p_owner_phone,
      diagnosis       = p_diagnosis,
      drugs           = p_drugs,
      vet_name        = p_vet_name,
      vet_license     = p_vet_license,
      actor_name      = COALESCE(p_actor_name, actor_name)
    WHERE id = p_prescription_id AND user_id = p_user_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Receta no encontrada o no tienes permiso para editarla.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.prescriptions (
      user_id, patient_name, patient_species, patient_breed,
      patient_weight, patient_age, owner_name, owner_phone,
      diagnosis, drugs, vet_name, vet_license, actor_name
    )
    VALUES (
      p_user_id, p_patient_name, p_patient_species, p_patient_breed,
      p_patient_weight, p_patient_age, p_owner_name, p_owner_phone,
      p_diagnosis, p_drugs, p_vet_name, p_vet_license, p_actor_name
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0001' OR SQLSTATE = 'P0002' THEN RAISE; END IF;
  RAISE EXCEPTION 'DB_ERROR: Error al guardar la receta: %', SQLERRM USING ERRCODE = 'P0003';
END;
$$;

-- ------------------------------------------------------------
-- A-04: trigger de auditoría propaga actor_name desde la receta
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_log_prescription_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drug_names TEXT;
  v_event_id   TEXT;
BEGIN
  SELECT string_agg(drug->>'name', ', ')
  INTO v_drug_names
  FROM jsonb_array_elements(NEW.drugs) AS drug
  WHERE drug->>'name' IS NOT NULL AND drug->>'name' != '';

  v_event_id := 'PRESCRIPTION-' || NEW.id::TEXT;

  PERFORM public.sp_insert_audit_log(
    p_event_id    := v_event_id,
    p_user_id     := NEW.user_id,
    p_event_type  := 'PRESCRIPTION_GEN',
    p_drug_name   := v_drug_names,
    p_species     := NEW.patient_species,
    p_weight_kg   := NEW.patient_weight,
    p_query_text  := NEW.diagnosis,
    p_summary     := 'Receta para ' || COALESCE(NEW.patient_name, 'paciente sin nombre') || ' — Vet: ' || COALESCE(NEW.vet_name, 'sin nombre'),
    p_metadata    := jsonb_build_object(
      'prescription_id', NEW.id,
      'vet_license',     NEW.vet_license,
      'drugs_count',     jsonb_array_length(NEW.drugs),
      'owner_name',      NEW.owner_name
    ),
    p_actor_name  := NEW.actor_name
  );

  RETURN NEW;
END;
$$;
