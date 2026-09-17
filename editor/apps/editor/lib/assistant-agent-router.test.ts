import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyRequestComplexity,
  decomposeIntoAgentTasks,
  tagStepWithAgent,
} from './assistant-agent-router'

test('classifyRequestComplexity distinguishes simple, moderate, and complex prompts', () => {
  assert.equal(classifyRequestComplexity('hello there'), 'simple')
  assert.equal(classifyRequestComplexity('add walls to this room'), 'moderate')
  assert.equal(
    classifyRequestComplexity('make a furnished small house with kitchen, living room, and windows'),
    'complex',
  )
})

test('decomposeIntoAgentTasks assigns structure before furnish for mixed scene prompts', () => {
  const tasks = decomposeIntoAgentTasks('make a furnished room with walls, a sofa, and a table')

  assert.deepEqual(
    tasks.map((task) => task.agent),
    ['structure', 'furnish'],
  )
})

test('decomposeIntoAgentTasks treats broad office prompts as structure plus furnish work', () => {
  const tasks = decomposeIntoAgentTasks(
    'make a furnished office with reception lobby, sofa seating, and facade lighting',
  )

  assert.deepEqual(
    tasks.map((task) => task.agent),
    ['structure', 'furnish'],
  )
})

test('decomposeIntoAgentTasks can recognize CAD-focused prompts', () => {
  const tasks = decomposeIntoAgentTasks('extrude the sketch and apply a fillet')

  assert.deepEqual(
    tasks.map((task) => task.agent),
    ['cad'],
  )
})

test('tagStepWithAgent returns the dominant agent for mixed action steps', () => {
  const agent = tagStepWithAgent({
    actions: [
      { type: 'create_wall', start: [0, 0], end: [4, 0] },
      { type: 'create_slab', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
      { type: 'place_window', wallId: 'wall_0', width: 1.2, height: 1.1, localX: 0.5 },
    ],
  })

  assert.equal(agent, 'structure')
})
