-- ============================================================
-- Atlas Vet - Failed login list without UI truncation
--
-- p_limit = NULL now means "return all failed login attempts in the
-- selected period". Positive values are still capped defensively.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sp_get_failed_logins(
  p_days  INT DEFAULT 7,
  p_limit INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      UUID := auth.uid();
  v_caller_role TEXT := COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_caller), 'student'
  );
  v_from        TIMESTAMPTZ;
  v_total       BIGINT := 0;
  v_recent      JSONB  := '[]'::JSONB;
BEGIN
  IF v_caller_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'insufficient_privilege: failed_logins requires admin or docente role';
  END IF;

  IF p_days IS NULL OR p_days <= 0 OR p_days > 90 THEN
    p_days := 7;
  END IF;

  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    p_limit := NULL;
  END IF;

  IF p_limit IS NOT NULL AND p_limit > 10000 THEN
    p_limit := 10000;
  END IF;

  v_from := NOW() - (p_days || ' days')::INTERVAL;

  SELECT COUNT(*) INTO v_total
  FROM public.login_failures
  WHERE created_at >= v_from;

  SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
  INTO v_recent
  FROM (
    SELECT
      created_at,
      email,
      reason AS error_message,
      user_agent
    FROM public.login_failures
    WHERE created_at >= v_from
    ORDER BY created_at DESC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'available',   TRUE,
    'period_days', p_days,
    'total',       v_total,
    'recent',      COALESCE(v_recent, '[]'::JSONB),
    'source',      'login_failures'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_failed_logins(INT, INT) TO authenticated;
