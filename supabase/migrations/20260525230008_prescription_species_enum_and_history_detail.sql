-- ============================================================
-- Atlas Vet - Recetas: especies controladas + detalle de "Otros"
--
-- Mantiene compatibilidad con el SP existente agregando un overload
-- de sp_save_prescription con p_patient_species_other al final.
-- ============================================================

-- 1) Catalogo de especies principales usado por el select del front.
ALTER TABLE public.catalog_animals
  DROP CONSTRAINT IF EXISTS chk_animal_std_species;

ALTER TABLE public.catalog_animals
  ADD CONSTRAINT chk_animal_std_species
  CHECK (standard_species IN (
    'Perro','Gato','Bovino','Equino','Ovino','Porcino','Caprino','Ave',
    'Reptil/Anfibio','Otros'
  ));

INSERT INTO public.catalog_animals
  (standard_species, common_name, weight_range_min, weight_range_max, display_order)
VALUES
  ('Perro',           'Canino',          0.10,  100,  5),
  ('Gato',            'Felino',          0.10,   20, 15),
  ('Equino',          'Equino',          0.10, 1000, 40),
  ('Bovino',          'Bovino',          0.10, 1000, 50),
  ('Ave',             'Ave',             0.10,   50, 60),
  ('Reptil/Anfibio',  'Reptil/Anfibio',  0.10,  300, 70),
  ('Otros',           'Otros',           0.10, 1000, 80)
ON CONFLICT (common_name) DO UPDATE SET
  standard_species  = EXCLUDED.standard_species,
  weight_range_min  = EXCLUDED.weight_range_min,
  weight_range_max  = EXCLUDED.weight_range_max,
  display_order     = EXCLUDED.display_order,
  is_active         = TRUE;

-- 2) Persistencia del detalle cuando la especie normalizada sea "Otros".
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

-- 3) Overload del guardado: valida medicamentos estrictamente y guarda
--    patient_species_other sin duplicar toda la logica clinica existente.
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
  p_vet_name       TEXT    DEFAULT NULL,
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

  UPDATE public.prescriptions
  SET patient_species_other = CASE
    WHEN p_patient_species = 'Otros' THEN NULLIF(BTRIM(p_patient_species_other), '')
    ELSE NULL
  END
  WHERE id = v_id AND user_id = p_user_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_save_prescription(
  UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT,
  JSONB, TEXT, TEXT, UUID, TEXT, INT, TEXT
) TO authenticated;

-- 4) Historial: expone patient_species_other para "Ver detalle" y PDF.
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
    p.patient_species_other,
    p.patient_breed,
    p.patient_weight,
    p.patient_age,
    p.owner_name,
    p.owner_phone,
    p.diagnosis,
    p.drugs,
    p.vet_name,
    p.vet_license,
    p.actor_name,
    p.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM public.prescriptions p
  WHERE
    (v_filter_user IS NULL OR p.user_id = v_filter_user)
    AND (p_species IS NULL OR p.patient_species = p_species)
    AND (
      p_search IS NULL
      OR p.patient_name ILIKE '%' || p_search || '%'
      OR p.owner_name ILIKE '%' || p_search || '%'
      OR p.diagnosis ILIKE '%' || p_search || '%'
      OR p.actor_name ILIKE '%' || p_search || '%'
      OR p.patient_species_other ILIKE '%' || p_search || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_prescriptions(
  UUID, BOOLEAN, INT, INT, TEXT, TEXT
) TO authenticated;
