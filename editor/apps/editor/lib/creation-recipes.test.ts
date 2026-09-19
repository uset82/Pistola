import assert from 'node:assert/strict'
import test from 'node:test'
import { createAssistantTurnResult } from './assistant-ai-provider'
import { findMatchingRecipe } from '../../../packages/editor/src/lib/assistant/recipes/creation-recipes'

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

test('Acceptance Prompt 1: Generate robotic arm with gripper, then orbit and focus', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'Generate a robotic arm with 3 joint segments and a gripper, then orbit camera to focus on it.',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 10)
  const actionTypes = result.turn.actions.map((a) => a.type)
  assert.ok(actionTypes.includes('place_item'))
  assert.ok(actionTypes.includes('orbit_camera'))
  assert.ok(actionTypes.includes('focus_camera_on_nodes'))
})

test('Acceptance Prompt 2: Create a 3D red heart solid with a smooth base', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'Create a 3D red heart solid with a smooth base.',
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

test('Acceptance Prompt 3: Build 10m x 8m modern studio with large windows on south wall and oak floor', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'Build a 10m x 8m modern studio with large windows on the south wall and an oak floor.',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  const actionTypes = result.turn.actions.map((a) => a.type)
  assert.ok(actionTypes.includes('create_building'))
  assert.ok(actionTypes.includes('create_level'))
  assert.ok(actionTypes.includes('create_zone'))
  assert.ok(actionTypes.includes('create_wall'))
  assert.ok(actionTypes.includes('create_slab'))
  assert.ok(actionTypes.includes('place_window'))

  const slab = result.turn.actions.find((a) => a.type === 'create_slab')
  assert.ok(slab && 'name' in slab && slab.name?.includes('Oak Floor'))

  const window = result.turn.actions.find((a) => a.type === 'place_window')
  assert.ok(window && 'wallId' in window && window.wallId === '$ref_room_wall_0')
})

test('findMatchingRecipe recognizes Spanish toy-car nouns', () => {
  assert.equal(findMatchingRecipe('un carrito de juguete')?.id, 'car')
  assert.equal(findMatchingRecipe('a toy car')?.id, 'car')
})

test('createAssistantTurnResult creates a 3D boat assembly for "hola genera un barquito 3D"', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'hola genera un barquito 3D',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 6)
  const [hull, ...parts] = result.turn.actions
  assert.equal(hull?.type, 'place_item')
  if (hull?.type === 'place_item') {
    assert.equal(hull.refId, '$ref_boat_root')
    assert.equal(hull.name, 'Boat Hull')
    assert.equal(hull.assetId, 'primitive-box')
  }
  for (const part of parts) {
    assert.equal(part.type, 'place_item')
    if (part.type === 'place_item') {
      assert.equal(part.parentId, '$ref_boat_root')
    }
  }
})

test('findMatchingRecipe recognizes dog nouns in Spanish and English', () => {
  assert.equal(findMatchingRecipe('crea un perro')?.id, 'dog')
  assert.equal(findMatchingRecipe('un perrito')?.id, 'dog')
  assert.equal(findMatchingRecipe('make a dog')?.id, 'dog')
  assert.equal(findMatchingRecipe('puppy')?.id, 'dog')
})

test('createAssistantTurnResult creates a 3D dog assembly for "crea un perro"', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'crea un perro',
      chatMode: 'create',
      context: { workspace: 'architecture' },
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 8)
  const root = result.turn.actions[0]
  assert.equal(root?.type, 'place_item')
  if (root?.type === 'place_item') {
    assert.equal(root.refId, '$ref_dog_root')
    assert.equal(root.name, 'Dog Torso')
  }
  assert.equal(
    result.turn.actions.some((action) => action.type === 'generate_mac_part'),
    false,
  )
})

test('createAssistantTurnResult creates a sculpted CAD speedboat for "crea una lancha rápida 3D"', async () => {
  assert.equal(findMatchingRecipe('crea una lancha rápida')?.id, 'speedboat')
  assert.equal(findMatchingRecipe('make a speedboat')?.id, 'speedboat')
  assert.equal(findMatchingRecipe('yacht')?.id, 'speedboat')

  const result = await createAssistantTurnResult(
    {
      prompt: 'crea una lancha rápida 3D',
      context: {},
    },
    NO_AUTH_ENV,
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(result.turn.actions.length >= 6)
  const [hull, ...parts] = result.turn.actions
  assert.equal(hull?.type, 'build_cad_solid')
  if (hull?.type === 'build_cad_solid') {
    assert.equal(hull.refId, '$ref_speedboat_root')
    assert.equal(hull.name, 'Speedboat Hull')
    assert.equal(hull.spec.op, 'intersect_profiles')
    assert.ok(Array.isArray(hull.spec.sideProfile))
    assert.ok(Array.isArray(hull.spec.topProfile))
  }
  for (const part of parts) {
    assert.equal(part.type, 'place_item')
    if (part.type === 'place_item') {
      assert.equal(part.parentId, '$ref_speedboat_root')
    }
  }
})


