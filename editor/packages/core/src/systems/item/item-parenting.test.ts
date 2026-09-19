import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldLiftItemToSlab } from './item-parenting'

test('items parented to CAD bodies or instances are not lifted to the slab', () => {
  assert.equal(shouldLiftItemToSlab(undefined), true)
  assert.equal(shouldLiftItemToSlab({ type: 'level' }), true)
  assert.equal(shouldLiftItemToSlab({ type: 'item' }), false)
  assert.equal(shouldLiftItemToSlab({ type: 'cad-body' }), false)
  assert.equal(shouldLiftItemToSlab({ type: 'cad-instance' }), false)
})
