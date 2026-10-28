import assert from 'node:assert/strict'
import test from 'node:test'

import { CadBodyOperation, normalizeCadBodyOperation } from '@pascal-app/core'

import { capabilityMap } from './capabilities/registry'
import {
  AssistantActionSchema,
  assistantActionTypeValues,
  isSafeImmediateAssistantActionType,
} from './types'

const SOLIDCRAFT_ACTIONS = [
  'list_solidcraft_commands',
  'describe_solidcraft_command',
  'run_solidcraft_command',
] as const

test('the SolidCraft actions are registered action types', () => {
  for (const type of SOLIDCRAFT_ACTIONS) {
    assert.ok(
      (assistantActionTypeValues as readonly string[]).includes(type),
      `${type} must be an assistant action type`,
    )
  }
})

test('discovery is safe-immediate, running a command is not', () => {
  assert.equal(isSafeImmediateAssistantActionType('list_solidcraft_commands'), true)
  assert.equal(isSafeImmediateAssistantActionType('describe_solidcraft_command'), true)
  // Running a command mutates a body timeline, so it goes through review.
  assert.equal(isSafeImmediateAssistantActionType('run_solidcraft_command'), false)
})

test('every SolidCraft action has a cad-domain capability', () => {
  for (const type of SOLIDCRAFT_ACTIONS) {
    const capability = capabilityMap.get(type)
    assert.ok(capability, `${type} must be in the capability registry`)
    assert.equal(capability.domain, 'cad')
    assert.ok(capability.describe.length > 5)
  }
})

test('list_solidcraft_commands takes an optional filter', () => {
  assert.equal(
    AssistantActionSchema.parse({ type: 'list_solidcraft_commands' }).type,
    'list_solidcraft_commands',
  )
  const filtered = AssistantActionSchema.parse({
    type: 'list_solidcraft_commands',
    filter: 'fillet',
  })
  assert.equal('filter' in filtered ? filtered.filter : null, 'fillet')
})

test('describe_solidcraft_command requires a command id', () => {
  assert.throws(() => AssistantActionSchema.parse({ type: 'describe_solidcraft_command' }))
  assert.throws(() =>
    AssistantActionSchema.parse({ type: 'describe_solidcraft_command', command: '' }),
  )
  const action = AssistantActionSchema.parse({
    type: 'describe_solidcraft_command',
    command: 'solid.shell',
  })
  assert.equal('command' in action ? action.command : null, 'solid.shell')
})

test('run_solidcraft_command defaults params and accepts a body id', () => {
  const action = AssistantActionSchema.parse({
    type: 'run_solidcraft_command',
    command: 'solid.shell',
  })
  assert.deepEqual('params' in action ? action.params : null, {})

  const targeted = AssistantActionSchema.parse({
    type: 'run_solidcraft_command',
    command: 'solid.shell',
    params: { thickness: 2 },
    bodyId: 'cbody_1',
  })
  assert.deepEqual('params' in targeted ? targeted.params : null, { thickness: 2 })
  assert.equal('bodyId' in targeted ? targeted.bodyId : null, 'cbody_1')
})

test('run_solidcraft_command rejects an empty command id', () => {
  assert.throws(() => AssistantActionSchema.parse({ type: 'run_solidcraft_command', command: '' }))
})

test('a solidcraft_command operation parses and survives normalisation', () => {
  // The helper bridge reads `params.command` / `params.commandParams` with a
  // flat fallback, so both shapes must be present on a parsed operation.
  const operation = CadBodyOperation.parse({
    id: 'cadop_1',
    type: 'solidcraft_command',
    kind: 'solidcraft_command',
    suppressed: false,
    params: { command: 'solid.shell', commandParams: { thickness: 2 } },
    command: 'solid.shell',
    commandParams: { thickness: 2 },
  })

  assert.equal(operation.kind, 'solidcraft_command')
  assert.equal('command' in operation ? operation.command : null, 'solid.shell')
  assert.deepEqual('params' in operation ? operation.params : null, {
    command: 'solid.shell',
    commandParams: { thickness: 2 },
  })

  // normalizeCadBodyOperation only rewrites the legacy `boolean` kind.
  assert.deepEqual(normalizeCadBodyOperation(operation), operation)
})

test('a solidcraft_command operation requires a command id', () => {
  assert.throws(() =>
    CadBodyOperation.parse({
      id: 'cadop_1',
      kind: 'solidcraft_command',
      params: { command: '', commandParams: {} },
      command: '',
    }),
  )
})
