-- ============================================================
-- Atlas Vet - Dashboard 100% Supabase source of truth
--
-- Objetivos:
--   - Ningun KPI/log admin depende de localStorage.
--   - Admin y docente leen dashboard/log global; solo admin destruye/gestiona.
--   - Fechas del dashboard se calculan en America/La_Paz por defecto.
--   - DRUG_SEARCH = busqueda real; DRUG_CARD_OPEN = ficha consultada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Catalogo canonico de eventos de auditoria
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_event_type_check
  CHECK (event_type IN (
    'DRUG_SEARCH',
    'DRUG_CARD_OPEN',
    'DOSE_CALCULATED',
    'DOSE_VALIDATED',
    'AI_CONSULTATION',
    'PRESCRIPTION_GEN',
    'INTERACTION_CHECK',
    'PRESCRIPTION_DOSE_OVERRIDE'
  ));

CREATE INDEX IF NOT EXISTS idx_audit_event_created
  ON public.audit_logs (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_query_text_trgm
  ON public.audit_logs USING GIN (query_text gin_trgm_ops)
  WHERE query_text IS NOT NULL;

-- Lectura directa de audit_logs: admin/docente global, usuario propio.
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_select_elevated" ON public.audit_logs;
CREATE POLICY "audit_select_elevated"
  ON public.audit_logs FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'docente'));

-- ------------------------------------------------------------
-- 2) KPIs del dashboard: contrato unico y timezone-aware
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

  -- Ficha consultada es el ranking de farmacos; no se mezcla con busquedas de texto.
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
    SELECT al.species, COUNT(*)::BIGINT AS total
    FROM public.audit_logs al
    WHERE al.species IS NOT NULL
      AND al.created_at >= v_from_utc
      AND al.created_at <  v_until_utc
    GROUP BY al.species
  ) t;

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
-- 3) Intentos fallidos: tabla propia, todos los registros si p_limit = NULL
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.sp_get_failed_logins(INT, INT);
DROP FUNCTION IF EXISTS public.sp_get_failed_logins(INT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.sp_get_failed_logins(
  p_days  INT DEFAULT 7,
  p_limit INT DEFAULT NULL,
  p_tz    TEXT DEFAULT 'America/La_Paz'
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
  v_recent       JSONB := '[]'::JSONB;
BEGIN
  IF v_caller_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'insufficient_privilege: failed_logins requires admin or docente role';
  END IF;

  IF p_days IS NULL OR p_days NOT IN (7, 30, 90) THEN
    p_days := 7;
  END IF;
  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    p_limit := NULL;
  END IF;
  IF p_limit IS NOT NULL AND p_limit > 10000 THEN
    p_limit := 10000;
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
  FROM public.login_failures lf
  WHERE lf.created_at >= v_from_utc
    AND lf.created_at <  v_until_utc;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::JSONB)
  INTO v_recent
  FROM (
    SELECT
      lf.created_at,
      lf.email,
      lf.reason AS error_message,
      lf.user_agent
    FROM public.login_failures lf
    WHERE lf.created_at >= v_from_utc
      AND lf.created_at <  v_until_utc
    ORDER BY lf.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'available',   TRUE,
    'source',      'login_failures',
    'timezone',    v_tz,
    'period_days', p_days,
    'total',       v_total,
    'recent',      v_recent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_failed_logins(INT, INT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4) Log de auditoria: docente/admin global, student propio
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
    'DRUG_SEARCH',
    'DRUG_CARD_OPEN',
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
      al.species,
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

-- Mantener compatibilidad con el RPC anterior.
DROP FUNCTION IF EXISTS public.sp_get_audit_history(UUID, INT, INT, TEXT, TEXT, BOOLEAN);

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
  actor_name      TEXT,
  created_at      TIMESTAMPTZ,
  total_count     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page JSONB;
BEGIN
  v_page := public.sp_get_audit_history_page(
    p_limit      := p_limit,
    p_offset     := p_offset,
    p_event_type := p_event_type,
    p_search     := p_search
  );

  RETURN QUERY
  SELECT
    (x->>'id')::UUID,
    x->>'event_id',
    (x->>'user_id')::UUID,
    x->>'event_type',
    x->>'drug_name',
    x->>'species',
    NULLIF(x->>'weight_kg', '')::NUMERIC,
    x->>'dose_calculated',
    x->>'vol_ml',
    x->>'route',
    x->>'query_text',
    x->>'summary',
    x->>'ip_address',
    x->>'actor_name',
    (x->>'created_at')::TIMESTAMPTZ,
    COALESCE((v_page->>'total')::BIGINT, 0)
  FROM jsonb_array_elements(COALESCE(v_page->'items', '[]'::JSONB)) AS x;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_audit_history(UUID, INT, INT, TEXT, TEXT, BOOLEAN) TO authenticated;
