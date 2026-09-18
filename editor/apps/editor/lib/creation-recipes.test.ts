import assert from 'node:assert/strict'
import test from 'node:test'
import { createAssistantTurnResult } from './assistant-ai-provider'

const NO_AUTH_ENV = {
  OPENAI_API_KEY: '',
  CODEX_API_KEY: '',
  OPENROUTER_API_KEY: '',
  GEMINI_API_KEY: '',
}

test('createAssistantTurnResult creates a 3D heart with parametric CAD brief', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'create a heart 3m wide and 4m tall',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions.length, 1)
  const action = result.turn.actions[0]
  assert.ok(action)
  assert.equal(action?.type, 'execute_cad_brief')
  if (action?.type === 'execute_cad_brief') {
    assert.equal(action.brief.sketchPlans[0]?.entities[0]?.type, 'heart')
    assert.equal(action.brief.operationGraph[0]?.op, 'extrude')
  }
})

test('createAssistantTurnResult creates an airplane compound assembly', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'build an airplane',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 8)
  const [fuselage, ...parts] = result.turn.actions
  assert.equal(fuselage?.type, 'place_item')
  if (fuselage?.type === 'place_item') {
    assert.equal(fuselage.refId, '$ref_airplane_root')
    assert.equal(fuselage.assetId, 'primitive-capsule')
  }
  for (const part of parts) {
    assert.equal(part.type, 'place_item')
    if (part.type === 'place_item') {
      assert.equal(part.parentId, '$ref_airplane_root')
    }
  }
})

test('createAssistantTurnResult creates an articulated robot arm compound assembly', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'create a robot arm with gripper',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 8)
  const [pedestal, ...parts] = result.turn.actions
  assert.equal(pedestal?.type, 'place_item')
  if (pedestal?.type === 'place_item') {
    assert.equal(pedestal.refId, '$ref_arm_root')
    assert.equal(pedestal.assetId, 'primitive-cylinder')
  }
  for (const part of parts) {
    assert.equal(part.type, 'place_item')
    if (part.type === 'place_item') {
      assert.equal(part.parentId, '$ref_arm_root')
    }
  }
})

test('createAssistantTurnResult creates a surfboard with parametric CAD brief', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'create a surfboard',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions.length, 1)
  const action = result.turn.actions[0]
  assert.ok(action)
  assert.equal(action?.type, 'execute_cad_brief')
  if (action?.type === 'execute_cad_brief') {
    assert.equal(action.brief.sketchPlans[0]?.entities[0]?.type, 'board')
    assert.equal(action.brief.operationGraph[0]?.op, 'extrude')
  }
})

test('createAssistantTurnResult creates a humanoid robot assembly', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'build a humanoid robot',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 10)
  const [torso, ...parts] = result.turn.actions
  assert.equal(torso?.type, 'place_item')
  if (torso?.type === 'place_item') {
    assert.equal(torso.refId, '$ref_robot_root')
    assert.equal(torso.assetId, 'primitive-box')
  }
  for (const part of parts) {
    assert.equal(part.type, 'place_item')
    if (part.type === 'place_item') {
      assert.equal(part.parentId, '$ref_robot_root')
    }
  }
})
