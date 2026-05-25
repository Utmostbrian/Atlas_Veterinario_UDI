-- ============================================================
-- Atlas Vet - Dashboard integrity reset and coherent taxonomy
--
-- This migration intentionally resets dashboard/audit counters after the
-- previous inconsistent instrumentation. Historical chat conversations and
-- user accounts are not deleted; only dashboard activity sources are reset.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Canonical event taxonomy
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_event_type_check
  CHECK (event_type IN (
    'AUTH_LOGIN',
    'DRUG_SEARCH',
    'DRUG_CARD_OPEN',
    'DISEASE_PROTOCOL_VIEW',
    'DOSE_CALCULATED',
    'DOSE_VALIDATED',
    'AI_CONSULTATION',
    'PRESCRIPTION_GEN',
    'INTERACTION_CHECK',
    'PRESCRIPTION_DOSE_OVERRIDE'
  ));

-- ------------------------------------------------------------
-- 2) Species normalization used by KPIs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_audit_species(p_species TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s TEXT := LOWER(TRIM(COALESCE(p_species, '')));
  matches TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF s = '' THEN
    RETURN NULL;
  END IF;

  IF s ~ '(perro|perra|canino|canina|cachorro)' THEN
    matches := array_append(matches, 'Perro');
  END IF;
  IF s ~ '(gato|gata|felino|felina|gatito)' THEN
    matches := array_append(matches, 'Gato');
  END IF;
  IF s ~ '(bovino|bovina|vaca|toro|ternero|becerro|buey|vaquilla|novillo)' THEN
    matches := array_append(matches, 'Bovino');
  END IF;
  IF s ~ '(equino|equina|caballo|yegua|potro|potranca|mula|burro)' THEN
    matches := array_append(matches, 'Equino');
  END IF;
  IF s ~ '(ovino|oveja|carnero|cordero|borrego)' THEN
    matches := array_append(matches, 'Ovino');
  END IF;
  IF s ~ '(porcino|cerdo|cerda|puerco|cochino|marrano|lechon)' THEN
    matches := array_append(matches, 'Porcino');
  END IF;
  IF s ~ '(caprino|cabra|chivo|cabrito)' THEN
    matches := array_append(matches, 'Caprino');
  END IF;
  IF s ~ '(ave|aves|gallina|gallo|pollo|pato|pavo|codorniz)' THEN
    matches := array_append(matches, 'Ave');
  END IF;

  IF CARDINALITY(matches) = 0 THEN
    RETURN 'Otras';
  END IF;
  IF CARDINALITY(matches) > 1 THEN
    RETURN 'Multiespecie';
  END IF;
  RETURN matches[1];
END;
$$;

-- ------------------------------------------------------------
-- 3) Dashboard KPI RPC with normalized species and one time window
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_get_dashboard_kpis(INT);
DROP FUNCTION IF EXISTS public.sp_get_dashboard_kpis(INT, TEXT);

CREATE OR REPLACE FUNCTION public.sp_get_dashboard_kpis(
  p_days INT DEFAULT 30,
  p_tz   TEXT DEFAULT 'America/La_Paz'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_caller_role  TEXT := COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_caller),
    'student'
  );
  v_tz           TEXT;
  v_today_local  DATE;
  v_start_local  DATE;
  v_until_local  DATE;
  v_from_utc     TIMESTAMPTZ;
  v_until_utc    TIMESTAMPTZ;
  v_total        BIGINT := 0;
  v_today        BIGINT := 0;
  v_by_type      JSONB := '{}'::JSONB;
  v_top_drugs    JSONB := '[]'::JSONB;
  v_top_terms    JSONB := '[]'::JSONB;
  v_by_hour      JSONB := '[]'::JSONB;
  v_by_species   JSONB := '{}'::JSONB;
  v_by_role      JSONB := '{}'::JSONB;
  v_by_day       JSONB := '[]'::JSONB;
