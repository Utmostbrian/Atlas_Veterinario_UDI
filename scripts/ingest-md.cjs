/**
 * Ingesta el Markdown local de Plumb's Veterinary Drug Handbook 10th ed.
 * en vademecum_chunks usando la Edge Function ingest-vademecum.
 *
 * Uso:
 *   node scripts/ingest-md.cjs --dry-run
 *   node scripts/ingest-md.cjs --clear
 *   node scripts/ingest-md.cjs --append
 *   node scripts/ingest-md.cjs --source "C:\ruta\plumbs.md" --clear
 *
 * Variables:
 *   VITE_SUPABASE_URL o SUPABASE_URL
 *   INGEST_SECRET
 */

const fs = require('fs')
const path = require('path')

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
} catch {
  // dotenv es opcional
}

const DEFAULT_MD_PATH = 'C:\\Users\\Windows\\Downloads\\dokumen.pub_plumbs-veterinary-drug-handbook-10.md'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const INGEST_SECRET = process.env.INGEST_SECRET || ''
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ingest-vademecum` : ''
const CHUNK_TARGET = 1100
const CHUNK_OVERLAP = 140
const BATCH_SIZE = 100

const SECTION_TERMS = new Set([
  'Prescriber Highlights',
  'Uses/Indications',
  'Doses',
  'Contraindications/Precautions/Warnings',
  'Adverse Effects',
  'Drug Interactions',
  'Pharmacology/Actions',
  'Pharmacokinetics',
  'Monitoring',
  'Overdose/Acute Toxicity',
  'Client Information',
  'Chemistry/Synonyms',
  'Storage/Stability',
  'Withdrawal Times',
])

function parseArgs(argv) {
  const result = { source: DEFAULT_MD_PATH, clear: false, append: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--clear') result.clear = true
    if (arg === '--append') result.append = true
    if (arg === '--dry-run') result.dryRun = true
    if (arg === '--source' && argv[i + 1]) {
      result.source = argv[i + 1]
      i++
    }
  }
  return result
}

function normalizeLine(line) {
  return line.replace(/\s+/g, ' ').trim()
}

function isLikelyDrugHeading(line) {
  const clean = normalizeLine(line)
  if (clean.length < 3 || clean.length > 90) return false
  if (SECTION_TERMS.has(clean)) return false
  if (/^(DOGS|CATS|HORSES|CATTLE|SHEEP|GOATS|BIRDS|RABBITS|FERRETS|SWINE):?$/.test(clean)) return false
  if (/^\d+$/.test(clean)) return false
  if (/[.!?]$/.test(clean)) return false
  const letters = clean.replace(/[^A-Za-z]/g, '')
  if (letters.length < 3) return false
  const upper = (letters.match(/[A-Z]/g) || []).length / letters.length
  const titleCase = /^[A-Z][A-Za-z0-9 /,()+.'-]+$/.test(clean)
  return upper > 0.72 || titleCase
}

function hasNearbyClinicalSection(lines, index) {
  const end = Math.min(lines.length, index + 45)
  for (let i = index + 1; i < end; i++) {
    if (SECTION_TERMS.has(lines[i])) return true
  }
  return false
}

function firstMonographIndex(lines) {
  const knownStarts = ['Acepromazine', 'Acetaminophen', 'Acetazolamide']
  for (let i = 900; i < lines.length; i++) {
    if (knownStarts.includes(lines[i]) && hasNearbyClinicalSection(lines, i)) return i
  }
  return 0
}

function collectDrugNamesFromToc(lines) {
  const names = new Set()
  const tocText = lines.slice(750, 1150).join('\n')
  const re = /([A-Z][A-Za-z0-9/(),.' -]{2,}?)\s+\d{1,4}/g
  let match
  while ((match = re.exec(tocText)) !== null) {
    const name = normalizeLine(match[1]).replace(/^[0-9 ]+/, '')
    if (
      name.length >= 3 &&
      name.length <= 80 &&
      !SECTION_TERMS.has(name) &&
      !/^(Table|Appendix|Index|Chapter|Edition|About|References)$/i.test(name)
    ) {
      names.add(name)
    }
  }
  return names
}

function splitEntry(text, drugName, entryIndex, chunks) {
  const cleanText = text.replace(/\s+/g, ' ').trim()
  if (cleanText.length < 40) return

  if (cleanText.length <= CHUNK_TARGET) {
    chunks.push({ drug_name: drugName, content: cleanText, chunk_index: entryIndex * 100 })
    return
  }

  let pos = 0
  let sub = 0
  while (pos < cleanText.length) {
    const end = Math.min(pos + CHUNK_TARGET, cleanText.length)
    const chunk = cleanText.slice(pos, end).trim()
    if (chunk.length >= 40) {
      chunks.push({ drug_name: drugName, content: chunk, chunk_index: entryIndex * 100 + sub })
      sub++
    }
    if (end === cleanText.length) break
    pos = end - CHUNK_OVERLAP
  }
}

function buildChunks(markdown) {
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizeLine)

  const startIndex = firstMonographIndex(lines)
  const tocDrugNames = collectDrugNamesFromToc(lines)
  const chunks = []
  let currentDrug = null
  let currentLines = []
  let entryIndex = 0

  function flush() {
    if (!currentLines.length) return
    splitEntry(currentLines.join(' '), currentDrug, entryIndex, chunks)
    entryIndex++
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (
      isLikelyDrugHeading(line) &&
      hasNearbyClinicalSection(lines, i) &&
      (tocDrugNames.size === 0 || tocDrugNames.has(line))
    ) {
      flush()
      currentDrug = line
      currentLines = [line]
    } else if (currentDrug) {
      currentLines.push(line)
    }
  }
  flush()

  return chunks.filter(c =>
    c.drug_name &&
    c.content.length >= 40 &&
    !/^chapter|^index|^appendix|^references$/i.test(c.drug_name)
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(args.source)) {
    console.error(`ERROR: MD no encontrado en: ${args.source}`)
    process.exit(1)
  }

  const markdown = fs.readFileSync(args.source, 'utf8')
  const chunks = buildChunks(markdown)
  console.log(`MD: ${args.source}`)
  console.log(`Chunks generados: ${chunks.length}`)
  console.log(`Farmacos detectados: ${new Set(chunks.map(c => c.drug_name)).size}`)

  if (!chunks.length) {
    console.error('ERROR: no se generaron chunks validos.')
    process.exit(1)
  }

  if (args.dryRun) {
    console.log('Dry run: no se enviaron datos a Supabase.')
    console.log('Primeros chunks:')
    for (const chunk of chunks.slice(0, 5)) {
      console.log(`- ${chunk.drug_name}: ${chunk.content.slice(0, 140)}...`)
    }
    return
  }

  if (args.clear && args.append) {
    console.error('ERROR: usa solo uno: --clear o --append.')
    process.exit(1)
  }

  if (!args.clear && !args.append) {
    console.error('ERROR: para proteger el plan free de Supabase, la ingesta requiere --clear o --append.')
    console.error('Usa --clear para reemplazar el vademecum existente sin duplicar filas.')
    console.error('Usa --append solo si realmente quieres agregar chunks a los existentes.')
    process.exit(1)
  }

  if (!SUPABASE_URL || !INGEST_SECRET) {
    console.error('ERROR: faltan VITE_SUPABASE_URL/SUPABASE_URL e INGEST_SECRET.')
    process.exit(1)
  }

  let inserted = 0
  let first = true
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const batchNo = Math.floor(i / BATCH_SIZE) + 1
    const total = Math.ceil(chunks.length / BATCH_SIZE)
    process.stdout.write(`Lote ${batchNo}/${total}... `)

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-secret': INGEST_SECRET,
      },
      body: JSON.stringify({ chunks: batch, clear: first && args.clear }),
    })

    first = false
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
    if (!response.ok && response.status !== 207) {
      console.error(`FALLO ${JSON.stringify(result)}`)
      process.exit(1)
    }
    inserted += result.inserted || 0
    console.log(`OK (${result.inserted || 0})`)
  }

  console.log(`Ingesta MD completada. Insertados: ${inserted}`)
}

main().catch(error => {
  console.error('Error fatal:', error)
  process.exit(1)
})
