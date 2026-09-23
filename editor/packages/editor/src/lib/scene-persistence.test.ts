import assert from 'node:assert/strict'
import test from 'node:test'

import { compactSceneForStorage, rehydrateSceneMeshes, saveSceneToLocalStorage, sceneSaveWarning } from './scene'

const boxScene = {
  nodes: {
    body: {
      type: 'cad-body',
      preview: {
        primitive: 'mesh',
        spec: { op: 'box', size: [1, 0.5, 0.25] },
        positions: [0, 1, 2],
        indices: [0, 1, 2],
        normals: [0, 1, 0],
      },
    },
  },
  rootNodeIds: ['body'],
}

test('compact drops mesh buffers and rehydrate rebuilds them from the spec', () => {
  const compact = compactSceneForStorage(boxScene)
  const preview = (compact.nodes.body as { preview: { positions: number[]; normals?: number[]; spec: { op: string } } }).preview
  assert.deepEqual(preview.positions, [])
  assert.equal(preview.normals, undefined)
  assert.equal(preview.spec.op, 'box')
  assert.deepEqual((boxScene.nodes.body.preview.positions), [0, 1, 2])
  const hydrated = rehydrateSceneMeshes(compact)
  const rebuilt = (hydrated.nodes.body as { preview: { positions: number[]; indices: number[] } }).preview
  assert.ok(rebuilt.positions.length > 8)
  assert.ok(rebuilt.indices.length > 8)
})

test('a failed local save surfaces a warning instead of disappearing', () => {
  const previousStorage = globalThis.localStorage
  const previousIndexedDb = globalThis.indexedDB
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota exceeded')
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
  try {
    assert.throws(() => saveSceneToLocalStorage({ nodes: {}, rootNodeIds: [] }), /quota exceeded/)
    assert.match(sceneSaveWarning() ?? '', /quota exceeded/)
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousStorage })
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: previousIndexedDb })
  }
})
