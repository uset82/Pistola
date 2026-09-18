import { NextResponse } from 'next/server'

const DEFAULT_PUBLIC_ORIGINS = [
  'https://pistola.canner.app',
  'https://pistola.app.canner.ca',
  'https://pistolacodex.canner.app',
  'https://pistolacodex.app.canner.ca',
]

const getAllowedOrigins = () =>
  [
    ...DEFAULT_PUBLIC_ORIGINS,
    ...(process.env.PISTOLA_PUBLIC_EDITOR_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ]

const getRequestOrigin = (request: Request) => request.headers.get('origin')?.replace(/\/+$/, '') || null

const isChatGptSiteOrigin = (origin: string) => {
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && (url.hostname === 'chatgpt.site' || url.hostname.endsWith('.chatgpt.site'))
  } catch {
    return false
  }
}

export const isPistolaCorsOriginAllowed = (request: Request) => {
  const origin = getRequestOrigin(request)
  if (!origin) return false
  return getAllowedOrigins().includes(origin) || isChatGptSiteOrigin(origin)
}

export const withPistolaCors = <T extends Response>(request: Request, response: T): T => {
  const origin = getRequestOrigin(request)
  if (!origin || !isPistolaCorsOriginAllowed(request)) return response

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  response.headers.set('Access-Control-Expose-Headers', 'Content-Disposition')
  response.headers.append('Vary', 'Origin')
  return response
}

export const pistolaCorsPreflight = (request: Request) =>
  isPistolaCorsOriginAllowed(request)
    ? withPistolaCors(request, new NextResponse(null, { status: 204 }))
    : NextResponse.json({ error: 'Origin is not allowed.' }, { status: 403 })
