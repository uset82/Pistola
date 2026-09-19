export const FORBIDDEN_HOSTS = ['openrouter.ai', 'api.openai.com']
export const FORBIDDEN_PATHS = ['/api/assistant/', '/api/ai/test', '/api/cad/brief']

export type ForbiddenHit = {
  method: string
  url: string
  reason: string
}

export const isForbiddenRequest = (method: string, rawUrl: string): ForbiddenHit | null => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()
  if (FORBIDDEN_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`))) {
    return { method, url: rawUrl, reason: `host ${host}` }
  }
  if (FORBIDDEN_PATHS.some((prefix) => parsed.pathname.startsWith(prefix))) {
    return { method, url: rawUrl, reason: `path ${parsed.pathname}` }
  }
  if (parsed.pathname === '/api/mac/jobs' && method.toUpperCase() === 'POST') {
    return { method, url: rawUrl, reason: 'POST /api/mac/jobs' }
  }
  return null
}
