import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOpenAiCadRemoteRequest,
  buildOpenRouterCadRemoteRequest,
  createCadBriefResult,
  getCadAiConfig,
} from './cad-ai-provider'

test('getCadAiConfig prefers OPENROUTER_API_KEY', () => {
  const config = getCadAiConfig({
    OPENROUTER_API_KEY: 'openrouter-key',
    PISTOLA_CAD_AI_API_KEY: 'legacy-key',
    OPENAI_API_KEY: 'openai-key',
  })

  assert.equal(config.provider, 'openrouter')
  assert.equal(config.apiKey, 'openrouter-key')
  assert.equal(config.model, 'openrouter/free')
})

test('getCadAiConfig supports legacy OpenRouter alias', () => {
  const config = getCadAiConfig({
    PISTOLA_CAD_AI_API_KEY: 'legacy-key',
  })

  assert.equal(config.provider, 'openrouter')
  assert.equal(config.apiKey, 'legacy-key')
})

test('getCadAiConfig falls back to OpenAI when only OPENAI_API_KEY is set', () => {
  const config = getCadAiConfig({
    OPENAI_API_KEY: 'openai-key',
  })

  assert.equal(config.provider, 'openai')
  assert.equal(config.model, 'gpt-5.4')
  assert.equal(config.responsesUrl, 'https://api.openai.com/v1/responses')
})

test('getCadAiConfig honors the global OpenAI provider override', () => {
  const config = getCadAiConfig({
    PISTOLA_AI_PROVIDER: 'openai',
    OPENROUTER_API_KEY: 'openrouter-key',
    OPENAI_API_KEY: 'openai-key',
  })

  assert.equal(config.provider, 'openai')
  assert.equal(config.model, 'gpt-5.4')
})

test('getCadAiConfig does not silently fall back to OpenRouter when OpenAI is forced without an OpenAI key', () => {
  const config = getCadAiConfig({
    PISTOLA_CAD_AI_PROVIDER: 'openai',
    OPENROUTER_API_KEY: 'openrouter-key',
  })

  assert.deepEqual(config, { provider: 'fallback' })
})

test('getCadAiConfig resolves to deterministic fallback when no remote key is set', () => {
  const config = getCadAiConfig({})

  assert.deepEqual(config, { provider: 'fallback' })
})

test('buildOpenAiCadRemoteRequest includes the strict CAD response schema', () => {
  const request = buildOpenAiCadRemoteRequest(
    {
      prompt: 'create a box 1 m x 2 m x 0.5 m',
      context: { nodes: [], levelId: null },
    },
    'gpt-5.4',
  )

  assert.equal(request.text?.format.type, 'json_schema')
  assert.equal(request.text?.format.name, 'cad_brief')
})

test('buildOpenRouterCadRemoteRequest omits the strict CAD response schema', () => {
  const request = buildOpenRouterCadRemoteRequest(
    {
      prompt: 'create a custom pedestal',
      context: { nodes: [], levelId: null },
    },
    'openrouter/free',
  )

  assert.equal('text' in request, false)
})

test('createCadBriefResult returns an OpenRouter-backed brief when the provider output is valid', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'create a custom pedestal with a tapered top',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () =>
        JSON.stringify({
          intent: 'create a custom pedestal with a tapered top',
          sketchPlans: [
            {
              plane: 'XY',
              entities: [
                {
                  type: 'rectangle',
                  points: [
                    [-0.3, -0.3],
                    [0.3, 0.3],
                  ],
                  params: {},
                },
              ],
              dimensions: [],
              constraints: [],
            },
          ],
          operationGraph: [
            {
              id: 'op_pedestal_extrude_1',
              op: 'extrude',
              params: {
                sketchIndex: 0,
                distance: 0.9,
              },
              dependsOn: [],
            },
          ],
          assumptions: ['Created a simple pedestal body.'],
          ambiguities: [],
        }),
    },
  )

  assert.equal(result.provider, 'openrouter')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph[0].params.distance, 0.9)
})

test('createCadBriefResult does not silently fallback when the OpenRouter brief is invalid', async () => {
  await assert.rejects(() =>
    createCadBriefResult(
      {
        prompt: 'create a custom pedestal with a tapered top',
        context: { nodes: [], levelId: null },
      },
      {
        OPENROUTER_API_KEY: 'openrouter-key',
      },
      {
        requestOpenRouterBrief: async () =>
          JSON.stringify({
            intent: 'create a custom pedestal with a tapered top',
            sketchPlans: [
              {
                plane: 'XY',
                entities: [
                  {
                    type: 'rectangle',
                    points: [
                      [-0.5, -1],
                      [0.5, 1],
                    ],
                    params: {},
                  },
                ],
                dimensions: [],
                constraints: [],
              },
              {
                plane: 'XY',
                entities: [
                  {
                    type: 'rectangle',
                    points: [
                      [-0.25, -0.5],
                      [0.25, 0.5],
                    ],
                    params: {},
                  },
                ],
                dimensions: [],
                constraints: [],
              },
            ],
            operationGraph: [
              {
                id: 'op_pedestal_extrude_1',
                op: 'not-a-real-op',
                params: {
                  sketchIndex: 0,
                  distance: 0.5,
                },
                dependsOn: [],
              },
            ],
            assumptions: ['Interpreted the prompt as a pedestal body.'],
            ambiguities: [],
          }),
      },
    ),
  )
})

