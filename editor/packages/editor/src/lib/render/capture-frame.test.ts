import assert from 'node:assert/strict'
import test from 'node:test'

import { boundsFromBoxes, clampCaptureSize, poseForView } from './capture-frame'

test('capture size stays inside the long-edge cap', () => {
  assert.deepEqual(clampCaptureSize(768, 512), { width: 768, height: 512 })
  assert.deepEqual(clampCaptureSize(3136, 1568), { width: 1568, height: 784 })
})

test('a view pose looks at the part bounds and keeps a positive distance', () => {
  const bounds = boundsFromBoxes([
    { id: 'box', box: { min: [0, 0, 0], max: [2, 1, 1] } },
  ])
  assert.ok(bounds)
  const front = poseForView('front', bounds)
  assert.equal(front.projection, 'orthographic')
  assert.ok(front.position[2] > front.target[2])
  assert.equal(front.target[0], 1)
  const iso = poseForView('iso', bounds)
  assert.equal(iso.projection, 'perspective')
  assert.ok(iso.position[0] > iso.target[0])
  assert.ok(iso.position[1] > iso.target[1])
})
