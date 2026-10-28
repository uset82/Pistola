import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCadHelperHealth } from './contracts'

test('normalizeCadHelperHealth keeps the fields the helper reports', () => {
  const health = normalizeCadHelperHealth({
    status: 'ready',
    runtime: 'python',
    engine: 'solidcraft',
    version: 'solidcraft-cli 0.25.1',
    helperUrl: 'https://cad-helper.example.com',
  })

  assert.equal(health.status, 'ready')
  assert.equal(health.engine, 'solidcraft')
  assert.equal(health.version, 'solidcraft-cli 0.25.1')
})

test('authRequired survives normalisation', () => {
  // The normalizer builds a fixed shape, so an unnamed field is dropped before
  // any caller sees it. That silently defeated the token-mismatch signal.
  assert.equal(
    normalizeCadHelperHealth({ status: 'ready', authRequired: true }).authRequired,
    true,
  )
  assert.equal(
    normalizeCadHelperHealth({ status: 'ready', authRequired: false }).authRequired,
    false,
  )
})

test('authRequired is absent when the helper does not report it', () => {
  // An older helper predates the field; absent must not read as false, which
  // would claim the helper is open.
  const health = normalizeCadHelperHealth({ status: 'ready', engine: 'freecad' })
  assert.equal('authRequired' in health, false)
})

test('a non-boolean authRequired is ignored rather than coerced', () => {
  const health = normalizeCadHelperHealth({ status: 'ready', authRequired: 'true' })
  assert.equal('authRequired' in health, false)
})

test('an error payload still normalises to the error status', () => {
  const health = normalizeCadHelperHealth({
    status: 'error',
    engine: 'solidcraft',
    error: 'SolidCraft CLI was not found.',
    authRequired: true,
  })

  assert.equal(health.status, 'error')
  assert.equal(health.error, 'SolidCraft CLI was not found.')
  assert.equal(health.authRequired, true)
})
