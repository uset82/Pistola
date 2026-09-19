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

test('createNewProject resets name and marks project saved', () => {
  useProjectStore.getState().setProjectName('Before Reset')
  useProjectStore.getState().markDirty(true)

  const success = createNewProject('Fresh Start')
  assert.equal(success, true)
  assert.equal(useProjectStore.getState().projectName, 'Fresh Start')
  assert.equal(useProjectStore.getState().isDirty, false)
})
