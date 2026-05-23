import { DRUGS } from '../data/drugs'

export async function searchDrugWithAI(name) {
  const response = await fetch('/api/atlas-drug', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Atlas-Client': 'atlas-pharmacology',
    },
    body: JSON.stringify({ term: name }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `Error HTTP ${response.status}`)
  }
  return data
}

export async function validateDrugWithAI(name) {
  const q = name.trim().toLowerCase()
  const inCatalog = DRUGS.some(d => d.name.toLowerCase() === q || d.latin.toLowerCase() === q)
  if (inCatalog) return { esFarmaco: true }

  try {
    const result = await searchDrugWithAI(name)
    return { esFarmaco: !!result?.encontrado }
  } catch {
    return { esFarmaco: false }
  }
}

export function relatedDrugs(name) {
  const drug = DRUGS.find(d => d.name.toLowerCase() === name.toLowerCase())
  if (!drug) return []
  return DRUGS.filter(d => d.id !== drug.id && d.category === drug.category).slice(0, 5)
}
