-- Corrige match_vademecum_text agregando búsqueda ILIKE en content
-- El operador % (trigrama) tiene baja similitud en chunks largos;
-- ILIKE garantiza encontrar el fármaco si aparece en el contenido.
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
      similarity(lower(content),   lower(search_query)),
      similarity(lower(drug_name), lower(search_query))
    ) AS similarity
  FROM vademecum_chunks
  WHERE
    drug_name IS NOT NULL
    AND (
      lower(drug_name) % lower(search_query)
      OR lower(content) % lower(search_query)
      OR lower(drug_name) ILIKE '%' || lower(search_query) || '%'
      OR lower(content)   ILIKE '%' || lower(search_query) || '%'
    )
  ORDER BY
    similarity(lower(drug_name), lower(search_query)) DESC,
    similarity(lower(content),   lower(search_query)) DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_vademecum_text TO authenticated;
