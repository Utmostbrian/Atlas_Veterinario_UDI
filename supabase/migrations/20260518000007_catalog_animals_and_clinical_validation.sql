-- ============================================================
-- Atlas Vet — Catálogo de animales + validación clínica cruzada
--
-- Objetivo: resolver el problema semántico de las especies
-- (Vaca→Bovino, Oveja→Ovino, Yegua→Equino, etc.) sin gastar
-- créditos de IA, y agregar validaciones cruzadas server-side
-- (peso por especie + override de dosis con audit trail).
--
-- standard_species DEBE coincidir con las claves de dosage_range
-- en src/data/drugsDatabase.js: Perro, Gato, Bovino, Equino,
-- Ovino, Porcino, Caprino, Ave. Si esto cambia, el cruce dosis
-- se rompe.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla catalog_animals
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_animals (
  id                  SERIAL       PRIMARY KEY,
  standard_species    TEXT         NOT NULL,
  common_name         TEXT         NOT NULL UNIQUE,
  weight_range_min    NUMERIC(8,2) NOT NULL,
  weight_range_max    NUMERIC(8,2) NOT NULL,
  display_order       INT          NOT NULL DEFAULT 100,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_animal_weight_range
    CHECK (weight_range_min > 0 AND weight_range_max >= weight_range_min),
  CONSTRAINT chk_animal_std_species
    CHECK (standard_species IN ('Perro','Gato','Bovino','Equino','Ovino','Porcino','Caprino','Ave'))
);

COMMENT ON TABLE public.catalog_animals IS
  'Catálogo de animales y sinónimos comunes (Vaca→Bovino, etc.). Fuente única para autocompletado y validación de pesos.';

CREATE INDEX IF NOT EXISTS idx_catalog_animals_common_trgm
  ON public.catalog_animals USING GIN (common_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_animals_std_species
  ON public.catalog_animals (standard_species);

-- ------------------------------------------------------------
-- 2) Seed: alias comunes en español (idempotente vía ON CONFLICT)
--    Rangos de peso: extremo bajo (recién nacido / razas pequeñas)
--    al extremo alto (adulto grande). Permite Chihuahua 0.5 kg y
--    Mastín 100 kg en la misma categoría Perro.
-- ------------------------------------------------------------
INSERT INTO public.catalog_animals
  (standard_species, common_name, weight_range_min, weight_range_max, display_order)
VALUES
  -- Caninos
  ('Perro',    'Perro',         0.5,   100, 10),
  ('Perro',    'Perra',         0.5,   100, 11),
  ('Perro',    'Cachorro',      0.2,    20, 12),
  ('Perro',    'Canino',        0.5,   100, 13),
  -- Felinos
  ('Gato',     'Gato',          0.5,    12, 20),
  ('Gato',     'Gata',          0.5,    12, 21),
  ('Gato',     'Gatito',        0.1,     4, 22),
  ('Gato',     'Felino',        0.5,    12, 23),
  -- Bovinos
  ('Bovino',   'Vaca',           30,  1000, 30),
  ('Bovino',   'Toro',           50,  1500, 31),
  ('Bovino',   'Ternero',         5,   200, 32),
  ('Bovino',   'Becerro',         5,   200, 33),
  ('Bovino',   'Buey',          100,  1500, 34),
  ('Bovino',   'Vaquilla',       40,   500, 35),
  ('Bovino',   'Novillo',        80,   800, 36),
  ('Bovino',   'Bovino',         30,  1500, 37),
  -- Equinos
  ('Equino',   'Caballo',        80,  1200, 40),
  ('Equino',   'Yegua',          80,  1000, 41),
  ('Equino',   'Potro',          30,   400, 42),
  ('Equino',   'Potranca',       30,   400, 43),
  ('Equino',   'Equino',         30,  1200, 44),
  ('Equino',   'Mula',          150,   700, 45),
  ('Equino',   'Burro',          80,   400, 46),
  -- Ovinos
  ('Ovino',    'Oveja',           2,   120, 50),
  ('Ovino',    'Carnero',         5,   150, 51),
  ('Ovino',    'Cordero',         1,    40, 52),
  ('Ovino',    'Borrego',         5,   100, 53),
  ('Ovino',    'Ovino',           2,   150, 54),
  -- Caprinos
  ('Caprino',  'Cabra',           2,   100, 60),
  ('Caprino',  'Chivo',           2,   100, 61),
  ('Caprino',  'Cabrito',         1,    30, 62),
  ('Caprino',  'Macho cabrío',    5,   130, 63),
  ('Caprino',  'Caprino',         2,   130, 64),
  -- Porcinos
  ('Porcino',  'Cerdo',           5,   400, 70),
  ('Porcino',  'Cerda',           5,   350, 71),
  ('Porcino',  'Puerco',          5,   400, 72),
  ('Porcino',  'Cochino',         5,   400, 73),
  ('Porcino',  'Marrano',         5,   400, 74),
  ('Porcino',  'Lechón',          0.5,  20, 75),
  ('Porcino',  'Porcino',         1,   400, 76),
  -- Aves
  ('Ave',      'Gallina',         0.5,   5, 80),
  ('Ave',      'Gallo',           0.5,   6, 81),
  ('Ave',      'Pollo',           0.05,  4, 82),
  ('Ave',      'Pato',            0.5,   6, 83),
  ('Ave',      'Pavo',            0.5,  20, 84),
  ('Ave',      'Codorniz',        0.05, 0.5, 85),
  ('Ave',      'Ave',             0.01, 30, 86)
