-- ═══════════════════════════════════════════════════════════════
-- Búsqueda de texto en vademecum_chunks usando pg_trgm
-- Complemento al índice ivfflat (funciona sin necesidad de embeddings)
-- ═══════════════════════════════════════════════════════════════

-- Extensión trigrama (ya habilitada en migraciones previas, idempotente)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índice GIN trigrama sobre el contenido (búsqueda rápida por similitud textual)
CREATE INDEX IF NOT EXISTS vademecum_chunks_content_trgm_idx
  ON public.vademecum_chunks
  USING gin (content gin_trgm_ops);

-- Índice GIN sobre el nombre del fármaco para búsquedas exactas y parciales
CREATE INDEX IF NOT EXISTS vademecum_chunks_drug_trgm_idx
  ON public.vademecum_chunks
  USING gin (drug_name gin_trgm_ops);

-- Función de búsqueda por texto (trigrama + full-text, sin necesidad de embeddings)
-- Ordena por similitud trigrama descendente y limita a los mejores resultados.
CREATE OR REPLACE FUNCTION public.match_vademecum_text(
  search_query TEXT,
  match_threshold FLOAT DEFAULT 0.1,
  match_count     INT   DEFAULT 6
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
    GREATEST(
      similarity(lower(content),    lower(search_query)),
      similarity(lower(drug_name),  lower(search_query))
    ) AS similarity
  FROM vademecum_chunks
  WHERE
    drug_name IS NOT NULL
    AND (
      lower(drug_name) % lower(search_query)
      OR lower(content) % lower(search_query)
      OR lower(drug_name) ILIKE '%' || lower(search_query) || '%'
    )
  ORDER BY
    similarity(lower(drug_name), lower(search_query)) DESC,
    similarity(lower(content),   lower(search_query)) DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_vademecum_text TO authenticated;
