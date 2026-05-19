/**
 * Edge Function: ingest-vademecum
 *
 * Ingesta chunks de texto del Plumb's Veterinary Drug Handbook en la tabla
 * vademecum_chunks, generando embeddings con el modelo gte-small (384 dims)
 * disponible en el runtime de Supabase Edge Functions.
 *
 * Protegida por INGEST_SECRET — nunca exponer este secret al cliente.
 * Solo debe ser invocada por el script de ingestión local (scripts/ingest-pdf.js).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const INGEST_SECRET = Deno.env.get('INGEST_SECRET') ?? ''
const BATCH_SIZE    = 100  // chunks por lote de inserción (sin embeddings, muy rápido)

interface Chunk {
  drug_name?:   string | null
  content:      string
  chunk_index?: number
}

interface InsertRow {
  drug_name:   string | null
  content:     string
  chunk_index: number
  source:      string
  // embedding se omite intencionalmente — se usa búsqueda por trigrama (pg_trgm)
}

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '*'
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Headers': 'content-type, x-ingest-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(req) })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405, headers: cors(req) })
  }

  // Autenticación por secret
  const providedSecret = req.headers.get('x-ingest-secret')
  if (!INGEST_SECRET || providedSecret !== INGEST_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors(req) })
  }

  let body: { chunks?: unknown; clear?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400, headers: cors(req) })
  }

  const chunks = body.chunks
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return Response.json({ error: 'Se requiere un array "chunks" no vacío.' }, { status: 400, headers: cors(req) })
  }

  // Validar longitud máxima de chunk
  const validChunks = (chunks as Chunk[]).filter(c =>
    typeof c.content === 'string' && c.content.trim().length >= 20
  )

  if (validChunks.length === 0) {
    return Response.json({ error: 'Ningún chunk tiene contenido válido (mínimo 20 chars).' }, { status: 400, headers: cors(req) })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Si se envía clear=true, invocar la función SQL que hace el DELETE
  // (evita el schema cache de PostgREST que puede fallar justo tras una migración)
  if (body.clear === true) {
    const { error: clearErr } = await supabase.rpc('clear_vademecum_chunks', { source_name: 'plumbs' })
    if (clearErr) {
      return Response.json({ error: `Error limpiando tabla: ${clearErr.message}` }, { status: 500, headers: cors(req) })
    }
    console.log('[ingest] Tabla limpiada via RPC.')
  }

  // Inserción directa sin embeddings — la búsqueda usa pg_trgm (match_vademecum_text)
  let inserted  = 0
  let skipped   = 0
  const errors: string[] = []

  for (let i = 0; i < validChunks.length; i += BATCH_SIZE) {
    const batch = validChunks.slice(i, i + BATCH_SIZE)
    const rows: InsertRow[] = batch
      .filter(c => c.content.trim().length >= 20)
      .map(c => ({
        drug_name:   c.drug_name ?? null,
        content:     c.content.trim(),
        chunk_index: c.chunk_index ?? 0,
        source:      'plumbs',
      }))

    if (rows.length === 0) { skipped += batch.length; continue }

    const { error: insErr } = await supabase
      .from('vademecum_chunks')
      .insert(rows)

    if (insErr) {
      console.error('[ingest] Insert error:', insErr.message)
      errors.push(insErr.message)
    } else {
      inserted += rows.length
    }
  }

  const ok = errors.length === 0
  return Response.json(
    { ok, inserted, skipped, errors: ok ? undefined : errors },
    { status: ok ? 200 : 207, headers: { ...cors(req), 'Content-Type': 'application/json' } }
  )
})
