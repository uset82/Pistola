import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dimensionsFromBounds,
  fileLooksLikeGltf,
  floorOffsetFromBounds,
  isGltfFileName,
  isGltfJsonDocument,
  isGltfMagic,
  textLooksLikeGltf,
} from './import-glb'

test('isGltfFileName accepts glb and gltf only', () => {
  assert.equal(isGltfFileName('hero.glb'), true)
  assert.equal(isGltfFileName('hero.GLTF'), true)
  assert.equal(isGltfFileName('scene.pistola.json'), false)
  assert.equal(isGltfFileName('notes.txt'), false)
})

test('isGltfMagic matches the binary glTF header', () => {
  assert.equal(isGltfMagic(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])), true)
  assert.equal(isGltfMagic(new Uint8Array([0x7b, 0x22, 0x6e])), false)
  assert.equal(isGltfMagic(new Uint8Array([0x67, 0x6c])), false)
})

test('isGltfJsonDocument ignores Pistola node maps', () => {
  assert.equal(
    isGltfJsonDocument({
      asset: { version: '2.0' },
      meshes: [],
      nodes: [{ mesh: 0 }],
    }),
    true,
  )
  assert.equal(
    isGltfJsonDocument({
      asset: { version: '2.0' },
      meshes: [],
      nodes: { wall_1: { id: 'wall_1', type: 'wall' } },
    }),
    false,
  )
  assert.equal(isGltfJsonDocument({ projectName: 'House', nodes: {} }), false)
})

test('textLooksLikeGltf catches a binary file read as text', () => {
  assert.equal(textLooksLikeGltf('glTF\u0000\u0000\u0002 w'), true)
  assert.equal(textLooksLikeGltf('  glTF'), true)
  assert.equal(textLooksLikeGltf('{"nodes":{}}'), false)
})

test('fileLooksLikeGltf uses the extension or the glTF magic bytes', async () => {
  const named = new File([new Uint8Array([1, 2, 3, 4])], 'chair.glb')
  assert.equal(await fileLooksLikeGltf(named), true)

  const binary = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2])], 'model.bin')
  assert.equal(await fileLooksLikeGltf(binary), true)

  const json = new File(['{"nodes":{}}'], 'house.json', { type: 'application/json' })
  assert.equal(await fileLooksLikeGltf(json), false)
})

test('floorOffsetFromBounds sits the mesh on the floor at its footprint center', () => {
  const bounds = {
    min: { x: -1, y: 2, z: 0 },
    max: { x: 3, y: 6, z: 4 },
  }
  assert.deepEqual(floorOffsetFromBounds(bounds), [-1, -2, -2])
  assert.deepEqual(dimensionsFromBounds(bounds), [4, 4, 4])
  assert.equal(
    dimensionsFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    }),
    null,
  )
  assert.equal(
    dimensionsFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: Number.NaN, y: 1, z: 1 },
    }),
    null,
  )
})
