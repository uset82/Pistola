import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cadBodyHasRenderableMesh,
  cadBodyPbr,
  cadMeshGeometryFromPreview,
  isRenderableCadAssetUrl,
  shouldUseCadBodyAssetPreview,
} from './cad-body-preview'

test('GLB artifact URLs are treated as renderable', () => {
  assert.equal(isRenderableCadAssetUrl('/api/mac/artifacts/job/part.glb'), true)
  assert.equal(isRenderableCadAssetUrl('https://pistolacodex.canner.app/api/mac/artifacts/job/part.gltf'), true)
  assert.equal(isRenderableCadAssetUrl('/api/mac/artifacts/job/part.step'), false)
})

test('mock MAC previews stay on the primitive box instead of loading a fake GLB', () => {
  assert.equal(
    shouldUseCadBodyAssetPreview({
      warnings: ['Hosted MAC preview used the bundled mock runtime.'],
      artifacts: { previewUrl: 'https://pistolacodex.canner.app/api/mac/artifacts/job/part.glb' },
      metadata: { cadEngine: 'mac', macMetadata: { engine: 'mac-mock' } },
    }),
    false,
  )
})

test('real GLB previews still load when the helper is not a mock', () => {
  assert.equal(
    shouldUseCadBodyAssetPreview({
      warnings: [],
      artifacts: { previewUrl: '/api/mac/artifacts/job/part.glb' },
      metadata: { cadEngine: 'mac' },
    }),
    true,
  )
})

test('architecture instances reuse the source CAD mesh and per-body PBR', () => {
  const preview = {
    primitive: 'mesh' as const,
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    roughness: 0.2,
    metalness: 0.8,
    opacity: 0.5,
  }
  assert.equal(cadBodyHasRenderableMesh(preview), true)
  assert.equal(cadBodyHasRenderableMesh({ primitive: 'box', dimensions: [1, 1, 1] }), false)
  const geometry = cadMeshGeometryFromPreview(preview)
  assert.deepEqual(geometry?.normals, preview.normals)
  const pbr = cadBodyPbr({ roughness: 0.1, preview })
  assert.equal(pbr.roughness, 0.1)
  assert.equal(pbr.metalness, 0.8)
  assert.equal(pbr.opacity, 0.5)
  assert.equal(pbr.transparent, true)
})
