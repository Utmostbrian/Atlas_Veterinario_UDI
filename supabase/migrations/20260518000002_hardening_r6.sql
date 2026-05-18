-- ============================================================
-- Atlas Vet — Hardening Round 6
-- D2: trigger handle_new_user NUNCA acepta role del cliente
-- D3: snapshot de email en audit_logs para trazabilidad post-deleción
-- D4: actor_name visible en sp_get_prescriptions
-- D6: retención automática de audit_failures
-- D7: descomentar retención de audit_logs (180 días)
-- D8: pg_cron job para cleanup periódico (si la extensión está disponible)
-- D9: drop índice GIN sobre drugs que nadie usa
-- ============================================================

-- ------------------------------------------------------------
-- D2: handle_new_user fijo a 'student'. Antes leía role del
-- raw_user_meta_data, lo que permitía escalación con signup abierto.
-- Los admins se crean manualmente:
--   UPDATE public.profiles SET role = 'admin' WHERE id = '<uuid>';
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, institution)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'student',  -- D2: HARDCODED. No confiar en metadata del cliente.
    COALESCE(NEW.raw_user_meta_data->>'institution', 'UDI')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- D3: snapshot del email del usuario al momento de insertar el log.
-- Si después se borra la cuenta, el log conserva quién fue.
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_email_snapshot TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_email_snapshot
  ON public.audit_logs (user_email_snapshot)
  WHERE user_email_snapshot IS NOT NULL;

-- sp_insert_audit_log ahora resuelve el email y lo guarda.
-- Mantiene compat con la firma anterior (p_actor_name al final).
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
  v_id    UUID;
  v_email TEXT;
BEGIN
  -- D3: snapshot del email para trazabilidad post-deleción
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  INSERT INTO public.audit_logs (
    event_id, user_id, event_type, drug_name, species,
    weight_kg, dose_calculated, vol_ml, query_text,
    summary, ip_address, metadata, actor_name, user_email_snapshot
  )
  VALUES (
    p_event_id, p_user_id, p_event_type, p_drug_name, p_species,
    p_weight_kg, p_dose_calculated, p_vol_ml, p_query_text,
    p_summary, p_ip_address, p_metadata, p_actor_name, v_email
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
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
-- D4: sp_get_prescriptions ahora retorna actor_name.
-- DROP requerido por cambio de return type.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_get_prescriptions(UUID, INT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.sp_get_prescriptions(UUID, BOOLEAN, INT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.sp_get_prescriptions(
  p_user_id    UUID,
  p_admin_view BOOLEAN DEFAULT FALSE,  -- ignorado, derivado server-side
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
  actor_name      TEXT,  -- D4: expuesto al frontend
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
    p.id, p.user_id, p.patient_name, p.patient_species, p.patient_breed,
    p.patient_weight, p.patient_age, p.owner_name, p.owner_phone,
    p.diagnosis, p.drugs, p.vet_name, p.vet_license,
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
      OR p.owner_name   ILIKE '%' || p_search || '%'
      OR p.diagnosis    ILIKE '%' || p_search || '%'
      OR p.actor_name   ILIKE '%' || p_search || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ------------------------------------------------------------
-- D6 + D7: cleanup_old_data ampliado.
-- audit_failures se borran a los 30 días, audit_logs a los 180.
-- DROP previo porque cambia el return type (void → jsonb).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cleanup_old_data();

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_limits   BIGINT := 0;
  v_audit_logs    BIGINT := 0;
  v_audit_fails   BIGINT := 0;
BEGIN
  -- Rate limit windows > 2 h
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '2 hours';
  GET DIAGNOSTICS v_rate_limits = ROW_COUNT;

  -- D6: audit_failures > 30 días
  DELETE FROM public.audit_failures
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_audit_fails = ROW_COUNT;

  -- D7: audit_logs > 180 días (descomentado del Round 4)
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS v_audit_logs = ROW_COUNT;

  RETURN jsonb_build_object(
    'rate_limits_deleted',   v_rate_limits,
    'audit_logs_deleted',    v_audit_logs,
    'audit_failures_deleted', v_audit_fails,
    'ran_at',                NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_data TO service_role;

-- ------------------------------------------------------------
-- D8: pg_cron job — se ejecuta solo si la extensión está disponible
-- (Supabase Pro+ la trae; en Free hay que solicitarla).
-- DO block hace que no falle la migración si pg_cron no existe.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    -- Borra schedule previo si existe (idempotente)
    PERFORM cron.unschedule('atlas-vet-cleanup')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'atlas-vet-cleanup');
    -- Schedule: todos los días 3:00 AM UTC
    PERFORM cron.schedule(
      'atlas-vet-cleanup',
      '0 3 * * *',
      $cron$ SELECT public.cleanup_old_data() $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron no disponible — invoca cleanup_old_data() manualmente o vía Vercel Cron Job.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule no se pudo crear (%) — usa cleanup manual.', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- D9: drop índice GIN sobre prescriptions.drugs (JSONB) — nadie hace
-- queries con @> o ? sobre ese campo desde el frontend. Cuesta en
-- cada INSERT/UPDATE sin beneficio observable.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_prescriptions_drugs_gin;
