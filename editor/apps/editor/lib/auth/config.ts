const DEFAULT_AUTH_COOKIE_NAME = 'pistola_session'
const DEFAULT_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30

export const getAuthConfig = () => {
  const postgresUrl = process.env.POSTGRES_URL?.trim()
  const sessionSecret = process.env.BETTER_AUTH_SECRET?.trim()

  if (!postgresUrl) {
    throw new Error('Auth is not configured. Set POSTGRES_URL.')
  }

  if (!sessionSecret) {
    throw new Error('Auth is not configured. Set BETTER_AUTH_SECRET.')
  }

  return {
    postgresUrl,
    sessionSecret,
    cookieName: DEFAULT_AUTH_COOKIE_NAME,
    sessionDurationMs: DEFAULT_SESSION_DURATION_MS,
  }
}

export const isAuthConfigured = () =>
  Boolean(process.env.POSTGRES_URL?.trim() && process.env.BETTER_AUTH_SECRET?.trim())