test('createCadBriefResult uses a deterministic chair brief before calling a remote provider', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'create a chair for kids the kid is 8 years old',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () => {
        throw new Error('remote planner should not be called for deterministic chair prompts')
      },
    },
  )

  assert.equal(result.provider, 'fallback')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.ambiguities.length, 0)
  assert.equal(brief.operationGraph.length, 6)
  assert.equal(brief.operationGraph[0].params.baseElevation, 0.34)
})

test('createCadBriefResult uses deterministic fallback for a simple box prompt before calling a remote provider', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'create a box 1 m x 2 m x 0.5 m',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () => {
        throw new Error('remote planner should not be called for deterministic box prompts')
      },
    },
  )

  assert.equal(result.provider, 'fallback')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph[0].op, 'extrude')
  assert.equal(brief.ambiguities.length, 0)
})

test('createCadBriefResult uses deterministic clarification for an underspecified box prompt before calling a remote provider', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'build a box',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () => {
        throw new Error('remote planner should not be called for underspecified box prompts')
      },
    },
  )

  assert.equal(result.provider, 'fallback')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph.length, 0)
  assert.match(brief.ambiguities.join(' '), /width|depth|height/i)
})

test('createCadBriefResult uses deterministic clarification for a bracket-with-holes prompt before calling a remote provider', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'make a wall bracket with two holes',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () => {
        throw new Error('remote planner should not be called for underspecified bracket prompts')
      },
    },
  )

  assert.equal(result.provider, 'fallback')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph.length, 0)
  assert.match(brief.ambiguities.join(' '), /hole|spacing|offset|l-shaped|u-shaped/i)
})

test('createCadBriefResult drops non-blocking remote ambiguities when geometry is already usable', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'create a custom pedestal',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () =>
        JSON.stringify({
          intent: 'create a custom pedestal',
          sketchPlans: [
            {
              plane: 'XY',
              entities: [
                {
                  type: 'rectangle',
                  points: [
                    [-0.2, -0.2],
                    [0.2, 0.2],
                  ],
                  params: {},
                },
              ],
              dimensions: [],
              constraints: [],
            },
          ],
          operationGraph: [
            {
              id: 'op_pedestal_1',
              op: 'extrude',
              params: {
                sketchIndex: 0,
                distance: 0.8,
              },
              dependsOn: [],
            },
          ],
          assumptions: ['Created a simple pedestal body.'],
          ambiguities: ['Material type not specified.', 'Color or finish not specified.'],
        }),
    },
  )

  assert.equal(result.provider, 'openrouter')
  const brief = JSON.parse(result.raw)
  assert.deepEqual(brief.ambiguities, [])
})

test('createCadBriefResult uses deterministic fallback when no remote provider is configured', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'create a box 1 m x 2 m x 0.5 m',
      context: { nodes: [], levelId: null },
    },
    {},
  )

  assert.equal(result.provider, 'fallback')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph[0].op, 'extrude')
})

test('createCadBriefResult accepts canonical boolean CAD brief operations from the remote provider', async () => {
  const result = await createCadBriefResult(
    {
      prompt: 'subtract one body from another',
      context: { nodes: [], levelId: null },
    },
    {
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterBrief: async () =>
        JSON.stringify({
          intent: 'subtract one body from another',
          sketchPlans: [
            {
              plane: 'XY',
              entities: [
                {
                  type: 'rectangle',
                  points: [
                    [-0.4, -0.2],
                    [0.4, 0.2],
                  ],
                  params: {},
                },
              ],
              dimensions: [],
              constraints: [],
            },
            {
              plane: 'XY',
              entities: [
                {
                  type: 'circle',
                  points: [
                    [0, 0],
                    [0.15, 0],
                  ],
                  params: {},
                },
              ],
              dimensions: [],
              constraints: [],
            },
          ],
          operationGraph: [
            {
              id: 'base_extrude',
              op: 'extrude',
              params: {
                sketchIndex: 0,
                distance: 0.5,
              },
              dependsOn: [],
            },
            {
              id: 'tool_extrude',
              op: 'extrude',
              params: {
                sketchIndex: 1,
                distance: 0.5,
              },
              dependsOn: [],
            },
            {
              id: 'body_cut',
              op: 'boolean_cut',
              params: {},
              dependsOn: ['base_extrude', 'tool_extrude'],
            },
          ],
          assumptions: ['Interpreted the prompt as a simple subtractive cut.'],
          ambiguities: [],
        }),
    },
  )

  assert.equal(result.provider, 'openrouter')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph[2].op, 'boolean_cut')
})


