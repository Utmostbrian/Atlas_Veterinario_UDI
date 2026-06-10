-- Fix historial de recetas:
-- 1) el frontend ya envia/lee patient_species_other, pero la migracion anterior
--    todavia no estaba aplicada en remoto;
-- 2) sp_get_prescriptions retornaba una columna llamada id y usaba "WHERE id ="
--    sin alias dentro de PL/pgSQL, provocando "column reference id is ambiguous".

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS patient_species_other TEXT NULL;

ALTER TABLE public.prescriptions
  DROP CONSTRAINT IF EXISTS chk_prescriptions_species_other;

ALTER TABLE public.prescriptions
  ADD CONSTRAINT chk_prescriptions_species_other
  CHECK (
    patient_species IS DISTINCT FROM 'Otros'
    OR NULLIF(BTRIM(patient_species_other), '') IS NOT NULL
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_species_other
  ON public.prescriptions (patient_species_other)
  WHERE patient_species_other IS NOT NULL;

DROP FUNCTION IF EXISTS public.sp_save_prescription(
  UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT,
  JSONB, TEXT, TEXT, UUID, TEXT, INT, TEXT
);

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
  p_vet_name       TEXT   DEFAULT NULL,
  p_vet_license    TEXT   DEFAULT NULL,
  p_prescription_id UUID   DEFAULT NULL,
  p_actor_name     TEXT   DEFAULT NULL,
  p_animal_id      INT    DEFAULT NULL,
  p_patient_species_other TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       UUID;
  v_drug     JSONB;
  v_num_re   TEXT := '^\d+(\.\d+)?$';
BEGIN
  IF p_patient_species = 'Otros'
     AND NULLIF(BTRIM(COALESCE(p_patient_species_other, '')), '') IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Debe especificar la especie cuando selecciona Otros.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_drugs = '[]'::JSONB OR jsonb_array_length(p_drugs) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: La receta debe incluir al menos un medicamento.'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_drug IN SELECT jsonb_array_elements(p_drugs)
  LOOP
    IF NULLIF(BTRIM(COALESCE(v_drug->>'name', '')), '') IS NULL THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Cada medicamento debe tener nombre.'
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_drug->>'quantity', '') !~ v_num_re
       OR (v_drug->>'quantity')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: La cantidad debe ser numerica y positiva.'
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_drug->>'dose_value', '') !~ v_num_re
       OR (v_drug->>'dose_value')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: La dosis debe ser numerica y positiva.'
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_drug->>'frequency_hours', '') !~ v_num_re
       OR (v_drug->>'frequency_hours')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: La frecuencia debe ser numerica y positiva.'
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_drug->>'duration_days', '') !~ v_num_re
       OR (v_drug->>'duration_days')::NUMERIC <= 0 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: La duracion debe ser numerica y positiva.'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  v_id := public.sp_save_prescription(
    p_user_id,
    p_patient_name,
    p_patient_species,
    p_patient_breed,
    p_patient_weight,
    p_patient_age,
    p_owner_name,
    p_owner_phone,
    p_diagnosis,
    p_drugs,
    p_vet_name,
    p_vet_license,
    p_prescription_id,
    p_actor_name,
    p_animal_id
  );

  UPDATE public.prescriptions rx
  SET patient_species_other = CASE
    WHEN p_patient_species = 'Otros' THEN NULLIF(BTRIM(p_patient_species_other), '')
    ELSE NULL
  END
  WHERE rx.id = v_id AND rx.user_id = p_user_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_save_prescription(
  UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT,
  JSONB, TEXT, TEXT, UUID, TEXT, INT, TEXT
) TO authenticated;

DROP FUNCTION IF EXISTS public.sp_get_prescriptions(UUID, INT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.sp_get_prescriptions(UUID, BOOLEAN, INT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.sp_get_prescriptions(
  p_user_id    UUID,
  p_admin_view BOOLEAN DEFAULT FALSE,
  p_limit      INT     DEFAULT 20,
  p_offset     INT     DEFAULT 0,
  p_species    TEXT    DEFAULT NULL,
  p_search     TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id                    UUID,
  user_id               UUID,
  patient_name          TEXT,
  patient_species       TEXT,
  patient_species_other TEXT,
  patient_breed         TEXT,
  patient_weight        NUMERIC,
  patient_age           TEXT,
  owner_name            TEXT,
  owner_phone           TEXT,
  diagnosis             TEXT,
  drugs                 JSONB,
  vet_name              TEXT,
  vet_license           TEXT,
  actor_name            TEXT,
  created_at            TIMESTAMPTZ,
  total_count           BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      UUID    := auth.uid();
  v_is_admin    BOOLEAN := COALESCE(
    (SELECT prof.role = 'admin' FROM public.profiles prof WHERE prof.id = v_caller),
    FALSE
  );
  v_filter_user UUID;
  v_search      TEXT := NULLIF(BTRIM(p_search), '');
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  v_filter_user := CASE WHEN v_is_admin THEN NULL ELSE v_caller END;

  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 500 THEN p_limit := 20; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT
    rx.id,
    rx.user_id,
    rx.patient_name,
    rx.patient_species,
    rx.patient_species_other,
    rx.patient_breed,
    rx.patient_weight,
    rx.patient_age,
    rx.owner_name,
    rx.owner_phone,
    rx.diagnosis,
    rx.drugs,
    rx.vet_name,
    rx.vet_license,
    rx.actor_name,
    rx.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM public.prescriptions rx
  WHERE
    (v_filter_user IS NULL OR rx.user_id = v_filter_user)
    AND (p_species IS NULL OR rx.patient_species = p_species)
    AND (
      v_search IS NULL
      OR rx.patient_name ILIKE '%' || v_search || '%'
      OR rx.owner_name ILIKE '%' || v_search || '%'
      OR rx.diagnosis ILIKE '%' || v_search || '%'
      OR rx.actor_name ILIKE '%' || v_search || '%'
      OR rx.patient_species_other ILIKE '%' || v_search || '%'
    )
  ORDER BY rx.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_prescriptions(
  UUID, BOOLEAN, INT, INT, TEXT, TEXT
) TO authenticated;
