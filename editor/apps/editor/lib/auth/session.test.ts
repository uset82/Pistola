import assert from 'node:assert/strict'
import test from 'node:test'

import { isAuthConfigured, isLocalUnauthenticatedAccessEnabled } from './config'

test('auth configuration and local development access require explicit configuration', () => {
  const localGuestEnvironment = {
    BETTER_AUTH_SECRET: '',
    NODE_ENV: 'test',
    PISTOLA_ALLOW_UNAUTHENTICATED_API: '1',
    PISTOLA_LOCAL_API_TOKEN: '',
    POSTGRES_URL: '',
  }

  assert.equal(isAuthConfigured(localGuestEnvironment), false)
  assert.equal(isLocalUnauthenticatedAccessEnabled(localGuestEnvironment), true)
  assert.equal(
    isLocalUnauthenticatedAccessEnabled({
      ...localGuestEnvironment,
      NODE_ENV: 'production',
    }),
    false,
  )
  assert.equal(
    isLocalUnauthenticatedAccessEnabled({
      ...localGuestEnvironment,
      PISTOLA_LOCAL_API_TOKEN: 'local-token',
    }),
    false,
  )

  const configuredEnvironment = {
    ...localGuestEnvironment,
    BETTER_AUTH_SECRET: 'secret',
    POSTGRES_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  }
  assert.equal(isAuthConfigured(configuredEnvironment), true)
  assert.equal(isLocalUnauthenticatedAccessEnabled(configuredEnvironment), false)
})
