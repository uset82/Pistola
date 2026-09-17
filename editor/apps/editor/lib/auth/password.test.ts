import assert from 'node:assert/strict'
import test from 'node:test'

import { hashAuthPassword, verifyAuthPassword } from './password'

test('hashAuthPassword produces a verifiable hash', async () => {
  const password = 'correct horse battery staple'
  const hash = await hashAuthPassword(password)

  assert.equal(await verifyAuthPassword(password, hash), true)
  assert.equal(await verifyAuthPassword('wrong password', hash), false)
})

