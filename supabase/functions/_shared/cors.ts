const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .map((s: string) => s.replace(/\/+$/, ''))
  .filter(Boolean)

function isDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function isVercelPreviewOfProject(origin: string): boolean {
  const main = ALLOWED_ORIGINS.find((o: string) => o.endsWith('.vercel.app'))
  if (!main) return false
  const projectMatch = main.match(/^https?:\/\/([^.]+)\.vercel\.app/i)
  if (!projectMatch) return false
  const project = projectMatch[1]
  const re = new RegExp(`^https://${project}(-[a-z0-9-]+)?\\.vercel\\.app$`, 'i')
  return re.test(origin)
}

function pickOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.includes('*')) return '*'
  if (ALLOWED_ORIGINS.includes(origin)) return origin
  if (ALLOWED_ORIGINS.length === 0 && isDevOrigin(origin)) return origin
  if (isVercelPreviewOfProject(origin)) return origin
  return 'null'
}

export function buildCors(req: Request, methods = 'POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin':  pickOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    'Vary':                         'Origin',
  }
}

export function json(req: Request, data: unknown, status = 200, methods = 'POST, OPTIONS') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCors(req, methods), 'Content-Type': 'application/json' },
  })
}
