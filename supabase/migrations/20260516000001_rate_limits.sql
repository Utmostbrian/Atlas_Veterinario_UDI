-- Rate limiting persistente para anthropic-proxy
-- Sobrevive reinicios de Deno workers (a diferencia del Map en memoria)

CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start  TIMESTAMPTZ NOT NULL,
  request_count INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Solo el service role puede operar esta tabla (Edge Function usa service role key)
CREATE POLICY "service_role_only" ON public.rate_limits USING (false);

-- Upsert atómico: devuelve true si la solicitud está permitida, false si se alcanzó el límite
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_user_id      UUID,
  p_window_start TIMESTAMPTZ,
  p_max_requests INTEGER DEFAULT 10
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits (user_id, window_start, request_count)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

-- Permitir que authenticated llame a la función (se ejecuta como SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit TO authenticated;

-- Limpieza de ventanas antiguas (ejecutar periódicamente con pg_cron o manualmente)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
$$;