ON CONFLICT (common_name) DO UPDATE SET
  standard_species  = EXCLUDED.standard_species,
  weight_range_min  = EXCLUDED.weight_range_min,
  weight_range_max  = EXCLUDED.weight_range_max,
  display_order     = EXCLUDED.display_order,
  is_active         = TRUE;

-- ------------------------------------------------------------
-- 3) RLS: lectura para autenticados; escritura solo admin
-- ------------------------------------------------------------
ALTER TABLE public.catalog_animals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_animals_select_authenticated" ON public.catalog_animals;
CREATE POLICY "catalog_animals_select_authenticated"
  ON public.catalog_animals FOR SELECT
  TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "catalog_animals_write_admin" ON public.catalog_animals;
CREATE POLICY "catalog_animals_write_admin"
  ON public.catalog_animals FOR ALL
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ------------------------------------------------------------
-- 4) FK opcional en prescriptions (nullable: no rompe filas previas)
-- ------------------------------------------------------------
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS animal_catalog_id INT NULL
    REFERENCES public.catalog_animals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_animal_catalog
  ON public.prescriptions (animal_catalog_id)
  WHERE animal_catalog_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5) Extender CHECK de audit_logs.event_type para incluir el override
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_event_type_check
  CHECK (event_type IN (
    'DRUG_SEARCH','DOSE_CALCULATED','DOSE_VALIDATED',
    'AI_CONSULTATION','PRESCRIPTION_GEN','INTERACTION_CHECK',
    'PRESCRIPTION_DOSE_OVERRIDE'
  ));

