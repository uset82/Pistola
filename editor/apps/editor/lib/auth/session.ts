import 'server-only'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

import { getAuthConfig, isAuthConfigured } from './config'
import {
  createAuthSessionRecord,
  deleteAuthSessionByTokenHash,
  deleteExpiredAuthSessions,
  getAuthSessionByTokenHash,
} from './db'

export type AuthSession = {
  user: {
    id: string
    email: string
  }
  sessionId: string
  expiresAt: Date
}

const getSessionCookieOptions = (expires: Date) => {
  // The public Sites editor is hosted on a different origin. When that bridge
  // is deliberately configured, permit its authenticated fetches; otherwise
  // retain the safer same-site default used by the standalone editor.
  const crossOriginEditorEnabled = Boolean(process.env.PISTOLA_PUBLIC_EDITOR_ORIGIN?.trim())

  return {
    expires,
    httpOnly: true,
    path: '/',
    sameSite: (crossOriginEditorEnabled ? 'none' : 'lax') as 'none' | 'lax',
    secure: process.env.NODE_ENV === 'production' || crossOriginEditorEnabled,
  }
}

const toTokenHash = (token: string) => createHash('sha256').update(token).digest('base64url')

const safeCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const signSessionToken = (token: string) =>
  `${token}.${createHmac('sha256', getAuthConfig().sessionSecret).update(token).digest('base64url')}`

const parseSignedSessionToken = (cookieValue?: string | null) => {
  if (!cookieValue) return null

  const separatorIndex = cookieValue.lastIndexOf('.')
  if (separatorIndex <= 0) return null

  const token = cookieValue.slice(0, separatorIndex)
  const signature = cookieValue.slice(separatorIndex + 1)
  const expectedSignature = createHmac('sha256', getAuthConfig().sessionSecret)
    .update(token)
    .digest('base64url')

  return safeCompare(signature, expectedSignature) ? token : null
}

export const setCurrentAuthSession = async (userId: string) => {
  const { cookieName, sessionDurationMs } = getAuthConfig()
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionDurationMs)

  await createAuthSessionRecord(userId, toTokenHash(rawToken), expiresAt)

  const cookieStore = await cookies()
  cookieStore.set(cookieName, signSessionToken(rawToken), getSessionCookieOptions(expiresAt))

  return expiresAt
}

export const clearCurrentAuthSession = async () => {
  if (!isAuthConfigured()) return

  const { cookieName } = getAuthConfig()
  const cookieStore = await cookies()
  const rawToken = parseSignedSessionToken(cookieStore.get(cookieName)?.value)

  if (rawToken) {
    await deleteAuthSessionByTokenHash(toTokenHash(rawToken))
  }

  cookieStore.set(cookieName, '', getSessionCookieOptions(new Date(0)))
}

export const getCurrentAuthSession = async (): Promise<AuthSession | null> => {
  if (!isAuthConfigured()) return null

  const { cookieName } = getAuthConfig()
  const cookieStore = await cookies()
  const rawToken = parseSignedSessionToken(cookieStore.get(cookieName)?.value)
  if (!rawToken) return null

  const tokenHash = toTokenHash(rawToken)
  const record = await getAuthSessionByTokenHash(tokenHash)
  if (!record) return null

  const expiresAt = new Date(record.expires_at)
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    await deleteAuthSessionByTokenHash(tokenHash)
    await deleteExpiredAuthSessions()
    return null
  }

  return {
    user: {
      id: record.user_id,
      email: record.email,
    },
    sessionId: record.session_id,
    expiresAt,
  }
}
