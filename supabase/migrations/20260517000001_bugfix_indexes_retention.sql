-- ============================================================
-- Atlas Vet — Bugfix Migration
-- D-01: Composite index para queries de auditoría por usuario + fecha
-- D-02: Función extendida de limpieza de datos
-- D-04: Columna updated_at en prescriptions
-- ============================================================

-- D-01: Índice compuesto (user_id, created_at) para el panel de auditoría
-- Evita full-table-scan en queries filtradas por usuario ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_audit_user_created
  ON public.audit_logs (user_id, created_at DESC);

-- D-04: Agregar updated_at a prescriptions para soporte de edición futura
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Trigger que actualiza updated_at automáticamente (reutiliza función existente)
DROP TRIGGER IF EXISTS prescriptions_updated_at ON public.prescriptions;
CREATE TRIGGER prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- D-02: Función de limpieza extendida (rate_limits + logs opcionales)
-- Ejecutar periódicamente desde pg_cron o manualmente:
--   SELECT public.cleanup_old_data();
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Eliminar ventanas de rate limiting expiradas (>2 horas)
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '2 hours';

  -- Eliminar audit_logs con más de 180 días (descomenta para activar retención)
  -- DELETE FROM public.audit_logs
  -- WHERE created_at < NOW() - INTERVAL '180 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_data TO service_role;