-- ------------------------------------------------------------
-- 6) RPC sp_search_animals — autocompletado con pg_trgm
--    "vac" → Vaca, Vaquilla
--    "ovi" → Ovino, Oveja
--    "cabal" → Caballo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_search_animals(
  p_query TEXT DEFAULT '',
  p_limit INT  DEFAULT 8
)
RETURNS TABLE (
  id                INT,
  standard_species  TEXT,
  common_name       TEXT,
  weight_range_min  NUMERIC,
  weight_range_max  NUMERIC,
  similarity        REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.standard_species,
    a.common_name,
    a.weight_range_min,
    a.weight_range_max,
    similarity(a.common_name, COALESCE(p_query, ''))::REAL
  FROM public.catalog_animals a
  WHERE a.is_active
    AND (
      COALESCE(p_query, '') = ''
      OR a.common_name % p_query
      OR a.common_name ILIKE p_query || '%'
      OR a.standard_species ILIKE p_query || '%'
    )
  ORDER BY
    similarity(a.common_name, COALESCE(p_query, '')) DESC,
    a.display_order ASC,
    a.common_name ASC
  LIMIT GREATEST(1, LEAST(p_limit, 20));
$$;

GRANT EXECUTE ON FUNCTION public.sp_search_animals(TEXT, INT) TO authenticated;

-- ------------------------------------------------------------
-- 7) RPC sp_list_animals — carga inicial completa para cache cliente
--    Devuelve todas las filas activas. ~45 rows; trivial para el front.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_list_animals()
RETURNS TABLE (
  id                INT,
  standard_species  TEXT,
  common_name       TEXT,
  weight_range_min  NUMERIC,
  weight_range_max  NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id, a.standard_species, a.common_name,
    a.weight_range_min, a.weight_range_max
  FROM public.catalog_animals a
  WHERE a.is_active
  ORDER BY a.display_order ASC, a.common_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.sp_list_animals() TO authenticated;

-- ------------------------------------------------------------
-- 8) sp_save_prescription EXTENDIDO — valida especie contra
--    catálogo, peso contra rango y registra PRESCRIPTION_DOSE_OVERRIDE
--    cuando el cliente envía explícitamente un override de dosis.
--
--    La firma agrega p_animal_id (NULL = sin link). Si viene NULL
--    pero la especie está en el catálogo, se resuelve por nombre
--    (backward compat con clientes que no envíen el ID).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_save_prescription(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID, TEXT);

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
  p_actor_name     TEXT    DEFAULT NULL,
  p_animal_id      INT     DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id                UUID;
  v_catalog_row       public.catalog_animals%ROWTYPE;
  v_std_species       TEXT;
  v_drug              JSONB;
  v_drug_name         TEXT;
  v_dose_mgkg         NUMERIC;
  v_overrides         JSONB := '[]'::JSONB;
  v_override_event_id TEXT;
