-- ============================================================
-- Atlas Vet — Admin Dashboard KPIs
-- Amplía sp_get_dashboard_kpis con:
--   - by_role     : distribución por rol (admin/docente/student)
--   - by_day      : serie temporal diaria (últimos N días)
-- Añade nuevas RPCs:
--   - sp_get_failed_logins : intentos fallidos desde auth.audit_log_entries
-- Ambas SECURITY DEFINER con check de rol admin/docente en runtime.
-- ============================================================

-- ------------------------------------------------------------
-- 1) sp_get_dashboard_kpis ampliado
--    RETURN TYPE no cambia (jsonb), solo se añaden claves nuevas
--    al objeto resultante. No requiere DROP.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_dashboard_kpis(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     UUID    := auth.uid();
  v_caller_role TEXT   := COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_caller),
    'student'
  );
  v_from        TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_total       BIGINT;
  v_today       BIGINT;
  v_by_type     JSONB;
  v_top_drugs   JSONB;
  v_by_hour     JSONB;
  v_by_species  JSONB;
  v_by_role     JSONB;
  v_by_day      JSONB;
BEGIN
  -- Solo admin/docente ven dashboard
  IF v_caller_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'insufficient_privilege: dashboard requires admin or docente role';
  END IF;

  IF p_days IS NULL OR p_days <= 0 OR p_days > 365 THEN p_days := 30; END IF;

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

  -- Top 10 fármacos más consultados
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

  -- Actividad por hora del día (heatmap)
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

  -- NUEVO: Distribución por rol de usuario
  SELECT jsonb_object_agg(role, total)
  INTO v_by_role
  FROM (
    SELECT COALESCE(p.role, 'unknown') AS role, COUNT(*) AS total
    FROM public.audit_logs al
    LEFT JOIN public.profiles p ON p.id = al.user_id
    WHERE al.created_at >= v_from
    GROUP BY p.role
  ) t;

  -- NUEVO: Serie diaria (últimos p_days días)
  --        Genera serie completa para que el gráfico no tenga huecos.
  SELECT jsonb_agg(row_to_json(t) ORDER BY day)
  INTO v_by_day
  FROM (
    SELECT
      d::DATE AS day,
      COALESCE(COUNT(al.id), 0)::BIGINT AS events_count
    FROM generate_series(
      (v_from)::DATE,
      NOW()::DATE,
      '1 day'::INTERVAL
    ) d
    LEFT JOIN public.audit_logs al
      ON al.created_at::DATE = d::DATE
    GROUP BY d
    ORDER BY d
  ) t;

  RETURN jsonb_build_object(
    'period_days',  p_days,
    'total',        v_total,
    'today',        v_today,
    'by_type',      COALESCE(v_by_type,    '{}'),
    'top_drugs',    COALESCE(v_top_drugs,  '[]'),
    'by_hour',      COALESCE(v_by_hour,    '[]'),
    'by_species',   COALESCE(v_by_species, '{}'),
    'by_role',      COALESCE(v_by_role,    '{}'),
    'by_day',       COALESCE(v_by_day,     '[]')
  );
END;
$$;

-- ------------------------------------------------------------
-- 2) sp_get_failed_logins
--    Lee auth.audit_log_entries que Supabase Auth llena con cada
--    intento. action='login' + error_id no nulo => fallido.
--    Si auth.audit_log_entries no es accesible (Supabase managed
--    restrictions), retorna [] sin error.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_failed_logins(
  p_days  INT DEFAULT 7,
  p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller      UUID := auth.uid();
  v_caller_role TEXT := COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_caller),
    'student'
  );
  v_from        TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_total       BIGINT := 0;
  v_recent      JSONB  := '[]'::JSONB;
BEGIN
  IF v_caller_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'insufficient_privilege: failed_logins requires admin or docente role';
  END IF;

  IF p_days  IS NULL OR p_days  <= 0 OR p_days  > 90  THEN p_days  := 7;   END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 500 THEN p_limit := 100; END IF;

  BEGIN
    -- payload->>'action' suele ser 'login' y error_message no nulo en fallos.
    -- Esquema exacto depende de la versión de gotrue; envolvemos en BEGIN/EXCEPTION
    -- para no romper si el shape cambia.
    SELECT COUNT(*) INTO v_total
    FROM auth.audit_log_entries
    WHERE created_at >= v_from
      AND payload->>'action' IN ('login', 'user_signedup')
      AND (payload->>'error_message' IS NOT NULL
        OR payload->>'error_code'    IS NOT NULL);

    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
    INTO v_recent
    FROM (
      SELECT
        created_at,
        payload->>'actor_username' AS email,
        payload->>'error_message'  AS error_message,
        payload->'traits'->>'provider' AS provider
      FROM auth.audit_log_entries
      WHERE created_at >= v_from
        AND payload->>'action' IN ('login', 'user_signedup')
        AND (payload->>'error_message' IS NOT NULL
          OR payload->>'error_code'    IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT p_limit
    ) t;
  EXCEPTION WHEN OTHERS THEN
    -- auth.audit_log_entries puede no estar disponible o tener otro shape.
    -- Devolvemos un payload "no disponible" en vez de tirar la query.
    RETURN jsonb_build_object(
      'available', FALSE,
      'reason',    SQLERRM,
      'period_days', p_days,
      'total',     0,
      'recent',    '[]'::JSONB
    );
  END;

  RETURN jsonb_build_object(
    'available',   TRUE,
    'period_days', p_days,
    'total',       v_total,
    'recent',      COALESCE(v_recent, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_dashboard_kpis(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_failed_logins(INT, INT) TO authenticated;
