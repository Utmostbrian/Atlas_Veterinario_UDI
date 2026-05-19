-- ═══════════════════════════════════════════════════════════════
-- Motor Dual: Vademécum Plumb's con pgvector + búsqueda semántica
-- ═══════════════════════════════════════════════════════════════

-- Habilitar extensión pgvector (requiere Supabase con pgvector disponible)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Tabla principal de chunks ────────────────────────────────────────────────
-- Almacena fragmentos de texto del Plumb's Veterinary Drug Handbook
-- junto con sus embeddings (gte-small, 384 dimensiones).
CREATE TABLE IF NOT EXISTS public.vademecum_chunks (
  id          BIGSERIAL PRIMARY KEY,
  drug_name   TEXT,                          -- nombre del fármaco (puede ser null para chunks generales)
  content     TEXT        NOT NULL,           -- texto del fragmento
  embedding   VECTOR(384),                   -- embedding gte-small (null hasta que se indexe)
  chunk_index INT         NOT NULL DEFAULT 0, -- índice del chunk dentro de la entrada del fármaco
  source      TEXT        NOT NULL DEFAULT 'plumbs', -- fuente: 'plumbs' | 'merck' | 'manual'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice IVFFLAT para búsqueda coseno eficiente
-- IMPORTANTE: Solo efectivo con >1000 filas. Con listas=100, óptimo hasta ~1M filas.
CREATE INDEX IF NOT EXISTS vademecum_chunks_embedding_idx
  ON public.vademecum_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Índice de texto para búsqueda por nombre de fármaco
CREATE INDEX IF NOT EXISTS vademecum_chunks_drug_name_idx
  ON public.vademecum_chunks (drug_name);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.vademecum_chunks ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados pueden leer los chunks (contexto RAG)
CREATE POLICY "authenticated_read_vademecum"
  ON public.vademecum_chunks
  FOR SELECT
  TO authenticated
  USING (true);

-- Solo el service_role puede insertar/actualizar/borrar (ingestión controlada)
CREATE POLICY "service_role_manage_vademecum"
  ON public.vademecum_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Función de búsqueda semántica ────────────────────────────────────────────
-- Devuelve los chunks más similares al embedding de consulta dado.
-- Usa distancia coseno (operador <=>). El threshold por defecto 0.55
-- equilibra recall y precision para terminología veterinaria.
CREATE OR REPLACE FUNCTION public.match_vademecum(
  query_embedding  VECTOR(384),
  match_threshold  FLOAT   DEFAULT 0.55,
  match_count      INT     DEFAULT 5
)
RETURNS TABLE (
  id         BIGINT,
  drug_name  TEXT,
  content    TEXT,
  source     TEXT,
  similarity FLOAT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    drug_name,
    content,
    source,
    1 - (embedding <=> query_embedding) AS similarity
  FROM vademecum_chunks
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Permitir que usuarios autenticados invoquen la función de búsqueda
GRANT EXECUTE ON FUNCTION public.match_vademecum TO authenticated;

-- ── Vista de estadísticas (útil para el dashboard admin) ─────────────────────
CREATE OR REPLACE VIEW public.vademecum_stats AS
SELECT
  COUNT(*)                                          AS total_chunks,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL)    AS indexed_chunks,
  COUNT(DISTINCT drug_name)                        AS unique_drugs,
  MIN(created_at)                                  AS first_indexed,
  MAX(created_at)                                  AS last_indexed
FROM public.vademecum_chunks;

GRANT SELECT ON public.vademecum_stats TO authenticated;
