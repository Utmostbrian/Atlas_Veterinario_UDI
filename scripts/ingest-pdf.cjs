/**
 * scripts/ingest-pdf.js
 *
 * Procesa el Plumb's Veterinary Drug Handbook PDF y sube los chunks
 * al Edge Function ingest-vademecum para su indexación en pgvector.
 *
 * Uso:
 *   node scripts/ingest-pdf.js [--clear]
 *
 * Variables de entorno requeridas (puede usar .env.local o exportar antes):
 *   VITE_SUPABASE_URL  → URL del proyecto Supabase
 *   INGEST_SECRET      → Secreto configurado en Supabase Secrets
 *
 * Instalar dependencia:
 *   npm install pdf-parse dotenv
 */

const fs   = require('fs')
const path = require('path')

// Cargar variables del archivo .env.local si existe
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
} catch {
  // dotenv es opcional
}

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const INGEST_SECRET = process.env.INGEST_SECRET || ''
const PDF_PATH      = path.join(__dirname, '..', 'Fuentes de informacion', 'dokumen.pub_plumbs-veterinary-drug-handbook-10.pdf')
const ENDPOINT      = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ingest-vademecum` : ''

// Tamaño objetivo de cada chunk (caracteres)
const CHUNK_TARGET  = 700
const CHUNK_OVERLAP = 80
// Lote de chunks por solicitud al Edge Function
const BATCH_SIZE    = 20

async function main() {
  const args = process.argv.slice(2)
  const doClear = args.includes('--clear')

  if (!SUPABASE_URL || !INGEST_SECRET) {
    console.error('ERROR: Faltan variables de entorno VITE_SUPABASE_URL e INGEST_SECRET.')
    console.error('  Configúralas en .env.local o expórtalas antes de ejecutar el script.')
    process.exit(1)
  }

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`ERROR: PDF no encontrado en:\n  ${PDF_PATH}`)
    process.exit(1)
  }

  console.log('Leyendo PDF...')
  let pdfParse
  try {
    pdfParse = require('pdf-parse')
  } catch {
    console.error('ERROR: pdf-parse no está instalado. Ejecuta: npm install pdf-parse')
    process.exit(1)
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH)
  const pdfData   = await pdfParse(pdfBuffer)

  console.log(`  Páginas   : ${pdfData.numpages}`)
  console.log(`  Texto     : ${pdfData.text.length.toLocaleString()} caracteres`)

  const chunks = buildChunks(pdfData.text)
  console.log(`  Chunks    : ${chunks.length} generados`)

  if (chunks.length === 0) {
    console.error('ERROR: No se generaron chunks del PDF.')
    process.exit(1)
  }

  // Si se solicita limpiar antes de insertar, incluirlo en el primer lote
  let isFirstBatch = true
  let totalInserted = 0

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch   = chunks.slice(i, i + BATCH_SIZE)
    const batchNo = Math.floor(i / BATCH_SIZE) + 1
    const total   = Math.ceil(chunks.length / BATCH_SIZE)

    process.stdout.write(`  Lote ${batchNo}/${total} (${batch.length} chunks)... `)

    let res
    try {
      res = await fetch(ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-ingest-secret': INGEST_SECRET,
        },
        body: JSON.stringify({
          chunks: batch,
          clear:  isFirstBatch && doClear,
        }),
      })
    } catch (e) {
      console.error(`\nERROR de red: ${e.message}`)
      break
    }

    isFirstBatch = false

    let result
    try {
      result = await res.json()
    } catch {
      result = { ok: false, error: `HTTP ${res.status}` }
    }

    if (result.ok) {
      totalInserted += result.inserted ?? batch.length
      console.log(`OK (${result.inserted ?? '?'} insertados)`)
    } else {
      console.error(`FALLO — ${JSON.stringify(result)}`)
      if (res.status >= 500) break
    }
  }

  console.log(`\nIngestión completada. Total insertados: ${totalInserted}`)
}

/**
 * Divide el texto del PDF en chunks estructurados por entrada de fármaco.
 * El Plumb's organiza cada fármaco con un encabezado en MAYÚSCULAS.
 */
function buildChunks(text) {
  const chunks = []

  // Separar por líneas y limpiar caracteres de control del PDF
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())

  // Patrón de encabezado de fármaco: línea corta, principalmente MAYÚSCULAS
  // (con posibles caracteres de puntuación y paréntesis para nombres como AMOXICILLIN-CLAVULANATE)
  const isDrugHeader = (line) => {
    if (line.length < 3 || line.length > 80) return false
    const upperRatio = (line.match(/[A-Z]/g) || []).length / line.replace(/\s/g, '').length
    return upperRatio > 0.7 && /[A-Z]{3,}/.test(line)
  }

  let currentDrug   = null
  let currentLines  = []
  let entryIndex    = 0

  function flushEntry() {
    if (currentLines.length === 0) return
    const fullText = currentLines.join(' ').replace(/\s+/g, ' ').trim()
    if (fullText.length < 30) return
    splitEntry(fullText, currentDrug, entryIndex, chunks)
    entryIndex++
  }

  for (const line of lines) {
    if (!line) continue

    if (isDrugHeader(line)) {
      flushEntry()
      currentDrug  = line
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }
  flushEntry()

  // Si no se detectaron encabezados de fármaco, hacer chunking fijo del texto completo
  if (chunks.length === 0) {
    const flat = lines.join(' ').replace(/\s+/g, ' ')
    splitEntry(flat, null, 0, chunks)
  }

  return chunks
}

/**
 * Divide el texto de una entrada en chunks de tamaño objetivo con overlap.
 */
function splitEntry(text, drugName, baseIndex, chunks) {
  if (text.length <= CHUNK_TARGET) {
    chunks.push({ drug_name: drugName, content: text, chunk_index: baseIndex * 100 })
    return
  }

  let pos = 0
  let sub = 0

  while (pos < text.length) {
    const end   = Math.min(pos + CHUNK_TARGET, text.length)
    const chunk = text.slice(pos, end).trim()

    if (chunk.length >= 20) {
      chunks.push({
        drug_name:   drugName,
        content:     chunk,
        chunk_index: baseIndex * 100 + sub,
      })
      sub++
    }

    if (end === text.length) break
    pos = end - CHUNK_OVERLAP
  }
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
