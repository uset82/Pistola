const DEFAULT_AUTH_COOKIE_NAME = 'pistola_session'
const DEFAULT_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30

type AuthAccessEnvironment = {
  BETTER_AUTH_SECRET?: string
  NODE_ENV?: string
  PISTOLA_ALLOW_UNAUTHENTICATED_API?: string
  PISTOLA_LOCAL_API_TOKEN?: string
  POSTGRES_URL?: string
}

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

export const isAuthConfigured = (environment: AuthAccessEnvironment = process.env) =>
  Boolean(environment.POSTGRES_URL?.trim() && environment.BETTER_AUTH_SECRET?.trim())

export const isLocalUnauthenticatedAccessEnabled = (
  environment: AuthAccessEnvironment = process.env,
) =>
  environment.NODE_ENV !== 'production' &&
  !isAuthConfigured(environment) &&
  !environment.PISTOLA_LOCAL_API_TOKEN?.trim() &&
  environment.PISTOLA_ALLOW_UNAUTHENTICATED_API === '1'
