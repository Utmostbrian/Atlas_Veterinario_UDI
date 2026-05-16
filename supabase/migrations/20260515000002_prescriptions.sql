-- ============================================================
-- Atlas Farmacológico Veterinario — Migración 002
-- Stored Procedures y Triggers para Recetas Médico-Veterinarias
-- ============================================================

-- ============================================================
-- SP 1: sp_save_prescription
-- Guarda o actualiza una receta. Idempotente: usa UPSERT.
-- Retorna el UUID de la receta guardada.
-- ============================================================
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
  p_prescription_id UUID   DEFAULT NULL   -- Si se pasa, actualiza; si no, inserta
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Validaciones de negocio
  IF p_patient_species IS NULL OR p_patient_species = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: La especie del paciente es obligatoria.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_vet_license IS NULL OR p_vet_license = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: El número de registro profesional es obligatorio.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_vet_name IS NULL OR p_vet_name = '' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: El nombre del veterinario es obligatorio.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_drugs = '[]'::JSONB OR jsonb_array_length(p_drugs) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: La receta debe incluir al menos un medicamento.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Insertar o actualizar
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
      vet_license     = p_vet_license
    WHERE id = p_prescription_id AND user_id = p_user_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Receta no encontrada o no tienes permiso para editarla.'
        USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.prescriptions (
      user_id, patient_name, patient_species, patient_breed,
      patient_weight, patient_age, owner_name, owner_phone,
      diagnosis, drugs, vet_name, vet_license
    )
    VALUES (
      p_user_id, p_patient_name, p_patient_species, p_patient_breed,
      p_patient_weight, p_patient_age, p_owner_name, p_owner_phone,
      p_diagnosis, p_drugs, p_vet_name, p_vet_license
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- Re-lanzar errores de validación tal cual; encapsular el resto
  IF SQLSTATE = 'P0001' OR SQLSTATE = 'P0002' THEN RAISE; END IF;
  RAISE EXCEPTION 'DB_ERROR: Error al guardar la receta: %', SQLERRM
    USING ERRCODE = 'P0003';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SP 2: sp_get_prescriptions
-- Historial paginado de recetas. Admin ve todas; users ven las suyas.
-- Equivalente al sp_GetAuditHistory pero para recetas (DoD 2.3 SP 2).
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_get_prescriptions(
  p_user_id    UUID,
  p_admin_view BOOLEAN DEFAULT FALSE,
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
) AS $$
BEGIN
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
    (p_admin_view OR p.user_id = p_user_id)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SP 3: sp_get_prescription_by_id
-- Obtiene una receta específica con verificación de pertenencia.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_get_prescription_by_id(
  p_id      UUID,
  p_user_id UUID,
  p_is_admin BOOLEAN DEFAULT FALSE
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
  created_at      TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.user_id, p.patient_name, p.patient_species, p.patient_breed,
    p.patient_weight, p.patient_age, p.owner_name, p.owner_phone,
    p.diagnosis, p.drugs, p.vet_name, p.vet_license, p.created_at
  FROM public.prescriptions p
  WHERE p.id = p_id
    AND (p_is_admin OR p.user_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SP 4: sp_get_prescription_stats (para el Dashboard de Admin)
-- KPIs de recetas — complementa sp_get_dashboard_kpis
-- ============================================================
CREATE OR REPLACE FUNCTION public.sp_get_prescription_stats(
  p_days INT DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  v_from         TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_total        BIGINT;
  v_today        BIGINT;
  v_by_species   JSONB;
  v_top_vets     JSONB;
  v_top_drugs    JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.prescriptions WHERE created_at >= v_from;
  SELECT COUNT(*) INTO v_today FROM public.prescriptions WHERE created_at >= NOW()::DATE;

  -- Distribución por especie
  SELECT jsonb_object_agg(patient_species, total)
  INTO v_by_species
  FROM (
    SELECT patient_species, COUNT(*) AS total
    FROM public.prescriptions WHERE created_at >= v_from
    GROUP BY patient_species ORDER BY total DESC
  ) t;

  -- Top veterinarios por volumen de recetas
  SELECT jsonb_agg(row_to_json(t))
  INTO v_top_vets
  FROM (
    SELECT vet_name, vet_license, COUNT(*) AS total_prescriptions
    FROM public.prescriptions WHERE created_at >= v_from
    GROUP BY vet_name, vet_license
    ORDER BY total_prescriptions DESC
    LIMIT 5
  ) t;

  -- Top medicamentos prescritos (desnormalizando JSONB)
  SELECT jsonb_agg(row_to_json(t))
  INTO v_top_drugs
  FROM (
    SELECT drug->>'name' AS drug_name, COUNT(*) AS total_uses
    FROM public.prescriptions p,
         jsonb_array_elements(p.drugs) AS drug
    WHERE p.created_at >= v_from
      AND drug->>'name' IS NOT NULL
      AND drug->>'name' != ''
    GROUP BY drug_name
    ORDER BY total_uses DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'period_days',  p_days,
    'total',        v_total,
    'today',        v_today,
    'by_species',   COALESCE(v_by_species, '{}'),
    'top_vets',     COALESCE(v_top_vets,   '[]'),
    'top_drugs',    COALESCE(v_top_drugs,  '[]')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- TRIGGER: Auditoría automática al guardar una receta
-- Cuando se inserta una receta, crea automáticamente un audit_log.
-- El logging es completamente transparente — no requiere código en el cliente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_log_prescription_audit()
RETURNS TRIGGER AS $$
DECLARE
  v_drug_names TEXT;
  v_event_id   TEXT;
BEGIN
  -- Extraer nombres de medicamentos del JSONB
  SELECT string_agg(drug->>'name', ', ')
  INTO v_drug_names
  FROM jsonb_array_elements(NEW.drugs) AS drug
  WHERE drug->>'name' IS NOT NULL AND drug->>'name' != '';

  v_event_id := 'PRESCRIPTION-' || NEW.id::TEXT;

  -- Insertar en audit_log (idempotente — usa sp_insert_audit_log)
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
      'prescription_id',  NEW.id,
      'vet_license',      NEW.vet_license,
      'drugs_count',      jsonb_array_length(NEW.drugs),
      'owner_name',       NEW.owner_name
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger anterior si existe (para evitar duplicados)
DROP TRIGGER IF EXISTS prescription_audit_trigger ON public.prescriptions;

-- Crear trigger de auditoría
CREATE TRIGGER prescription_audit_trigger
  AFTER INSERT ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_log_prescription_audit();

-- ============================================================
-- ÍNDICE adicional: búsqueda de recetas por propietario y diagnóstico
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_prescriptions_owner
  ON public.prescriptions (owner_name);

CREATE INDEX IF NOT EXISTS idx_prescriptions_species
  ON public.prescriptions (patient_species);

CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at
  ON public.prescriptions (created_at DESC);

-- Índice GIN para búsqueda dentro del JSONB de medicamentos
CREATE INDEX IF NOT EXISTS idx_prescriptions_drugs_gin
  ON public.prescriptions USING GIN (drugs);

-- ============================================================
-- VISTA: v_prescription_summary (para reportes de administración)
-- Desnormaliza los medicamentos para facilitar queries de reporting
-- ============================================================
CREATE OR REPLACE VIEW public.v_prescription_summary AS
SELECT
  p.id,
  p.user_id,
  p.patient_name,
  p.patient_species,
  p.patient_weight,
  p.owner_name,
  p.diagnosis,
  p.vet_name,
  p.vet_license,
  p.created_at,
  drug->>'name'     AS drug_name,
  drug->>'dose'     AS drug_dose,
  drug->>'route'    AS drug_route,
  drug->>'freq'     AS drug_freq,
  drug->>'duration' AS drug_duration
FROM
  public.prescriptions p,
  jsonb_array_elements(p.drugs) AS drug
WHERE
  drug->>'name' IS NOT NULL AND drug->>'name' != '';

COMMENT ON VIEW public.v_prescription_summary IS
  'Vista desnormalizada de recetas y sus medicamentos. Para reportes SQL directos.';
