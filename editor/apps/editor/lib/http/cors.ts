import { NextResponse } from 'next/server'

const getAllowedOrigins = () =>
  (process.env.PISTOLA_PUBLIC_EDITOR_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)

const getRequestOrigin = (request: Request) => request.headers.get('origin')?.replace(/\/+$/, '') || null

export const isPistolaCorsOriginAllowed = (request: Request) => {
  const origin = getRequestOrigin(request)
  return Boolean(origin && getAllowedOrigins().includes(origin))
}

export const withPistolaCors = <T extends Response>(request: Request, response: T): T => {
  const origin = getRequestOrigin(request)
  if (!origin || !isPistolaCorsOriginAllowed(request)) return response

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Expose-Headers', 'Content-Disposition')
  response.headers.append('Vary', 'Origin')
  return response
}

export const pistolaCorsPreflight = (request: Request) =>
  isPistolaCorsOriginAllowed(request)
    ? withPistolaCors(request, new NextResponse(null, { status: 204 }))
    : NextResponse.json({ error: 'Origin is not allowed.' }, { status: 403 })
