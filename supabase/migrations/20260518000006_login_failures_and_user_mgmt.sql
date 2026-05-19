-- ============================================================
-- Atlas Vet — Login Failures Tracking + User Management RPCs
--
-- Opción B del reporte previo: tabla propia para registrar intentos
-- de login fallidos (auth.audit_log_entries no es accesible).
--
-- Además: RPCs para que admin/docente listen y administren usuarios
-- desde el dashboard de la app.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla login_failures
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_failures (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  reason      TEXT        NULL,
  user_agent  TEXT        NULL,
  ip_address  TEXT        NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_failures_created
  ON public.login_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_failures_email
  ON public.login_failures (email);

ALTER TABLE public.login_failures ENABLE ROW LEVEL SECURITY;

-- Lectura: solo admin/docente
DROP POLICY IF EXISTS "login_failures_select_elevated" ON public.login_failures;
CREATE POLICY "login_failures_select_elevated"
  ON public.login_failures FOR SELECT
  USING (public.get_user_role(auth.uid()) IN ('admin', 'docente'));

-- Inserción: nadie directo. Solo vía RPC log_login_failure (SECURITY DEFINER).
-- Sin policy de INSERT = bloqueo total para clientes; el SP bypass via DEFINER.

-- Borrado: solo admin
DROP POLICY IF EXISTS "login_failures_delete_admin" ON public.login_failures;
CREATE POLICY "login_failures_delete_admin"
  ON public.login_failures FOR DELETE
  USING (public.get_user_role(auth.uid()) = 'admin');

COMMENT ON TABLE public.login_failures IS
  'Intentos de login fallidos registrados desde el frontend. Solo escritura vía log_login_failure().';

-- ------------------------------------------------------------
-- 2) RPC log_login_failure — cliente sin sesión la invoca tras un signIn fallido
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_login_failure(
  p_email      TEXT,
  p_reason     TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_email IS NULL OR LENGTH(TRIM(p_email)) = 0 THEN RETURN; END IF;
  IF LENGTH(TRIM(p_email)) > 254 THEN RETURN; END IF;

  INSERT INTO public.login_failures (email, reason, user_agent)
  VALUES (
    LOWER(TRIM(p_email)),
    LEFT(COALESCE(p_reason,     'unknown'), 200),
    LEFT(COALESCE(p_user_agent, ''),        300)
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca romper el flujo de login por un fallo de logging
  NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_login_failure(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) sp_get_failed_logins — sustituido para leer desde login_failures
--    Mismo contrato JSON, distinta fuente de datos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_failed_logins(
  p_days  INT DEFAULT 7,
  p_limit INT DEFAULT 100
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
  IF p_days  IS NULL OR p_days  <= 0 OR p_days  > 90  THEN p_days  := 7;   END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 500 THEN p_limit := 100; END IF;
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
      reason       AS error_message,
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

-- ------------------------------------------------------------
-- 4) sp_list_users — admin/docente listan usuarios para la UI de gestión
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_list_users()
RETURNS TABLE (
  id          UUID,
  email       TEXT,
  name        TEXT,
  role        TEXT,
  institution TEXT,
  created_at  TIMESTAMPTZ,
  last_sign_in TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller      UUID := auth.uid();
  v_caller_role TEXT := COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.id = v_caller), 'student'
  );
BEGIN
  IF v_caller_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'insufficient_privilege: user listing requires admin or docente role';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    p.name,
    p.role,
    p.institution,
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_list_users() TO authenticated;

-- ------------------------------------------------------------
-- 5) sp_update_user_role — solo admin puede cambiar roles
--    No permite degradarse a sí mismo (evita lockout).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_update_user_role(
  p_user_id UUID,
  p_role    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      UUID := auth.uid();
  v_caller_role TEXT := COALESCE(
    (SELECT role FROM public.profiles WHERE id = v_caller), 'student'
  );
BEGIN
  IF v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: only admin can change roles';
  END IF;
  IF p_role NOT IN ('admin', 'docente', 'student') THEN
    RAISE EXCEPTION 'invalid_role: role must be admin, docente or student';
  END IF;
  IF p_user_id = v_caller AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'self_demotion_blocked: admin cannot demote own account';
  END IF;

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_update_user_role(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 6) Cleanup: extender retention para login_failures (90 días)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cleanup_old_data();

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate_limits     BIGINT := 0;
  v_audit_logs      BIGINT := 0;
  v_audit_fails     BIGINT := 0;
  v_login_failures  BIGINT := 0;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '2 hours';
  GET DIAGNOSTICS v_rate_limits = ROW_COUNT;

  DELETE FROM public.audit_failures
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_audit_fails = ROW_COUNT;

  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS v_audit_logs = ROW_COUNT;

  DELETE FROM public.login_failures
  WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_login_failures = ROW_COUNT;

  RETURN jsonb_build_object(
    'rate_limits_deleted',     v_rate_limits,
    'audit_logs_deleted',      v_audit_logs,
    'audit_failures_deleted',  v_audit_fails,
    'login_failures_deleted',  v_login_failures,
    'ran_at',                  NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_data TO service_role;
