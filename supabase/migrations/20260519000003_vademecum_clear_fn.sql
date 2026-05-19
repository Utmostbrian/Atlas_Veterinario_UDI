-- Función de limpieza invocable via RPC para evitar el schema cache de PostgREST
CREATE OR REPLACE FUNCTION public.clear_vademecum_chunks(source_name TEXT DEFAULT 'plumbs')
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM vademecum_chunks WHERE source = source_name;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Solo el service_role puede invocarla (el anon no tiene acceso de escritura)
REVOKE EXECUTE ON FUNCTION public.clear_vademecum_chunks FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_vademecum_chunks TO service_role;
