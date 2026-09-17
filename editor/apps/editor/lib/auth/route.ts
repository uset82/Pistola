import 'server-only'

import { NextResponse } from 'next/server'

import { isAuthConfigured } from './config'
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

export const requireRouteAuthSession = async (): Promise<
  { response: NextResponse; session: null } | { response: null; session: AuthSession }
> => {
  const session = await getCurrentAuthSession()
  if (session) {
    return {
      response: null,
      session,
    }
  }

  if (!isAuthConfigured()) {
    return {
      response: unavailableAuthResponse(),
      session: null,
    }
  }

  return {
    response: unauthorizedAuthResponse(),
    session: null,
  }
}
