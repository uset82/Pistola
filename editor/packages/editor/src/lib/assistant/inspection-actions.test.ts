import assert from 'node:assert/strict'
import test from 'node:test'

import { capabilityMap } from './capabilities/registry'
import {
  AssistantActionSchema,
  assistantActionTypeValues,
  assistantDestructiveActionTypes,
  isSafeImmediateAssistantActionType,
} from './types'

const INSPECTION_ACTIONS = [
  'inspect_interference',
  'inspect_clearance',
  'inspect_center_of_mass',
] as const

test('the inspection actions are registered action types', () => {
  for (const type of INSPECTION_ACTIONS) {
    assert.ok(
      (assistantActionTypeValues as readonly string[]).includes(type),
      `${type} must be an assistant action type`,
    )
  }
})

test('inspection only reads geometry, so all three are safe-immediate', () => {
  for (const type of INSPECTION_ACTIONS) {
    assert.equal(isSafeImmediateAssistantActionType(type), true)
    assert.ok(
      !(assistantDestructiveActionTypes as readonly string[]).includes(type),
      `${type} must not be destructive`,
    )
  }
})

test('every inspection action has a cad-domain capability', () => {
  for (const type of INSPECTION_ACTIONS) {
    const capability = capabilityMap.get(type)
    assert.ok(capability, `${type} must be in the capability registry`)
    assert.equal(capability.domain, 'cad')
    assert.ok(capability.describe.length > 5)
    assert.equal(capability.safeImmediate, true)
  }
})

test('inspection bodies default to the whole scene', () => {
  for (const type of INSPECTION_ACTIONS) {
    const action = AssistantActionSchema.parse({ type })
    assert.equal(action.type, type)
  }
})

test('interference takes an optional time budget', () => {
  const action = AssistantActionSchema.parse({
    type: 'inspect_interference',
    bodyIds: ['body-a', 'body-b'],
    budgetSeconds: 30,
  })

  assert.equal(action.type, 'inspect_interference')
  assert.deepEqual('bodyIds' in action ? action.bodyIds : undefined, ['body-a', 'body-b'])
  assert.equal('budgetSeconds' in action ? action.budgetSeconds : undefined, 30)
  assert.throws(() =>
    AssistantActionSchema.parse({ type: 'inspect_interference', budgetSeconds: 0 }),
  )
})

test('clearance accepts a baseline, a distance and a nearest count', () => {
  const action = AssistantActionSchema.parse({
    type: 'inspect_clearance',
    bodyIds: ['body-a'],
    againstBodyIds: ['body-b'],
    minimumClearance: 2,
    minVolume: 0.5,
    nearest: 3,
  })

  assert.equal(action.type, 'inspect_clearance')
  assert.equal('minimumClearance' in action ? action.minimumClearance : undefined, 2)
  assert.equal('nearest' in action ? action.nearest : undefined, 3)
  assert.throws(() =>
    AssistantActionSchema.parse({ type: 'inspect_clearance', minimumClearance: -1 }),
  )
})

test('center of mass takes body ids only', () => {
  const action = AssistantActionSchema.parse({
    type: 'inspect_center_of_mass',
    bodyIds: ['body-a'],
  })

  assert.equal(action.type, 'inspect_center_of_mass')
  assert.deepEqual('bodyIds' in action ? action.bodyIds : undefined, ['body-a'])
})