test('getCadAiConfig returns codex config when PISTOLA_CAD_AI_PROVIDER=codex', () => {
  const config = getCadAiConfig({
    PISTOLA_CAD_AI_PROVIDER: 'codex',
    OPENAI_API_KEY: 'test-codex-key',
  })

  assert.equal(config.provider, 'codex')
  assert.equal((config as { apiKey: string }).apiKey, 'test-codex-key')
  assert.equal((config as { model: string }).model, 'gpt-5.3-codex')
  assert.equal((config as { reasoningEffort: string }).reasoningEffort, 'medium')
})

test('getCadAiConfig codex falls back when OPENAI_API_KEY is missing', () => {
  const config = getCadAiConfig({
    PISTOLA_CAD_AI_PROVIDER: 'codex',
  })

  assert.equal(config.provider, 'fallback')
})

test('getCadAiConfig codex respects custom model and reasoning effort', () => {
  const config = getCadAiConfig({
    PISTOLA_CAD_AI_PROVIDER: 'codex',
    OPENAI_API_KEY: 'test-key',
    PISTOLA_CAD_MODEL: 'custom-codex-model',
    PISTOLA_CAD_REASONING_EFFORT: 'high',
  })

  assert.equal(config.provider, 'codex')
  assert.equal((config as { model: string }).model, 'custom-codex-model')
  assert.equal((config as { reasoningEffort: string }).reasoningEffort, 'high')
})

test('createCadBriefResult routes through codex requester when provider is codex', async () => {
  const mockCodexBrief = JSON.stringify({
    intent: 'create a custom turbine housing with internal ribs',
    sketchPlans: [
      {
        plane: 'XY',
        entities: [{ type: 'circle', points: [[0, 0], [0.15, 0]], params: {} }],
        dimensions: [{ kind: 'distance', value: 0.3, label: 'diameter' }],
        constraints: [],
      },
    ],
    operationGraph: [
      { id: 'op1', op: 'revolve', params: { sketchIndex: 0, angle: 360, axis: [0, 1, 0] }, dependsOn: [] },
    ],
    assumptions: ['Created a turbine housing'],
    ambiguities: [],
  })

  const result = await createCadBriefResult(
    { prompt: 'create a custom turbine housing with internal ribs' },
    { PISTOLA_CAD_AI_PROVIDER: 'codex', OPENAI_API_KEY: 'test-key' },
    {
      requestCodexBrief: async () => ({
        raw: mockCodexBrief,
        codexThreadId: 'thread-abc-123',
      }),
    },
  )

  assert.equal(result.provider, 'codex')
  assert.equal(result.codexThreadId, 'thread-abc-123')
  const brief = JSON.parse(result.raw)
  assert.equal(brief.operationGraph[0].op, 'revolve')
})

test('createCadBriefResult passes codexThreadId to codex requester', async () => {
  let receivedThreadId: string | undefined

  await createCadBriefResult(
    { prompt: 'create a custom turbine housing with internal ribs', codexThreadId: 'existing-thread-456' },
    { PISTOLA_CAD_AI_PROVIDER: 'codex', OPENAI_API_KEY: 'test-key' },
    {
      requestCodexBrief: async (_config, body) => {
        receivedThreadId = body.codexThreadId
        return {
          raw: JSON.stringify({
            intent: 'create a turbine housing',
            sketchPlans: [{ plane: 'XY', entities: [{ type: 'circle', points: [[0, 0], [0.15, 0]], params: {} }], dimensions: [], constraints: [] }],
            operationGraph: [{ id: 'op1', op: 'revolve', params: { sketchIndex: 0, angle: 360, axis: [0, 1, 0] }, dependsOn: [] }],
            assumptions: [],
            ambiguities: [],
          }),
          codexThreadId: 'existing-thread-456',
        }
      },
    },
  )

  assert.equal(receivedThreadId, 'existing-thread-456')
})

test('createCadBriefResult uses OpenAI when provider is not codex', async () => {
  const mockOpenAiBrief = JSON.stringify({
    intent: 'create a sphere',
    sketchPlans: [{ plane: 'XY', entities: [{ type: 'circle', points: [[0, 0], [0.5, 0]], params: {} }], dimensions: [], constraints: [] }],
    operationGraph: [{ id: 'op1', op: 'revolve', params: { sketchIndex: 0, angle: 360, axis: [0, 1, 0] }, dependsOn: [] }],
    assumptions: [],
    ambiguities: [],
  })

  const result = await createCadBriefResult(
    { prompt: 'create a sphere' },
    { PISTOLA_CAD_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' },
    {
      requestOpenAiBrief: async () => mockOpenAiBrief,
    },
  )

  assert.equal(result.provider, 'openai')
  assert.equal(result.codexThreadId, undefined)
})