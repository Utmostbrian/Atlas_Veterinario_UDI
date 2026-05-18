-- ============================================================
-- Atlas Vet — Profile photo persistence + ILIKE indexes
-- N1: persiste user.photo en profiles
-- N8: índice GIN trgm para búsquedas ILIKE de actor_name
-- ============================================================

-- ------------------------------------------------------------
-- N1: columna para la foto de perfil (dataURL base64).
-- TEXT permite hasta ~1GB en Postgres; el frontend limita a JPEG
-- 200x200 calidad 0.85 (~15-30 KB típico). Si el dato pasa de 1 MB
-- el INSERT/UPDATE va a fallar — el cliente debería pre-validar.
-- Para evitar accidentes, ponemos un CHECK que limita a 512 KB.
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo TEXT NULL
    CONSTRAINT profiles_photo_size CHECK (photo IS NULL OR length(photo) <= 524288);

COMMENT ON COLUMN public.profiles.photo IS
  'Foto de perfil como dataURL (base64). Limitado a 512 KB. Para imágenes mayores migrar a Supabase Storage + photo_url.';

-- ------------------------------------------------------------
-- N8: extensión pg_trgm para búsquedas ILIKE performantes.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop del índice b-tree parcial anterior (no servía para ILIKE)
DROP INDEX IF EXISTS public.idx_audit_actor_name;

-- Índice GIN trgm — sirve tanto a igualdad como a ILIKE '%foo%'
CREATE INDEX IF NOT EXISTS idx_audit_actor_name_trgm
  ON public.audit_logs USING GIN (actor_name gin_trgm_ops);

-- Mismo tratamiento para drug_name (es lo que más busca el panel de admin)
CREATE INDEX IF NOT EXISTS idx_audit_drug_name_trgm
  ON public.audit_logs USING GIN (drug_name gin_trgm_ops);

-- ------------------------------------------------------------
-- N10: SP para que el admin pueda limpiar TODO el historial,
-- no solo el suyo. Reemplaza el DELETE directo del cliente.
-- Estudiantes siguen solo borrando los suyos vía el DELETE existente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_clear_audit_logs(
  p_scope TEXT DEFAULT 'own'  -- 'own' | 'all'
)
RETURNS BIGINT
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
  v_deleted  BIGINT;
BEGIN
  IF p_scope = 'all' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: Solo administradores pueden limpiar todo el historial.'
        USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.audit_logs;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    DELETE FROM public.audit_logs WHERE user_id = v_caller;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN v_deleted;
END;
$$;
