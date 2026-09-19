export type NamedTarget = 'local' | 'canner' | 'sites'

export const DEFAULT_URLS: Record<NamedTarget, string> = {
  local: process.env.PISTOLA_BASE_URL ?? 'http://127.0.0.1:3002/workspace',
  canner: process.env.PISTOLA_CANNER_URL ?? 'https://pistola.canner.app/workspace',
  sites:
    process.env.PISTOLA_SITES_URL ??
    'https://pistolacodex-cad.gi-o-vi-n-ch-5540.chatgpt.site/workspace',
}

export const resolveTarget = (raw = process.env.PISTOLA_TARGET ?? 'local') => {
  const value = raw.trim()
  if (value === 'local' || value === 'canner' || value === 'sites') {
    return { name: value, url: DEFAULT_URLS[value] }
  }
  if (/^https?:\/\//i.test(value)) {
    return { name: 'custom' as const, url: value }
  }
  throw new Error(
    `PISTOLA_TARGET must be local, canner, sites, or a URL. Received "${value}".`,
  )
}

export const workspaceUrl = (url: string) => {
  const parsed = new URL(url)
  if (parsed.pathname === '/' || parsed.pathname === '') {
    parsed.pathname = '/workspace'
  }
  return parsed.toString()
}
