import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AgentStepRequestSchema,
  AgentStepResponseSchema,
  AgentToolCallSchema,
} from './types'

test('AgentStepRequestSchema parses minimal valid step request', () => {
  const req = AgentStepRequestSchema.parse({
    prompt: 'Put a window on the longest wall',
    chatMode: 'create',
    round: 1,
  })

  assert.equal(req.prompt, 'Put a window on the longest wall')
  assert.equal(req.chatMode, 'create')
  assert.equal(req.round, 1)
  assert.equal(req.budgets.maxRounds, 12)
})

test('AgentStepResponseSchema parses tool_calls response', () => {
  const toolCall = AgentToolCallSchema.parse({
    id: 'call_1',
    name: 'inspect_scene',
    arguments: { type: 'wall' },
  })

  const res = AgentStepResponseSchema.parse({
    kind: 'tool_calls',
    round: 1,
    calls: [toolCall],
    thought: 'Inspecting walls to find the longest one.',
  })

  assert.equal(res.kind, 'tool_calls')
  if (res.kind === 'tool_calls') {
    assert.equal(res.calls.length, 1)
    assert.equal(res.calls[0]!.name, 'inspect_scene')
  }
})

test('AgentStepResponseSchema parses final response', () => {
  const res = AgentStepResponseSchema.parse({
    kind: 'final',
    round: 2,
    turn: {
      reply: 'Window placed successfully.',
      mode: 'chat',
      assumptions: ['Placed centered on north wall.'],
      ambiguities: [],
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  })

  assert.equal(res.kind, 'final')
  if (res.kind === 'final') {
    assert.equal(res.turn.reply, 'Window placed successfully.')
    assert.equal(res.turn.assumptions.length, 1)
  }
})