BEGIN
  IF v_caller_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'insufficient_privilege: dashboard requires admin or docente role';
  END IF;

  IF p_days IS NULL OR p_days NOT IN (7, 30, 90) THEN
    p_days := 30;
  END IF;

  SELECT name INTO v_tz
  FROM pg_timezone_names
  WHERE name = COALESCE(NULLIF(TRIM(p_tz), ''), 'America/La_Paz')
  LIMIT 1;
  v_tz := COALESCE(v_tz, 'America/La_Paz');

  v_today_local := (NOW() AT TIME ZONE v_tz)::DATE;
  v_start_local := v_today_local - (p_days - 1);
  v_until_local := v_today_local + 1;
  v_from_utc    := v_start_local::TIMESTAMP AT TIME ZONE v_tz;
  v_until_utc   := v_until_local::TIMESTAMP AT TIME ZONE v_tz;

  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs al
  WHERE al.created_at >= v_from_utc
    AND al.created_at <  v_until_utc;

  SELECT COUNT(*) INTO v_today
  FROM public.audit_logs al
  WHERE al.created_at >= (v_today_local::TIMESTAMP AT TIME ZONE v_tz)
    AND al.created_at <  v_until_utc;

  SELECT COALESCE(jsonb_object_agg(event_type, total), '{}'::JSONB)
  INTO v_by_type
  FROM (
    SELECT al.event_type, COUNT(*)::BIGINT AS total
    FROM public.audit_logs al
    WHERE al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY al.event_type
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_searches DESC, t.drug_name), '[]'::JSONB)
  INTO v_top_drugs
  FROM (
    SELECT al.drug_name, COUNT(*)::BIGINT AS total_searches
    FROM public.audit_logs al
    WHERE al.event_type = 'DRUG_CARD_OPEN'
      AND al.drug_name IS NOT NULL
      AND al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY al.drug_name
    ORDER BY total_searches DESC, al.drug_name ASC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total_searches DESC, t.query_text), '[]'::JSONB)
  INTO v_top_terms
  FROM (
    SELECT al.query_text, COUNT(*)::BIGINT AS total_searches
    FROM public.audit_logs al
    WHERE al.event_type = 'DRUG_SEARCH'
      AND al.query_text IS NOT NULL
      AND al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY al.query_text
    ORDER BY total_searches DESC, al.query_text ASC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.hour_of_day), '[]'::JSONB)
  INTO v_by_hour
  FROM (
    SELECT EXTRACT(HOUR FROM al.created_at AT TIME ZONE v_tz)::INT AS hour_of_day,
           COUNT(*)::BIGINT AS events_count
    FROM public.audit_logs al
    WHERE al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY hour_of_day
    ORDER BY hour_of_day
  ) t;

  SELECT COALESCE(jsonb_object_agg(species, total), '{}'::JSONB)
  INTO v_by_species
  FROM (
    SELECT public.normalize_audit_species(al.species) AS species,
           COUNT(*)::BIGINT AS total
    FROM public.audit_logs al
    WHERE al.species IS NOT NULL
      AND al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY public.normalize_audit_species(al.species)
  ) t
  WHERE species IS NOT NULL;

  SELECT COALESCE(jsonb_object_agg(role, total), '{}'::JSONB)
  INTO v_by_role
  FROM (
    SELECT
      CASE COALESCE(p.role, 'unknown')
        WHEN 'veterinarian' THEN 'docente'
        ELSE COALESCE(p.role, 'unknown')
      END AS role,
      COUNT(*)::BIGINT AS total
    FROM public.audit_logs al
    LEFT JOIN public.profiles p ON p.id = al.user_id
    WHERE al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::JSONB)
  INTO v_by_day
  FROM (
    SELECT
      d::DATE AS day,
      COALESCE(COUNT(al.id), 0)::BIGINT AS events_count
    FROM generate_series(v_start_local, v_today_local, '1 day'::INTERVAL) d
    LEFT JOIN public.audit_logs al
      ON (al.created_at AT TIME ZONE v_tz)::DATE = d::DATE
     AND al.created_at >= v_from_utc
     AND al.created_at <  v_until_utc
    GROUP BY d
    ORDER BY d
  ) t;

  RETURN jsonb_build_object(
    'source',       'supabase',
    'timezone',     v_tz,
    'period_days',  p_days,
    'from',         v_from_utc,
    'until',        v_until_utc,
    'total',        v_total,
    'today',        v_today,
    'by_type',      v_by_type,
    'top_drugs',    v_top_drugs,
    'top_terms',    v_top_terms,
    'by_hour',      v_by_hour,
    'by_species',   v_by_species,
    'by_role',      v_by_role,
    'by_day',       v_by_day
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_dashboard_kpis(INT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4) Audit history accepts the expanded taxonomy
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_get_audit_history_page(INT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.sp_get_audit_history_page(
  p_limit      INT  DEFAULT 50,
  p_offset     INT  DEFAULT 0,
  p_event_type TEXT DEFAULT NULL,
  p_search     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_caller_role  TEXT := COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_caller),
    'student'
  );
  v_filter_user  UUID;
  v_search       TEXT := NULLIF(TRIM(p_search), '');
  v_total        BIGINT := 0;
  v_items        JSONB := '[]'::JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: active session required';
  END IF;

  v_filter_user := CASE
    WHEN v_caller_role IN ('admin', 'docente') THEN NULL
    ELSE v_caller
  END;

  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 1000 THEN p_limit := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;
  IF p_event_type IS NOT NULL AND p_event_type NOT IN (
    'AUTH_LOGIN',
    'DRUG_SEARCH',
    'DRUG_CARD_OPEN',
    'DISEASE_PROTOCOL_VIEW',
    'DOSE_CALCULATED',
    'DOSE_VALIDATED',
    'AI_CONSULTATION',
    'PRESCRIPTION_GEN',
    'INTERACTION_CHECK',
    'PRESCRIPTION_DOSE_OVERRIDE'
  ) THEN
    p_event_type := NULL;
  END IF;

  WITH filtered AS (
    SELECT
      al.id,
      al.event_id,
      al.user_id,
      al.event_type,
      al.drug_name,
      public.normalize_audit_species(al.species) AS species,
      al.weight_kg,
      al.dose_calculated,
      al.vol_ml,
      al.route,
      al.query_text,
      al.summary,
      al.ip_address,
      al.actor_name,
      al.created_at
    FROM public.audit_logs al
    WHERE
      (v_filter_user IS NULL OR al.user_id = v_filter_user)
      AND (p_event_type IS NULL OR al.event_type = p_event_type)
      AND (
        v_search IS NULL
        OR al.drug_name  ILIKE '%' || v_search || '%'
        OR al.query_text ILIKE '%' || v_search || '%'
        OR al.species    ILIKE '%' || v_search || '%'
        OR al.actor_name ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*)::BIGINT AS total_count FROM filtered
  ),
  page AS (
    SELECT *
    FROM filtered
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    counted.total_count,
    COALESCE(
      jsonb_agg(row_to_json(page) ORDER BY page.created_at DESC)
        FILTER (WHERE page.id IS NOT NULL),
      '[]'::JSONB
    )
  INTO v_total, v_items
  FROM counted
  LEFT JOIN page ON TRUE
  GROUP BY counted.total_count;

  RETURN jsonb_build_object(
    'source', 'supabase',
    'total',  COALESCE(v_total, 0),
    'items',  COALESCE(v_items, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_audit_history_page(INT, INT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5) Admin reset RPC and one-time reset for corrupt dashboard history
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_reset_dashboard_activity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT := COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'student'
  );
  v_audit_deleted BIGINT := 0;
  v_login_deleted BIGINT := 0;
  v_fail_deleted  BIGINT := 0;
BEGIN
  IF v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: only admin can reset dashboard activity';
  END IF;

  DELETE FROM public.audit_logs;
  GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

  DELETE FROM public.login_failures;
  GET DIAGNOSTICS v_login_deleted = ROW_COUNT;

  DELETE FROM public.audit_failures;
  GET DIAGNOSTICS v_fail_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'audit_logs_deleted',     v_audit_deleted,
    'login_failures_deleted', v_login_deleted,
    'audit_failures_deleted', v_fail_deleted,
    'reset_at',               NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_reset_dashboard_activity() TO authenticated;

-- Requested hard reset: start counters and visualizations from zero.
DELETE FROM public.audit_logs;
DELETE FROM public.login_failures;
DELETE FROM public.audit_failures;
