import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAssistantActionSequence } from './sequence-validation'

test('validateAssistantActionSequence rejects references to nodes deleted earlier in the same plan', () => {
  const result = validateAssistantActionSequence([
    { type: 'delete_target', nodeId: 'roof_old' },
    { type: 'rename_node', nodeId: 'roof_old', name: 'Dog House Roof' },
  ])

  assert.equal(result.valid, false)
  assert.equal(result.issues[0]?.code, 'deleted-target-reference')
  assert.match(result.issues[0]?.message ?? '', /deleted earlier in this reviewed plan/i)
})

test('validateAssistantActionSequence rejects unresolved forward references', () => {
  const result = validateAssistantActionSequence([
    {
      type: 'place_door',
      wallId: '$ref_wall_0',
      localX: 0.5,
    },
  ])

  assert.equal(result.valid, false)
  assert.equal(result.issues[0]?.code, 'missing-forward-ref')
  assert.match(result.issues[0]?.message ?? '', /before any earlier creating action defines that refId/i)
})

test('validateAssistantActionSequence rejects implicit target drift after a creator action', () => {
  const result = validateAssistantActionSequence([
    {
      type: 'create_level',
      refId: '$ref_level_0',
      name: 'Level 1',
      level: 1,
    },
    {
      type: 'create_wall',
      start: [0, 0],
      end: [4, 0],
    },
  ])

  assert.equal(result.valid, false)
  assert.equal(result.issues[0]?.code, 'implicit-target-drift')
  assert.match(result.issues[0]?.message ?? '', /implicit target/i)
})