BEGIN
  -- Validaciones básicas existentes
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

  -- Validación cruzada: la especie debe estar en el catálogo.
  -- Si el cliente envía p_animal_id, validamos FK directa.
  -- Si no, resolvemos por common_name (case-insensitive).
  IF p_animal_id IS NOT NULL THEN
    SELECT * INTO v_catalog_row
    FROM public.catalog_animals
    WHERE id = p_animal_id AND is_active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Animal no reconocido en el catálogo.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT * INTO v_catalog_row
    FROM public.catalog_animals
    WHERE LOWER(common_name) = LOWER(p_patient_species) AND is_active
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: Especie "%" no reconocida en el sistema. Debe seleccionar una opción del catálogo.', p_patient_species USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_std_species := v_catalog_row.standard_species;

  -- Validación de peso contra el rango del catálogo
  IF p_patient_weight IS NOT NULL THEN
    IF p_patient_weight <= 0 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: El peso debe ser mayor a 0.' USING ERRCODE = 'P0001';
    END IF;
    IF p_patient_weight < v_catalog_row.weight_range_min
       OR p_patient_weight > v_catalog_row.weight_range_max THEN
      RAISE EXCEPTION
        'VALIDATION_ERROR: Peso % kg fuera de rango para % (% – % kg).',
        p_patient_weight, v_catalog_row.common_name,
        v_catalog_row.weight_range_min, v_catalog_row.weight_range_max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Recopilar overrides de dosis (sin bloquear).
  -- Convención cliente: cada drug puede traer "mg_per_kg" (NUMERIC) y
  -- "max_allowed_mgkg" (NUMERIC). Si mg_per_kg > max_allowed_mgkg, se
  -- registra como override. El cliente calcula el max desde
  -- drugsDatabase.js y lo envía explícitamente para que server-side
  -- no necesite mantener un duplicado del catálogo clínico.
  FOR v_drug IN SELECT jsonb_array_elements(p_drugs)
  LOOP
    v_drug_name := v_drug->>'name';
    v_dose_mgkg := NULLIF(v_drug->>'mg_per_kg','')::NUMERIC;

    IF v_drug_name IS NOT NULL
       AND v_dose_mgkg IS NOT NULL
       AND (v_drug ? 'max_allowed_mgkg')
       AND NULLIF(v_drug->>'max_allowed_mgkg','')::NUMERIC > 0
       AND v_dose_mgkg > NULLIF(v_drug->>'max_allowed_mgkg','')::NUMERIC THEN
      v_overrides := v_overrides || jsonb_build_object(
        'drug',             v_drug_name,
        'species',          v_std_species,
        'dose_mgkg',        v_dose_mgkg,
        'max_allowed_mgkg', NULLIF(v_drug->>'max_allowed_mgkg','')::NUMERIC,
        'ratio',            ROUND(v_dose_mgkg / NULLIF(v_drug->>'max_allowed_mgkg','')::NUMERIC, 2)
      );
    END IF;
  END LOOP;

  -- UPSERT
  IF p_prescription_id IS NOT NULL THEN
    UPDATE public.prescriptions
    SET
      patient_name      = p_patient_name,
      patient_species   = v_catalog_row.common_name,
      patient_breed     = p_patient_breed,
      patient_weight    = p_patient_weight,
      patient_age       = p_patient_age,
      owner_name        = p_owner_name,
      owner_phone       = p_owner_phone,
      diagnosis         = p_diagnosis,
      drugs             = p_drugs,
      vet_name          = p_vet_name,
      vet_license       = p_vet_license,
      actor_name        = COALESCE(p_actor_name, actor_name),
      animal_catalog_id = v_catalog_row.id
    WHERE id = p_prescription_id AND user_id = p_user_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Receta no encontrada o no tienes permiso para editarla.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.prescriptions (
      user_id, patient_name, patient_species, patient_breed,
      patient_weight, patient_age, owner_name, owner_phone,
      diagnosis, drugs, vet_name, vet_license, actor_name,
      animal_catalog_id
    )
    VALUES (
      p_user_id, p_patient_name, v_catalog_row.common_name, p_patient_breed,
      p_patient_weight, p_patient_age, p_owner_name, p_owner_phone,
      p_diagnosis, p_drugs, p_vet_name, p_vet_license, p_actor_name,
      v_catalog_row.id
    )
    RETURNING id INTO v_id;
  END IF;

  -- Si hubo overrides, registrar evento PRESCRIPTION_DOSE_OVERRIDE
  -- en audit_logs (idempotente vía event_id derivado del prescription_id).
  IF jsonb_array_length(v_overrides) > 0 THEN
    v_override_event_id := 'PRESCRIPTION_OVERRIDE-' || v_id::TEXT;

    PERFORM public.sp_insert_audit_log(
      p_event_id    := v_override_event_id,
      p_user_id     := p_user_id,
      p_event_type  := 'PRESCRIPTION_DOSE_OVERRIDE',
      p_drug_name   := (v_overrides->0->>'drug'),
      p_species     := v_std_species,
      p_weight_kg   := p_patient_weight,
      p_query_text  := p_diagnosis,
      p_summary     := format(
        '%s override(s) de dosis en receta para %s (%s)',
        jsonb_array_length(v_overrides),
        COALESCE(p_patient_name, 'paciente'),
        v_catalog_row.common_name
      ),
      p_metadata    := jsonb_build_object(
        'prescription_id', v_id,
        'overrides',       v_overrides
      ),
      p_actor_name  := p_actor_name
    );
  END IF;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'P0001' OR SQLSTATE = 'P0002' THEN RAISE; END IF;
  RAISE EXCEPTION 'DB_ERROR: Error al guardar la receta: %', SQLERRM USING ERRCODE = 'P0003';
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_save_prescription(
  UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT,
  JSONB, TEXT, TEXT, UUID, TEXT, INT
) TO authenticated;

COMMENT ON FUNCTION public.sp_save_prescription IS
  'Guarda receta con validación cruzada de especie/peso y registro de overrides de dosis. Última firma agrega p_animal_id (catalog FK).';
