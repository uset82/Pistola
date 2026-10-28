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

test('AgentStepRequestSchema accepts an explicit null image', () => {
  // Regression: `image: null` is what the panel sends when no image is attached.
  // JSON.stringify keeps null (it only drops undefined), so the route boundary
  // used to reject the request with a 400 before it ever reached the model.
  const req = AgentStepRequestSchema.parse({
    prompt: 'clean the area',
    chatMode: 'create',
    round: 1,
    image: null,
  })

  assert.equal(req.prompt, 'clean the area')
  assert.equal(req.image, null)
})

test('AgentStepRequestSchema accepts an omitted image', () => {
  const req = AgentStepRequestSchema.parse({
    prompt: 'clean the area',
    chatMode: 'create',
    round: 1,
  })

  assert.equal(req.image, undefined)
})

test('AgentStepRequestSchema accepts a valid image attachment', () => {
  const req = AgentStepRequestSchema.parse({
    prompt: 'clean this area',
    chatMode: 'create',
    round: 1,
    image: {
      dataUrl: 'data:image/png;base64,workspace',
      kind: 'workspace',
      source: 'upload',
      analysis: { hasRedMarkup: true },
    },
  })

  assert.equal(req.image?.kind, 'workspace')
  assert.equal(req.image?.analysis?.hasRedMarkup, true)
})

test('AgentStepRequestSchema still rejects a malformed image', () => {
  assert.throws(() =>
    AgentStepRequestSchema.parse({
      prompt: 'clean the area',
      chatMode: 'create',
      round: 1,
      image: { kind: 'workspace', source: 'upload' },
    }),
  )

  assert.throws(() =>
    AgentStepRequestSchema.parse({
      prompt: 'clean the area',
      chatMode: 'create',
      round: 1,
      image: { dataUrl: 'data:image/png;base64,workspace', source: 'not-a-source' },
    }),
  )
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
