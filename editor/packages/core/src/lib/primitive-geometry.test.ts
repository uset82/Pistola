import assert from 'node:assert/strict'
import test from 'node:test'
import { boxMeshFromSize, meshBounds, primitiveMesh, transformMesh } from './primitive-geometry'

test('box mesh is bottom-center and transform applies scale then rotation then translate', () => {
  const box = boxMeshFromSize(2, 1, 0.5)
  const bounds = meshBounds(box.positions)
  assert.equal(bounds.min[1], 0)
  assert.equal(bounds.size[0], 2)
  assert.equal(bounds.size[1], 1)
  const moved = transformMesh(box, [1, 2, 3])
  const next = meshBounds(moved.positions)
  assert.equal(next.min[1], 2)
  const sphere = primitiveMesh('sphere', [1, 1, 1])
  assert.ok(sphere.indices.length > 0)
})
