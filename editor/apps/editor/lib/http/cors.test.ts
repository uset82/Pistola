import assert from 'node:assert/strict'
import test from 'node:test'

import { isPistolaCorsOriginAllowed } from './cors'

const requestFrom = (origin: string) =>
  new Request('https://pistolacodex.canner.app/api/cad/health', {
    headers: { origin },
  })

test('Canner editor origins are allowed for the Sites CAD bridge', () => {
  assert.equal(isPistolaCorsOriginAllowed(requestFrom('https://pistolacodex.canner.app')), true)
  assert.equal(isPistolaCorsOriginAllowed(requestFrom('https://pistolacodex.app.canner.ca')), true)
})

test('ChatGPT Sites origins are allowed for hosted CAD and MAC jobs', () => {
  assert.equal(
    isPistolaCorsOriginAllowed(requestFrom('https://pistolacodex.gi-o-vi-n-ch-5540.chatgpt.site')),
    true,
  )
})

test('unrelated origins stay blocked', () => {
  assert.equal(isPistolaCorsOriginAllowed(requestFrom('https://evil.example')), false)
})
