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

const getSessionCookieOptions = (expires: Date) => ({
  expires,
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
})

const toTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('base64url')

const safeCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  )
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

const LOCAL_DEV_SESSION: AuthSession = {
  user: {
    id: 'local-user',
    email: 'user@pistola.local',
  },
  sessionId: 'local-session',
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
}

export const getCurrentAuthSession = async (): Promise<AuthSession | null> => {
  return LOCAL_DEV_SESSION
}

