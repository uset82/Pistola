import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createNewProject,
  loadProjectFromJson,
  useProjectStore,
} from './project-actions'

test('useProjectStore initializes with default state and updates correctly', () => {
  const state = useProjectStore.getState()
  assert.ok(state.projectName)
  assert.equal(state.isDirty, false)

  state.setProjectName('My Test Project')
  assert.equal(useProjectStore.getState().projectName, 'My Test Project')

  state.markDirty(true)
  assert.equal(useProjectStore.getState().isDirty, true)

  state.markSaved()
  assert.equal(useProjectStore.getState().isDirty, false)
  assert.ok(Number(useProjectStore.getState().lastSaved) > 0)
})

test('loadProjectFromJson parses valid project and rejects invalid structure', () => {
  const validJson = JSON.stringify({
    schemaVersion: 1,
    projectName: 'Loaded House',
    nodes: {
      node_1: { id: 'node_1', type: 'wall' },
    },
    rootNodeIds: ['node_1'],
  })

  const result = loadProjectFromJson(validJson)
  assert.equal(result.success, true)
  assert.equal(useProjectStore.getState().projectName, 'Loaded House')

  const invalidJson = JSON.stringify({
    projectName: 'Corrupted Project',
  })
  const failResult = loadProjectFromJson(invalidJson)
  assert.equal(failResult.success, false)
  assert.ok(failResult.error?.includes('missing nodes'))
})

test('loadProjectFromJson rejects glTF documents and binary glTF text', () => {
  const gltfJson = JSON.stringify({
    asset: { version: '2.0' },
    meshes: [{ primitives: [] }],
    nodes: [{ mesh: 0 }],
  })
  const gltfResult = loadProjectFromJson(gltfJson)
  assert.equal(gltfResult.success, false)
  assert.match(gltfResult.error ?? '', /not a Pistola project/)
  assert.match(gltfResult.error ?? '', /\.glb/)

  const binaryText = 'glTF\u0000\u0000\u0002 not json'
  const binaryResult = loadProjectFromJson(binaryText)
  assert.equal(binaryResult.success, false)
  assert.match(binaryResult.error ?? '', /glTF/)
  assert.match(binaryResult.error ?? '', /\.glb/)

  const arrayNodes = JSON.stringify({ nodes: [{ id: 'node_1' }] })
  const arrayResult = loadProjectFromJson(arrayNodes)
  assert.equal(arrayResult.success, false)
  assert.match(arrayResult.error ?? '', /missing nodes/)
})

test('createNewProject resets name and marks project saved', () => {
  useProjectStore.getState().setProjectName('Before Reset')
  useProjectStore.getState().markDirty(true)

  const success = createNewProject('Fresh Start')
  assert.equal(success, true)
  assert.equal(useProjectStore.getState().projectName, 'Fresh Start')
  assert.equal(useProjectStore.getState().isDirty, false)
})
