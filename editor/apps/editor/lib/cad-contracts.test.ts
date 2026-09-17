import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeCadArtifactUrl,
  normalizeCadHelperHealth,
  normalizeCadJobCreateResponse,
  normalizeCadJobResult,
} from '@pascal-app/editor/lib/cad/contracts'

test('normalizeCadHelperHealth standardizes helper identity fields and helperUrl fallback', () => {
  const normalized = normalizeCadHelperHealth(
    {
      status: 'ok',
      runtime: 'python',
      engine: 'freecad-stub',
      version: '0.1.0',
    },
    'http://127.0.0.1:7878',
  )

  assert.deepEqual(normalized, {
    status: 'ready',
    runtime: 'python',
    engine: 'freecad-stub',
    version: '0.1.0',
    helperUrl: 'http://127.0.0.1:7878',
  })
})

test('normalizeCadJobCreateResponse maps queued helper jobs onto the canonical pending state', () => {
  assert.deepEqual(normalizeCadJobCreateResponse({ jobId: 'cadjob_1', status: 'queued' }), {
    jobId: 'cadjob_1',
    status: 'pending',
  })
})

test('normalizeCadArtifactUrl rewrites helper artifact paths to the app proxy route', () => {
  assert.equal(
    normalizeCadArtifactUrl('/v1/cad/artifacts/cadjob_1-extrude.glb'),
    '/api/cad/artifacts/cadjob_1-extrude.glb',
  )
  assert.equal(
    normalizeCadArtifactUrl('C:\\repo\\cad-helper\\.artifacts\\cadjob_2-import.step'),
    '/api/cad/artifacts/cadjob_2-import.step',
  )
})

test('normalizeCadJobResult keeps helper refs while making preview and export URLs renderable', () => {
  const normalized = normalizeCadJobResult({
    jobId: 'cadjob_1',
    type: 'regenerate',
    status: 'succeeded',
    warnings: [],
    result: {
      preview: {
        primitive: 'box',
        dimensions: [2, 1.2, 1],
        color: '#60a5fa',
      },
      operations: [],
      artifacts: {
        previewUrl: '/v1/cad/artifacts/cadjob_1-extrude.glb',
        previewArtifactRef: 'C:/repo/cad-helper/.artifacts/cadjob_1-extrude.glb',
        cadUrl: '/v1/cad/artifacts/cadjob_1-extrude.fcstd',
        cadArtifactRef: 'C:/repo/cad-helper/.artifacts/cadjob_1-extrude.fcstd',
        exportUrl: '/v1/cad/artifacts/export.step',
      },
    },
  })

  assert.equal(
    normalized.result?.artifacts.previewUrl,
    '/api/cad/artifacts/cadjob_1-extrude.glb',
  )
  assert.equal(
    normalized.result?.artifacts.cadUrl,
    '/api/cad/artifacts/cadjob_1-extrude.fcstd',
  )
  assert.equal(
    normalized.result?.artifacts.exportUrl,
    '/api/cad/artifacts/export.step',
  )
  assert.equal(
    normalized.result?.artifacts.previewArtifactRef,
    'C:/repo/cad-helper/.artifacts/cadjob_1-extrude.glb',
  )
  assert.equal(
    normalized.result?.artifacts.cadArtifactRef,
    'C:/repo/cad-helper/.artifacts/cadjob_1-extrude.fcstd',
  )
})
