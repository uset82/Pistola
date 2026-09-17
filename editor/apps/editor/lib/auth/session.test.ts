import assert from 'node:assert/strict'
import test from 'node:test'

import { isAuthConfigured } from './config'

test('auth configuration helper reflects the required env vars', () => {
  const previousPostgresUrl = process.env.POSTGRES_URL
  const previousAuthSecret = process.env.BETTER_AUTH_SECRET

  process.env.POSTGRES_URL = ''
  process.env.BETTER_AUTH_SECRET = ''
  assert.equal(isAuthConfigured(), false)

  process.env.POSTGRES_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'
  process.env.BETTER_AUTH_SECRET = 'secret'
  assert.equal(isAuthConfigured(), true)

  process.env.POSTGRES_URL = previousPostgresUrl
  process.env.BETTER_AUTH_SECRET = previousAuthSecret
})

