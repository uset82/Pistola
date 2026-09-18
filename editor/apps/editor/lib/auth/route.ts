import 'server-only'

import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { isAuthConfigured, isLocalUnauthenticatedAccessEnabled } from './config'
import { type AuthSession, getCurrentAuthSession } from './session'

export const getAuthBody = async (request: Request) => {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export const unauthorizedAuthResponse = () =>
  NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

export const unavailableAuthResponse = () =>
  NextResponse.json(
    {
      error: 'Auth is not configured. Set POSTGRES_URL and BETTER_AUTH_SECRET.',
    },
    { status: 503 },
  )

const readBearerToken = (request?: Request) => {
  const header =
    request?.headers.get('authorization') ||
    request?.headers.get('Authorization') ||
    null
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

const isLocalApiTokenAuthorized = async (request?: Request) => {
  if (process.env.NODE_ENV === 'production') return false

  const expected = process.env.PISTOLA_LOCAL_API_TOKEN?.trim()
  if (!expected) return false
  const provided = readBearerToken(request)
  if (provided && provided === expected) return true

  // Fallback for routes that don't forward the Request object.
  try {
    const headerStore = await headers()
    const authorization = headerStore.get('authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return Boolean(match?.[1] && match[1].trim() === expected)
  } catch {
    return false
  }
}

export const requireRouteAuthSession = async (
  request?: Request,
): Promise<
  | { response: NextResponse; session: null; isLocalOperator: false }
  | { response: null; session: AuthSession; isLocalOperator: boolean }
> => {
  if (await isLocalApiTokenAuthorized(request)) {
    return {
      response: null,
      session: {
        user: { id: 'local-mcp', email: 'local-mcp@pistola.local' },
        sessionId: 'local-mcp',
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      isLocalOperator: true,
    }
  }

  const session = await getCurrentAuthSession()
  if (session) {
    return {
      response: null,
      session,
      isLocalOperator: false,
    }
  }

  if (!isAuthConfigured() || isLocalUnauthenticatedAccessEnabled()) {
    return {
      response: null,
      session: {
        user: { id: 'local-mcp', email: 'local-mcp@pistola.local' },
        sessionId: 'local-mcp',
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      isLocalOperator: true,
    }
  }

  return {
    response: unauthorizedAuthResponse(),
    session: null,
    isLocalOperator: false,
  }
}
