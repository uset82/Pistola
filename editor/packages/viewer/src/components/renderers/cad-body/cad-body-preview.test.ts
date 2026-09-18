import assert from 'node:assert/strict'
import test from 'node:test'

import { isRenderableCadAssetUrl, shouldUseCadBodyAssetPreview } from './cad-body-preview'

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
