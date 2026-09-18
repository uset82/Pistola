import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { CreateResponsesRequest$outboundSchema } from '../node_modules/@openrouter/sdk/esm/models/operations/createresponses.js'
import {
  assistantActionTypeValues,
  assistantCadBooleanModeValues,
  assistantCadExtrudeDirectionValues,
  assistantCadRevolveAxisValues,
  assistantModeValues,
  assistantPhaseValues,
  assistantPlacementValues,
  assistantSideValues,
} from '../../../packages/editor/src/lib/assistant/types'
import { shapeAssistantPlanningContext, shapeCadPlanningContext } from './ai-context-shaping'
import {
  type AssistantPlanRequest,
  AssistantPlanRequestSchema,
  buildAssistantActionGuide,
  buildAssistantChatRequest,
  buildAssistantRequest,
  createAssistantTurnResult,
  getAssistantAiConfig,
} from './assistant-ai-provider'
import {
  assistantAcceptanceFixtures,
  assistantAgenticOperatorFixtures,
  assistantCommandVisionFixtures,
  assistantSurfaceSourceFixtures,
} from './assistant-acceptance-fixtures'
import {
  AiProviderError,
  classifyAiFailure,
  normalizeOpenRouterResponsesRequest,
} from './ai-provider-shared'
import { createCadBriefResult } from './cad-ai-provider'

const stripRefIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripRefIds)
  if (!value || typeof value !== 'object') return value

  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'refId') continue
    next[key] = stripRefIds(entry)
  }
  return next
}

/**
 * Prevent tests from detecting a real Codex auth cache on the developer's machine.
 * Without this, tests that only set OPENROUTER_API_KEY could default to the codex
 * provider because hasCodexAuthCache finds ~/.codex/auth.json on the filesystem.
 */
const NO_CODEX_AUTH: Record<string, string | undefined> = {
  CODEX_HOME: path.join(os.tmpdir(), '__pistola_test_no_codex_auth__'),
}

test('getAssistantAiConfig defaults the OpenRouter assistant model to GPT-5.4', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'openrouter',
    ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
  })

  assert.equal(config.provider, 'openrouter')
  assert.equal(config.model, 'openai/gpt-5.4')
})

test('getAssistantAiConfig falls back to CAD env defaults when assistant envs are absent', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'openrouter',
    ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    PISTOLA_CAD_MODEL: 'cad-shared-model',
  })

  assert.equal(config.provider, 'openrouter')
  assert.equal(config.model, 'cad-shared-model')
})

test('getAssistantAiConfig prefers assistant envs over CAD aliases when both are set', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'openrouter',
    ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    PISTOLA_ASSISTANT_MODEL: 'assistant-model',
    PISTOLA_CAD_MODEL: 'cad-shared-model',
  })

  assert.equal(config.provider, 'openrouter')
  assert.equal(config.model, 'assistant-model')
})

test('getAssistantAiConfig defaults the assistant to Codex when only OPENAI_API_KEY is set', () => {
  const config = getAssistantAiConfig({
    OPENAI_API_KEY: 'openai-key',
  })

  assert.equal(config.provider, 'codex')
  assert.equal(config.model, 'gpt-5.3-codex')
})

test('getAssistantAiConfig defaults the assistant to Codex when cached Codex auth exists', () => {
  const codexHome = mkdtempSync(path.join(os.tmpdir(), 'pistola-codex-auth-'))
  try {
    writeFileSync(path.join(codexHome, 'auth.json'), '{"auth_mode":"chatgpt"}', 'utf8')

    const config = getAssistantAiConfig({
      CODEX_HOME: codexHome,
    })

    assert.equal(config.provider, 'codex')
    assert.equal(config.model, 'gpt-5.3-codex')
  } finally {
    rmSync(codexHome, { recursive: true, force: true })
  }
})

test('getAssistantAiConfig honors an explicit OpenAI provider override', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'openai',
    ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    OPENAI_API_KEY: 'openai-key',
  })

  assert.equal(config.provider, 'openai')
  assert.equal(config.model, 'gpt-5.4')
})

test('getAssistantAiConfig honors an explicit Codex provider override with Codex defaults', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
    OPENAI_API_KEY: 'openai-key',
    PISTOLA_CAD_MODEL: 'cad-shared-model',
  })

  assert.equal(config.provider, 'codex')
  assert.equal(config.model, 'gpt-5.3-codex')
  assert.equal(config.reasoningEffort, 'medium')
})

test('getAssistantAiConfig normalizes OpenRouter-style assistant model aliases when Codex is active', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
    OPENAI_API_KEY: 'openai-key',
    PISTOLA_ASSISTANT_MODEL: 'openai/gpt-5.4',
  })

  assert.equal(config.provider, 'codex')
  assert.equal(config.model, 'gpt-5.3-codex')
})

test('getAssistantAiConfig does not silently fall back when Codex is forced without an OpenAI key', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
    ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
  })

  assert.equal(config.provider, 'codex')
  assert.equal(config.model, 'gpt-5.3-codex')
})

test('getAssistantAiConfig does not silently fall back to OpenRouter when OpenAI is forced without an OpenAI key', () => {
  const config = getAssistantAiConfig({
    PISTOLA_ASSISTANT_AI_PROVIDER: 'openai',
    ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
  })

  assert.deepEqual(config, { provider: 'fallback' })
})

test('AssistantPlanRequestSchema parses chat mode and session controls', () => {
  const request = AssistantPlanRequestSchema.parse({
    prompt: 'make a room',
    chatMode: 'create',
    complexity: 'complex',
    sessionId: 'assistant-session-1',
    codexThreadId: 'codex-thread-1',
    context: {
      phase: 'structure',
    },
  })

  assert.equal(request.chatMode, 'create')
  assert.equal(request.complexity, 'complex')
  assert.equal(request.sessionId, 'assistant-session-1')
  assert.equal(request.codexThreadId, 'codex-thread-1')
})

test('AssistantPlanRequestSchema parses structured image attachments', () => {
  const request = AssistantPlanRequestSchema.parse({
    prompt: 'clean this area',
    chatMode: 'create',
    image: {
      dataUrl: 'data:image/png;base64,workspace',
      kind: 'workspace',
      source: 'upload',
      viewport: {
        width: 1365,
        height: 768,
        devicePixelRatio: 1,
        phase: 'structure',
        tool: 'wall',
      },
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.2, y: 0.18, width: 0.42, height: 0.48 },
        imageWidth: 1365,
        imageHeight: 768,
        redPixelCount: 1100,
      },
    },
  })

  assert.equal(request.image?.kind, 'workspace')
  assert.equal(request.image?.analysis?.hasRedMarkup, true)
})

test('buildAssistantRequest normalizes image turns into an OpenRouter-safe Responses payload', () => {
  const request = AssistantPlanRequestSchema.parse({
    prompt: 'clean this area',
    chatMode: 'create',
    image: {
      dataUrl: 'data:image/png;base64,workspace',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.2, y: 0.18, width: 0.42, height: 0.48 },
        imageWidth: 1365,
        imageHeight: 768,
        redPixelCount: 1100,
        annotationKinds: ['circle', 'region'],
      },
    },
    context: {
      phase: 'structure',
    },
  })

  const rawRequest = buildAssistantRequest(request, 'gpt-4o-mini')
  const normalizedRequest = normalizeOpenRouterResponsesRequest(rawRequest)
  CreateResponsesRequest$outboundSchema.parse({
    openResponsesRequest: normalizedRequest,
  })

  const input = Array.isArray(normalizedRequest.input) ? normalizedRequest.input : []
  const userMessage = input.find(
    (item): item is { role?: unknown; content?: unknown } =>
      Boolean(item) &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'role' in item &&
      (item as { role?: unknown }).role === 'user',
  )
  const content = Array.isArray(userMessage?.content) ? userMessage.content : []
  const imagePart = content[0] as Record<string, unknown> | undefined

  assert.equal(imagePart?.type, 'input_image')
  assert.equal(imagePart?.detail, 'auto')
  assert.equal(imagePart?.imageUrl, 'data:image/png;base64,workspace')
  assert.equal('image_url' in (imagePart ?? {}), false)
})

test('buildAssistantChatRequest keeps workspace images as direct vision input for GPT-5.4', () => {
  const request = AssistantPlanRequestSchema.parse({
    prompt: 'what is in the middle?',
    chatMode: 'ask',
    image: {
      dataUrl: 'data:image/png;base64,workspace',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: false,
        imageWidth: 1365,
        imageHeight: 768,
        redPixelCount: 0,
      },
    },
    context: {
      phase: 'structure',
    },
  })

  const rawRequest = buildAssistantChatRequest(request, 'openai/gpt-5.4')
  const normalizedRequest = normalizeOpenRouterResponsesRequest(rawRequest)
  CreateResponsesRequest$outboundSchema.parse({
    openResponsesRequest: normalizedRequest,
  })

  const input = Array.isArray(normalizedRequest.input) ? normalizedRequest.input : []
  const userMessage = input.find(
    (item): item is { role?: unknown; content?: unknown } =>
      Boolean(item) &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'role' in item &&
      (item as { role?: unknown }).role === 'user',
  )
  const content = Array.isArray(userMessage?.content) ? userMessage.content : []
  const imagePart = content[0] as Record<string, unknown> | undefined

  assert.equal(imagePart?.type, 'input_image')
  assert.equal(imagePart?.detail, 'auto')
  assert.equal(imagePart?.imageUrl, 'data:image/png;base64,workspace')
  assert.equal('image_url' in (imagePart ?? {}), false)
})

test('buildAssistantActionGuide stays aligned with the shared assistant schema constants', () => {
  const guide = buildAssistantActionGuide()
  const placeItemExample = guide.examples.find((example) => example.type === 'place_item')
  const placeWindowExample = guide.examples.find((example) => example.type === 'place_window')
  const extrudeExample = guide.examples.find((example) => example.type === 'extrude_cad_sketch')
  const revolveExample = guide.examples.find((example) => example.type === 'revolve_cad_sketch')
  const booleanExample = guide.examples.find((example) => example.type === 'apply_cad_boolean')

  assert.deepEqual(guide.allowedActions, assistantActionTypeValues)
  assert.deepEqual(guide.allowedPhases, assistantPhaseValues)
  assert.deepEqual(guide.allowedModes, assistantModeValues)
  assert.equal(placeItemExample?.shape.placement, assistantPlacementValues.join('|'))
  assert.equal(placeWindowExample?.shape.side, `${assistantSideValues.join('|')} optional`)
  assert.equal(extrudeExample?.shape.direction, assistantCadExtrudeDirectionValues.join('|'))
  assert.equal(revolveExample?.shape.axis, assistantCadRevolveAxisValues.join('|'))
  assert.equal(booleanExample?.shape.operation, assistantCadBooleanModeValues.join('|'))
})

test('classifyAiFailure distinguishes timeout, validation, and config failures', () => {
  assert.equal(
    classifyAiFailure(new AiProviderError('openrouter', 'OpenRouter timed out after 60 seconds.', 'timeout')),
    'timeout',
  )
  assert.equal(classifyAiFailure(new Error('Assistant planner returned invalid actions.')), 'validation')
  assert.equal(classifyAiFailure(new Error('AI assistant provider is not configured.')), 'config')
})

test('assistant acceptance fixtures cover the planned failure-source categories', () => {
  const covered = new Set(
    assistantAcceptanceFixtures
      .map((fixture) => fixture.baselineFailureSource)
      .filter((source): source is NonNullable<(typeof assistantAcceptanceFixtures)[number]['baselineFailureSource']> => Boolean(source)),
  )

  assert.equal(covered.has('planner'), true)
  assert.equal(covered.has('multimodal extraction'), true)
  assert.equal(covered.has('decomposition'), true)
  assert.equal(covered.has('action surface'), true)
  assert.equal(covered.has('executor'), true)
  assert.equal(covered.has('cad brief'), true)
  assert.equal(covered.has('continuation'), true)
  assert.equal(covered.has('asset/catalog'), true)
  assert.equal(covered.has('unsupported'), true)
})

test('assistant command-vision fixtures cover the new failure-source categories', () => {
  const covered = new Set(assistantCommandVisionFixtures.map((fixture) => fixture.baselineFailureSource))

  assert.equal(covered.has('command routing'), true)
  assert.equal(covered.has('planner drift'), true)
  assert.equal(covered.has('schema validation'), true)
  assert.equal(covered.has('image interpretation'), true)
  assert.equal(covered.has('target grounding'), true)
  assert.equal(covered.has('destructive review'), true)
  assert.equal(covered.has('executor'), true)
  assert.equal(covered.has('timeout'), true)
})

test('shapeAssistantPlanningContext trims scene context and keeps prompt-relevant catalog items', () => {
  const shaped = shapeAssistantPlanningContext('put a sofa in the center of the room', {
    phase: 'structure',
    mode: 'select',
    tool: 'wall',
    selection: {
      levelId: 'level_0',
      zoneId: 'zone_living',
      selectedIds: [],
    },
    sceneSummary: Array.from({ length: 20 }, (_, index) => ({
      id: `zone_${index}`,
      type: 'zone',
      name: `Zone ${index}`,
      polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
    })),
    catalog: [
      { id: 'sofa', name: 'Sofa', category: 'furniture', attachTo: null, tags: ['couch'] },
      { id: 'wall-light', name: 'Wall Light', category: 'furniture', attachTo: 'wall', tags: ['lamp'] },
    ],
    assistantSession: {
      sessionId: 'assistant-session-1',
      chatMode: 'create',
      cadMacroExpansion: true,
      lastError: 'Node "missing_wall" was not found.',
      recentSuccessfulPrompts: ['make a small furnished cafe'],
      failedPrompts: ['clean everything'],
      taskPlans: [
        {
          id: 'task-plan-cafe',
          title: 'Build the cafe shell',
          prompt: 'make a small furnished cafe',
          createdAt: 1,
          steps: [
            { id: 'step-0', description: 'Create shell', actions: [], status: 'done' },
            { id: 'step-1', description: 'Add openings', actions: [], status: 'done' },
            { id: 'step-2', description: 'Furnish', actions: [], status: 'done' },
          ],
        },
      ],
      preferredComplexity: 'detailed',
      recentReferencedNodes: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
      lastCreatedNodes: [{ id: 'zone_living', type: 'zone', name: 'Living Room' }],
    },
  })

  assert.equal(Array.isArray(shaped.sceneSummary), true)
  assert.equal((shaped.sceneSummary as unknown[]).length, 12)
  assert.deepEqual(shaped.catalog, [
    { id: 'sofa', name: 'Sofa', category: 'furniture', attachTo: null, tags: ['couch'] },
  ])
  assert.deepEqual(shaped.availableActions, {
    cleanup: ['clear_level_contents'],
  })
  assert.equal((shaped.assistantSession as Record<string, unknown>)?.sessionId, 'assistant-session-1')
  assert.equal((shaped.assistantSession as Record<string, unknown>)?.chatMode, 'create')
  assert.equal((shaped.assistantSession as Record<string, unknown>)?.cadMacroExpansion, true)
  assert.equal(
    (shaped.assistantSession as Record<string, unknown>)?.lastError,
    'Node "missing_wall" was not found.',
  )
  assert.deepEqual(
    (shaped.assistantSession as Record<string, unknown>)?.recentSuccessfulPrompts,
    ['make a small furnished cafe'],
  )
  assert.deepEqual(
    (shaped.assistantSession as Record<string, unknown>)?.failedPrompts,
    ['clean everything'],
  )
  assert.deepEqual(
    (shaped.assistantSession as Record<string, unknown>)?.taskPlanSummaries,
    [{ title: 'Build the cafe shell', stepCount: 3 }],
  )
  assert.equal(
    (shaped.assistantSession as Record<string, unknown>)?.preferredComplexity,
    'detailed',
  )
  assert.equal(
    ((shaped.assistantSession as Record<string, unknown>)?.recentReferencedNodes as Array<Record<string, unknown>> | undefined)?.[0]?.id,
    'item_sofa',
  )
  assert.equal(
    ((shaped.assistantSession as Record<string, unknown>)?.lastCreatedNodes as Array<Record<string, unknown>> | undefined)?.[0]?.id,
    'zone_living',
  )
})

test('shapeAssistantPlanningContext keeps assistant session payloads compact for remote planning', () => {
  const shaped = shapeAssistantPlanningContext('make a furnished house with many rooms and furniture', {
    sceneSummary: Array.from({ length: 60 }, (_, index) => ({
      id: `zone_${index}`,
      type: 'zone',
      name: `Zone ${index}`,
      polygon: [[0, 0], [4, 0], [4, 4], [0, 4]],
    })),
    catalog: Array.from({ length: 80 }, (_, index) => ({
      id: `asset_${index}`,
      name: `Asset ${index}`,
      category: index % 2 === 0 ? 'furniture' : 'decor',
      attachTo: null,
      tags: ['furniture', 'room', `tag_${index}`],
    })),
    assistantSession: {
      sessionId: 'assistant-session-oversized',
      chatMode: 'create',
      recentSuccessfulPrompts: Array.from({ length: 10 }, (_, index) => `successful prompt ${index}`),
      failedPrompts: Array.from({ length: 10 }, (_, index) => `failed prompt ${index}`),
      taskPlans: Array.from({ length: 5 }, (_, index) => ({
        id: `plan_${index}`,
        title: `Plan ${index}`,
        prompt: `prompt ${index}`,
        createdAt: index,
        steps: Array.from({ length: 6 }, (_, stepIndex) => ({
          id: `step_${index}_${stepIndex}`,
          description: `Step ${stepIndex}`,
          actions: [],
          status: 'done',
        })),
      })),
      recentReferencedNodes: Array.from({ length: 12 }, (_, index) => ({
        id: `wall_${index}`,
        type: 'wall',
        name: `Wall ${index}`,
      })),
      lastCreatedNodes: Array.from({ length: 12 }, (_, index) => ({
        id: `item_${index}`,
        type: 'item',
        name: `Item ${index}`,
      })),
      preferredComplexity: 'detailed',
    },
  })

  assert.ok(JSON.stringify(shaped).length < 15000)
})

test('shapeCadPlanningContext prioritizes CAD nodes and trims oversized node payloads', () => {
  const shaped = shapeCadPlanningContext('modify the selected body with a fillet', {
    levelId: 'level_0',
    nodes: [
      { id: 'level_0', type: 'level', name: 'Level 0', parentId: 'building_0' },
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `wall_${index}`,
        type: 'wall',
        name: `Wall ${index}`,
        parentId: 'level_0',
      })),
      { id: 'cbody_1', type: 'cad-body', name: 'Bracket Body', parentId: 'level_0' },
      { id: 'csk_1', type: 'cad-sketch', name: 'Bracket Sketch', parentId: 'level_0' },
    ],
  })

  assert.equal(shaped.levelId, 'level_0')
  assert.equal(shaped.nodes.length, 24)
  assert.equal(shaped.nodes[0]?.type, 'cad-body')
  assert.equal(shaped.nodes[1]?.type, 'cad-sketch')
})

test('createAssistantTurnResult normalizes review and destructive metadata from actions', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'destroy the selected roof',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () =>
        JSON.stringify({
          reply: 'I can remove the selected roof after review.',
          mode: 'chat',
          assumptions: [],
          ambiguities: [],
          actions: [{ type: 'delete_target' }],
          requiresReview: false,
          destructiveActionCount: 0,
        }),
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.requiresReview, true)
  assert.equal(result.turn.destructiveActionCount, 1)
})

test('createAssistantTurnResult errors when no remote assistant provider is configured', async () => {
  await assert.rejects(() =>
    createAssistantTurnResult(
      {
        prompt: 'design a surreal gallery inspired by melting clocks',
        context: {},
      },
      {},
    ),
  )
})

test('createAssistantTurnResult still returns deterministic local plans when no remote provider is configured', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'rename this room kitchen',
      context: {
        selection: {
          zoneId: 'zone_room',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'zone_room', type: 'zone', name: 'Room', parentId: 'level_0' }],
      },
    },
    { ...NO_CODEX_AUTH },
  )

  assert.equal(result.provider, 'fallback')
  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'rename_node', nodeId: 'zone_room', name: 'Kitchen' }])
})

test('createAssistantTurnResult handles simple greetings locally without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'hola perro',
      context: {
        phase: 'structure',
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Simple greetings should not call the remote planner.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'chat')
  assert.match(result.turn.reply, /hola/i)
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult starts and resumes Codex threads through codexThreadId', async () => {
  const seenThreadIds: Array<string | undefined> = []

  const firstTurn = await createAssistantTurnResult(
    {
      prompt: 'describe the current workspace',
      chatMode: 'ask',
      context: {
        phase: 'structure',
      },
    },
    {
      PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
      OPENAI_API_KEY: 'openai-key',
    },
    {
      requestCodexTurn: async (_config, body) => {
        seenThreadIds.push(body.codexThreadId)
        return {
          raw: JSON.stringify({
            reply: 'The workspace is in structure mode.',
            mode: 'chat',
            assumptions: [],
            ambiguities: [],
            actions: [],
            requiresReview: false,
            destructiveActionCount: 0,
          }),
          codexThreadId: body.codexThreadId ?? 'codex-thread-started',
        }
      },
    },
  )

  const secondTurn = await createAssistantTurnResult(
    {
      prompt: 'and what level is selected?',
      chatMode: 'ask',
      codexThreadId: firstTurn.turn.providerMeta?.codexThreadId,
      context: {
        phase: 'structure',
      },
      conversationHistory: [
        { role: 'user', text: 'describe the current workspace' },
        { role: 'assistant', text: firstTurn.turn.reply },
      ],
    },
    {
      PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
      OPENAI_API_KEY: 'openai-key',
    },
    {
      requestCodexTurn: async (_config, body) => {
        seenThreadIds.push(body.codexThreadId)
        return {
          raw: JSON.stringify({
            reply: 'No specific level is selected.',
            mode: 'chat',
            assumptions: [],
            ambiguities: [],
            actions: [],
            requiresReview: false,
            destructiveActionCount: 0,
          }),
          codexThreadId: body.codexThreadId ?? 'codex-thread-started',
        }
      },
    },
  )

  assert.deepEqual(seenThreadIds, [undefined, 'codex-thread-started'])
  assert.equal(firstTurn.provider, 'codex')
  assert.equal(firstTurn.turn.providerMeta?.provider, 'codex')
  assert.equal(firstTurn.turn.providerMeta?.model, 'gpt-5.3-codex')
  assert.equal(firstTurn.turn.providerMeta?.codexThreadId, 'codex-thread-started')
  assert.equal(secondTurn.turn.providerMeta?.codexThreadId, 'codex-thread-started')
})

test('createAssistantTurnResult returns a local clarify turn when Codex repair also fails validation', async () => {
  const seenBodies: AssistantPlanRequest[] = []

  const result = await createAssistantTurnResult(
    {
      prompt: 'design a sculptural concrete pavilion with layered stairs',
      chatMode: 'create',
      context: {
        phase: 'structure',
      },
    },
    {
      PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
      OPENAI_API_KEY: 'openai-key',
    },
    {
      requestCodexTurn: async (_config, body) => {
        seenBodies.push(body)
        return {
          raw: JSON.stringify({
            reply: 'Invalid planner output.',
            mode: 'plan',
            assumptions: [],
            ambiguities: [],
            actions: [{ type: 'invented_action' }],
            requiresReview: false,
            destructiveActionCount: 0,
          }),
          codexThreadId: body.codexThreadId ?? 'codex-thread-repair',
        }
      },
    },
  )

  assert.equal(seenBodies.length, 2)
  assert.equal(seenBodies[0]?.codexThreadId, undefined)
  assert.equal(seenBodies[1]?.codexThreadId, 'codex-thread-repair')
  assert.match(seenBodies[1]?.repairFeedback ?? '', /invalid/i)
  assert.equal(result.provider, 'codex')
  assert.equal(result.turn.mode, 'clarify')
  assert.equal(result.turn.providerMeta?.provider, 'fallback')
  assert.equal(result.turn.providerMeta?.model, 'deterministic-local')
})

test('createAssistantTurnResult bypasses Codex for image turns in phase 1', async () => {
  let codexCalled = false
  let openRouterCalled = false

  const result = await createAssistantTurnResult(
    {
      prompt: 'what is highlighted here?',
      chatMode: 'ask',
      image: {
        dataUrl: 'data:image/png;base64,workspace',
        kind: 'workspace',
        source: 'upload',
      },
      context: {
        phase: 'structure',
      },
    },
    {
      PISTOLA_ASSISTANT_AI_PROVIDER: 'codex',
      OPENAI_API_KEY: 'openai-key',
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestCodexTurn: async () => {
        codexCalled = true
        throw new Error('Codex should be bypassed for image turns.')
      },
      requestOpenRouterChatTurn: async () => {
        openRouterCalled = true
        return 'The highlighted region looks like the current selection.'
      },
    },
  )

  assert.equal(codexCalled, false)
  assert.equal(openRouterCalled, true)
  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.providerMeta?.provider, 'openrouter')
  assert.equal(result.turn.providerMeta?.model, 'openai/gpt-5.4')
})

test('createAssistantTurnResult answers prompt recall questions locally from conversation history', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'wha did I ask befoe?',
      context: {
        assistantSession: {
          recentSuccessfulPrompts: [],
          failedPrompts: [],
          taskPlans: [],
          taskPlanSummaries: [],
          preferredComplexity: 'simple',
          lastCreatedNodes: [],
          recentReferencedNodes: [],
          lastError: null,
        },
      },
      conversationHistory: [
        { role: 'user', text: 'create a box 1m x 1m x 1m' },
        { role: 'assistant', text: 'I can run a CAD build for that request.' },
        { role: 'user', text: 'make it taller' },
        {
          role: 'assistant',
          text: 'I could not finish remote planning in time. Try a narrower next step such as adjusting one wall, one opening, or one selected object.',
        },
        { role: 'user', text: 'hello' },
        {
          role: 'assistant',
          text: 'Hello! I can help create, edit, and refine scenes, place items, or build CAD parts. Tell me what you want to make.',
        },
      ],
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Conversation recall should stay on the deterministic local path.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'chat')
  assert.match(result.turn.reply, /make it taller/i)
  assert.match(result.turn.reply, /create a box 1m x 1m x 1m/i)
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult builds a spanish pet house locally without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'genera una casita para mi perro',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Deterministic pet-house prompts should not call the remote planner.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'plan')
  assert.match(result.turn.reply, /pet house|dog house/i)
  assert.deepEqual(stripRefIds(result.turn.actions), [
    {
      type: 'create_zone',
      levelId: 'level_0',
      name: 'Dog House',
      polygon: [[0, 0], [1.2, 0], [1.2, 1.4], [0, 1.4]],
      color: '#fde68a',
    },
    { type: 'create_wall', levelId: 'level_0', start: [0, 0], end: [0, 1.4], height: 0.8, thickness: 0.05 },
    { type: 'create_wall', levelId: 'level_0', start: [0, 1.4], end: [1.2, 1.4], height: 0.8, thickness: 0.05 },
    { type: 'create_wall', levelId: 'level_0', start: [1.2, 1.4], end: [1.2, 0], height: 0.8, thickness: 0.05 },
    { type: 'create_wall', levelId: 'level_0', start: [1.2, 0], end: [0, 0], height: 0.8, thickness: 0.05 },
    { type: 'create_slab', levelId: 'level_0', name: 'Dog House Slab', polygon: [[0, 0], [1.2, 0], [1.2, 1.4], [0, 1.4]] },
    { type: 'create_roof', levelId: 'level_0', name: 'Dog House Roof', corner1: [0, 0], corner2: [1.2, 1.4], height: 0.48 },
    { type: 'place_door', wallId: '$ref_pet_house_wall_front', localX: 0.6, width: 0.54, height: 0.5599999999999999 },
    { type: 'place_window', wallId: '$ref_pet_house_wall_front', localX: 0.6, localY: 0.68, width: 0.3, height: 0.2 },
  ])
})

test('createAssistantTurnResult keeps compound-word spanish pet-house prompts on the deterministic local path', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'ahora si genera una casabonita para perro',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Compound-word pet-house prompts should not call the remote planner.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'plan')
  assert.match(result.turn.reply, /pet house|dog house/i)
  assert.equal(result.turn.actions.some((action) => action.type === 'create_zone'), true)
  assert.equal(result.turn.actions.some((action) => action.type === 'create_roof'), true)
})

test('createAssistantTurnResult keeps broad house prompts that mention a dog house on the main house path', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'build a dream house with living room, kitchen, bedroom, and a dog house',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Mixed house prompts should stay on the deterministic house path.')
      },
    },
  )

  const serializedActions = JSON.stringify(stripRefIds(result.turn.actions))

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'plan')
  assert.match(result.turn.reply, /house shell|editable house/i)
  assert.match(serializedActions, /Living Room/)
  assert.match(serializedActions, /Kitchen/)
  assert.doesNotMatch(serializedActions, /Dog House/)
})

test('createAssistantTurnResult answers pet-house critique follow-ups locally from assistant session context', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'does that look like a house to you?',
      context: {
        assistantSession: {
          recentSuccessfulPrompts: ['genera una casita para mi perro'],
          lastCreatedNodes: [
            { id: 'zone_dog_house', type: 'zone', name: 'Dog House' },
            { id: 'roof_dog_house', type: 'roof', name: 'Dog House Roof' },
          ],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Pet-house critique follow-ups should stay on the deterministic local path.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'chat')
  assert.match(result.turn.reply, /open shelter shell|finished house/i)
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult routes image questions through the remote chat path instead of the planner', async () => {
  let plannerCalled = false
  let chatCalled = false

  const result = await createAssistantTurnResult(
    {
      prompt: 'what is in the middle?',
      chatMode: 'create',
      image: {
        dataUrl: 'data:image/png;base64,workspace',
        kind: 'workspace',
        source: 'upload',
      },
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
      PISTOLA_ASSISTANT_MODEL: 'openai/gpt-5.4',
    },
    {
      requestOpenRouterTurn: async () => {
        plannerCalled = true
        throw new Error('Image questions should not use the planning path.')
      },
      requestOpenRouterChatTurn: async () => {
        chatCalled = true
        return 'There is an empty recessed opening in the middle of the current room shell.'
      },
    },
  )

  assert.equal(chatCalled, true)
  assert.equal(plannerCalled, false)
  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'chat')
  assert.match(result.turn.reply, /middle|opening|recessed/i)
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult turns pending box follow-ups into a local clarify turn', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'make it taller',
      context: {
        selection: {
          selectedIds: [],
        },
        assistantSession: {
          recentSuccessfulPrompts: [],
          failedPrompts: [],
          taskPlans: [],
          taskPlanSummaries: [],
          preferredComplexity: 'simple',
          lastCreatedNodes: [],
          recentReferencedNodes: [],
          lastError: null,
        },
      },
      conversationHistory: [
        { role: 'user', text: 'create a box 1m x 1m x 1m' },
        { role: 'assistant', text: 'I can run a CAD build for that request.' },
      ],
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Pending box follow-ups should stay on the deterministic local path.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /pending box request/i)
  assert.match(result.turn.reply, /1m x 1m x 1m/i)
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult turns workspace image cleanup into a reviewable delete plan', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'clean this area',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [
          { id: 'wall_a', type: 'wall', name: 'Wall A' },
          { id: 'wall_b', type: 'wall', name: 'Wall B' },
          { id: 'slab_a', type: 'slab', name: 'Slab A' },
        ],
      },
      image: {
        dataUrl: 'data:image/png;base64,workspace-cleanup',
        kind: 'workspace',
        source: 'upload',
        analysis: {
          hasRedMarkup: true,
          redMarkupBounds: { x: 0.2, y: 0.18, width: 0.42, height: 0.48 },
          imageWidth: 1024,
          imageHeight: 768,
          redPixelCount: 1200,
        },
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.requiresReview, true)
  assert.equal(result.turn.actions[0]?.type, 'delete_nodes')
  assert.match(result.turn.targetingExplanation ?? '', /workspace context/i)
  assert.ok((result.turn.targetCandidates?.length ?? 0) >= 2)
})

test('createAssistantTurnResult resolves a workspace image move request without manual selection', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'move this window left',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'window_front', type: 'window', name: 'Front Window' }],
      },
      image: {
        dataUrl: 'data:image/png;base64,workspace-window',
        kind: 'workspace',
        source: 'upload',
        analysis: {
          hasRedMarkup: true,
          redMarkupBounds: { x: 0.45, y: 0.2, width: 0.2, height: 0.22 },
          imageWidth: 1024,
          imageHeight: 768,
          redPixelCount: 910,
        },
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'move_target')
  assert.match(result.turn.targetingExplanation ?? '', /annotated screenshot|screenshot target/i)
})

test('createAssistantTurnResult removes a single screenshot-grounded target without manual selection', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'remove this',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'roof_main', type: 'roof', name: 'Main Roof' }],
      },
      image: {
        dataUrl: 'data:image/png;base64,workspace-roof',
        kind: 'workspace',
        source: 'upload',
        analysis: {
          hasRedMarkup: true,
          redMarkupBounds: { x: 0.38, y: 0.16, width: 0.24, height: 0.18 },
          imageWidth: 1365,
          imageHeight: 768,
          redPixelCount: 880,
        },
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'delete_target')
  assert.match(result.turn.targetingExplanation ?? '', /screenshot/i)
})

test('createAssistantTurnResult returns a reviewable multi-target delete plan for highlighted walls', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'delete the highlighted walls',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [
          { id: 'wall_a', type: 'wall', name: 'Wall A' },
          { id: 'wall_b', type: 'wall', name: 'Wall B' },
          { id: 'wall_c', type: 'wall', name: 'Wall C' },
        ],
      },
      image: {
        dataUrl: 'data:image/png;base64,workspace-walls',
        kind: 'workspace',
        source: 'upload',
        analysis: {
          hasRedMarkup: true,
          redMarkupBounds: { x: 0.15, y: 0.17, width: 0.64, height: 0.56 },
          imageWidth: 1200,
          imageHeight: 800,
          redPixelCount: 2110,
        },
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.requiresReview, true)
  assert.equal(result.turn.actions[0]?.type, 'delete_nodes')
  assert.equal((result.turn.targetCandidates?.length ?? 0) >= 2, true)
})

test('createAssistantTurnResult repairs common planner alias drift before validation', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'switch to furnish mode',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () =>
        JSON.stringify({
          reply: 'I will switch to furnishing.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [{ type: 'set-phase', phase: 'furniture' }],
          requiresReview: false,
          destructiveActionCount: 0,
        }),
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'set_phase', phase: 'furnish' }])
})

test('createAssistantTurnResult converts unrecoverable planner drift into a safe clarification', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'clean de area',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
      image: {
        dataUrl: 'data:image/png;base64,workspace-schema',
        kind: 'workspace',
        source: 'upload',
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async (_config, body) => {
        if (body.retry) {
          return JSON.stringify({
            reply: 'broken',
            mode: 'plan',
            assumptions: [],
            ambiguities: [],
            actions: [{ type: 'set_phase', phase: 'structure|furnish|cad' }],
            requiresReview: false,
            destructiveActionCount: 0,
          })
        }

        return JSON.stringify({
          reply: 'broken',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [{ type: 'set-phase', phase: 'furnitureish' }],
          requiresReview: false,
          destructiveActionCount: 0,
        })
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /smaller first step|specific target/i)
  assert.doesNotMatch(result.turn.ambiguities.join(' '), /invalid option|expected one of/i)
})

test('createAssistantTurnResult builds a spanish house prompt locally without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'haz una casa pequeña con cocina y sala',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Deterministic house prompts should not call the remote planner.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.match(result.turn.reply, /house shell/i)
  assert.ok(result.turn.actions.some((action) => action.type === 'create_zone'))
  assert.ok(result.turn.actions.some((action) => action.type === 'create_roof'))
})

test('createAssistantTurnResult adds a roof over the selected room for the spanish roof follow-up', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'ponle techo',
      context: {
        selection: {
          levelId: 'level_0',
          zoneId: 'zone_room',
          selectedIds: [],
        },
        selectedNodeSummary: [
          {
            id: 'zone_room',
            type: 'zone',
            name: 'Room',
            parentId: 'level_0',
            polygon: [[1, 2], [5, 2], [5, 5], [1, 5]],
          },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Deterministic roof follow-ups should not call the remote planner.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'create_roof',
      levelId: 'level_0',
      name: 'Room Roof',
      corner1: [1, 2],
      corner2: [5, 5],
      height: 1.4,
    },
  ])
})

test('createAssistantTurnResult adds windows for the spanish opening follow-up without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'agrega ventanas',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: ['wall_front'],
        },
        selectedNodeSummary: [
          {
            id: 'wall_front',
            type: 'wall',
            name: 'Front Wall',
            parentId: 'level_0',
            start: [0, 0],
            end: [6, 0],
          },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Deterministic window follow-ups should not call the remote planner.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'place_window',
      wallId: 'wall_front',
      localX: 3,
      localY: 1.4,
      width: 1.32,
      height: 1.2,
    },
  ])
})

test('createAssistantTurnResult parses spanish planar metric dimensions for deterministic room recipes', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'crea una habitación de 2 metros x 3 metros con techo',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Deterministic room recipes should not call the remote planner.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  const zoneAction = result.turn.actions.find((action) => action.type === 'create_zone')
  assert.ok(zoneAction)
  if (!zoneAction || zoneAction.type !== 'create_zone') {
    assert.fail('Expected a deterministic room recipe.')
  }
  assert.deepEqual(zoneAction.polygon, [
    [0, 0],
    [2, 0],
    [2, 3],
    [0, 3],
  ])
})

test('createAssistantTurnResult parses medio metro for spanish window refinements', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'haz las ventanas más altas medio metro',
      context: {
        selectedNodeSummary: [
          {
            id: 'window_selected',
            type: 'window',
            height: 1.2,
          },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Deterministic window refinements should not call the remote planner.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'update_window_properties',
      nodeId: 'window_selected',
      height: 1.7,
    },
  ])
})

test('createAssistantTurnResult can continue a chunked deterministic plan', async () => {
  const firstTurn = await createAssistantTurnResult(
    {
      prompt: 'make a furnished small two-bedroom house with kitchen and living room',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic house planner should not call the remote provider.')
      },
    },
  )

  assert.equal(firstTurn.turn.mode, 'plan')
  assert.equal(firstTurn.turn.continuation?.kind, 'local-sequence')
  assert.equal(firstTurn.turn.actions.length, 25)

  const secondTurn = await createAssistantTurnResult(
    {
      prompt: 'make a furnished small two-bedroom house with kitchen and living room',
      continuation: firstTurn.turn.continuation
        ? {
          ...firstTurn.turn.continuation,
          resolvedRefs: {
            '$ref_zone_0': 'zone_living',
            '$ref_zone_1': 'zone_kitchen',
            '$ref_zone_2': 'zone_bedroom_1',
            '$ref_zone_3': 'zone_bedroom_2',
          },
        }
        : undefined,
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('Continuation should stay local for deterministic chunked plans.')
      },
    },
  )

  assert.equal(secondTurn.turn.mode, 'plan')
  assert.ok(secondTurn.turn.actions.length > 0)
  assert.equal(secondTurn.turn.continuation ?? null, null)
})

test('createAssistantTurnResult retries once when the planner returns invalid actions', async () => {
  let callCount = 0

  const result = await createAssistantTurnResult(
    {
      prompt: 'create a wall',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async (_config, body) => {
        callCount += 1

        if ((body.retry ?? 0) === 0) {
          return JSON.stringify({
            reply: 'I can create a wall.',
            mode: 'plan',
            assumptions: [],
            ambiguities: [],
            actions: [
              {
                type: 'create_wall',
                from: [0, 0],
                to: [4, 0],
              },
            ],
            requiresReview: true,
            destructiveActionCount: 0,
          })
        }

        assert.match(body.repairFeedback ?? '', /Action 1/)

        return JSON.stringify({
          reply: 'I can create a wall.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [
            {
              type: 'create_wall',
              start: [0, 0],
              end: [4, 0],
            },
          ],
          requiresReview: true,
          destructiveActionCount: 0,
        })
      },
    },
  )

  assert.equal(callCount, 2)
  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'create_wall')
})

test('createAssistantTurnResult retries once when the planner returns a sequence-invalid reviewed plan', async () => {
  let callCount = 0

  const result = await createAssistantTurnResult(
    {
      prompt: 'remote sequence validation test',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async (_config, body) => {
        callCount += 1

        if ((body.retry ?? 0) === 0) {
          return JSON.stringify({
            reply: 'I can replace the roof.',
            mode: 'plan',
            assumptions: [],
            ambiguities: [],
            actions: [
              { type: 'delete_target', nodeId: 'roof_old' },
              {
                type: 'create_roof',
                refId: '$ref_roof_0',
                levelId: 'level_0',
                corner1: [0, 0],
                corner2: [1.9, 1.4],
                height: 0.6,
              },
              { type: 'rename_node', nodeId: 'roof_old', name: 'Dog House Roof' },
            ],
            requiresReview: true,
            destructiveActionCount: 1,
          })
        }

        assert.match(body.repairFeedback ?? '', /deleted earlier in this reviewed plan/i)

        return JSON.stringify({
          reply: 'I can replace the roof.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [
            { type: 'delete_target', nodeId: 'roof_old' },
            {
              type: 'create_roof',
              refId: '$ref_roof_0',
              levelId: 'level_0',
              corner1: [0, 0],
              corner2: [1.9, 1.4],
              height: 0.6,
            },
            { type: 'rename_node', nodeId: '$ref_roof_0', name: 'Dog House Roof' },
          ],
          requiresReview: true,
          destructiveActionCount: 1,
        })
      },
    },
  )

  assert.equal(callCount, 2)
  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(stripRefIds(result.turn.actions), [
    { type: 'delete_target', nodeId: 'roof_old' },
    {
      type: 'create_roof',
      levelId: 'level_0',
      corner1: [0, 0],
      corner2: [1.9, 1.4],
      height: 0.6,
    },
    { type: 'rename_node', nodeId: '$ref_roof_0', name: 'Dog House Roof' },
  ])
})

test('createAssistantTurnResult preserves task-plan mode and steps from the remote planner', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'make a furnished office with reception lobby and lounge seating',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async (_config, body) => {
        assert.equal(body.complexity, 'complex')

        return JSON.stringify({
          reply: 'I will split this into structure and furnishing steps.',
          mode: 'task-plan',
          assumptions: [],
          ambiguities: [],
          actions: [],
          steps: [
            {
              description: 'Create the shell.',
              agent: 'structure',
              actions: [{ type: 'create_level', name: 'Ground Floor' }],
            },
            {
              description: 'Furnish the main room.',
              agent: 'furnish',
              actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
            },
          ],
          requiresReview: true,
          destructiveActionCount: 0,
        })
      },
    },
  )

  assert.equal(result.turn.mode, 'task-plan')
  assert.equal(result.turn.steps?.length, 2)
  assert.equal(result.turn.steps?.[0]?.agent, 'structure')
})

test('createAssistantTurnResult normalizes redundant last-write-wins planner actions before review', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'set preview on, then off',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () =>
        JSON.stringify({
          reply: 'I can update the view state.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [
            { type: 'set_preview_mode', enabled: true },
            { type: 'set_preview_mode', enabled: false },
            { type: 'set_grid_visibility', enabled: false },
            { type: 'set_grid_visibility', enabled: false },
          ],
          requiresReview: false,
          destructiveActionCount: 0,
        }),
    },
  )

  assert.deepEqual(result.turn.actions, [
    { type: 'set_preview_mode', enabled: false },
    { type: 'set_grid_visibility', enabled: false },
  ])
})

test('createAssistantTurnResult falls back to clarify when repaired planner actions are still invalid', async () => {
  let callCount = 0

  const result = await createAssistantTurnResult(
    {
      prompt: 'create a wall',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        callCount += 1
        return JSON.stringify({
          reply: 'I can create a wall.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [
            {
              type: 'create_wall',
              from: [0, 0],
              to: [4, 0],
            },
          ],
          requiresReview: true,
          destructiveActionCount: 0,
        })
      },
    },
  )

  assert.equal(callCount, 2)
  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.ambiguities[0] ?? '', /unsupported action values|malformed response/i)
})

test('createAssistantTurnResult falls back to clarify when repaired reviewed plans stay sequence-invalid', async () => {
  let callCount = 0

  const result = await createAssistantTurnResult(
    {
      prompt: 'remote sequence validation test',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        callCount += 1
        return JSON.stringify({
          reply: 'I can replace the roof.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [
            { type: 'delete_target', nodeId: 'roof_old' },
            {
              type: 'create_roof',
              refId: '$ref_roof_0',
              levelId: 'level_0',
              corner1: [0, 0],
              corner2: [1.9, 1.4],
              height: 0.6,
            },
            { type: 'rename_node', nodeId: 'roof_old', name: 'Dog House Roof' },
          ],
          requiresReview: true,
          destructiveActionCount: 1,
        })
      },
    },
  )

  assert.equal(callCount, 2)
  assert.equal(result.turn.mode, 'clarify')
  assert.match(
    result.turn.ambiguities[0] ?? '',
    /unsupported action values|more specific target|malformed response/i,
  )
})

test('createAssistantTurnResult falls back to a deterministic clarify turn when the remote planner times out on a box prompt', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'build a box',
      context: {
        selection: {
          levelId: 'level_0',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The operation was aborted due to timeout')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /box dimensions/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult returns a fallback task-plan when a complex remote request times out', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'make a furnished office with reception lobby, sofa seating, and facade lighting',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('OpenRouter assistant planning timed out after 90 seconds.')
      },
    },
  )

  assert.ok(
    result.turn.mode === 'plan' || result.turn.mode === 'task-plan' || result.turn.mode === 'clarify',
  )
  assert.ok(result.turn.reply.length > 0)
})

test('createAssistantTurnResult handles a very long complex prompt gracefully when the remote planner times out', async () => {
  const prompt = `make a furnished house with kitchen living room dining room office patio storage bathroom facade lighting and editable furniture ${'with windows doors walls slab ceiling roof layout furnishing refinement '.repeat(
    12,
  )}`.trim()

  assert.ok(prompt.length > 500)

  const result = await createAssistantTurnResult(
    {
      prompt,
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('OpenRouter assistant planning timed out after 90 seconds.')
      },
    },
  )

  assert.ok(
    result.turn.mode === 'plan' || result.turn.mode === 'task-plan' || result.turn.mode === 'clarify',
  )
  assert.ok(result.turn.reply.length > 0)
})

test('createAssistantTurnResult returns a deterministic clarify turn for an underspecified box prompt without calling the remote planner', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'build a box',
      context: {
        selection: {
          levelId: 'level_0',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('remote planner should not be called for underspecified box prompts')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /box dimensions/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult returns a deterministic CAD build plan for a dimensioned box prompt without calling the remote planner', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'build a box 1m x 2m x 0.5m',
      context: {
        selection: {
          levelId: 'level_0',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('remote planner should not be called for deterministic box build prompts')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'execute_cad_brief')
  if (!result.turn.actions[0] || result.turn.actions[0].type !== 'execute_cad_brief') {
    assert.fail('Expected a direct execute_cad_brief action for deterministic box prompts.')
  }
  assert.equal(result.turn.actions[0].brief.intent, 'build a box 1m x 2m x 0.5m')
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult falls back to a deterministic tool-switch plan when the remote planner times out', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'switch to structure and open the wall tool',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterChatTurn: async () => {
        throw new Error('OpenRouter assistant planning timed out after 60 seconds.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'set_phase', phase: 'structure' },
    { type: 'activate_tool', tool: 'wall' },
  ])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct camera mode action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'switch the camera to orthographic',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic viewer planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'set_camera_mode', cameraMode: 'orthographic' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct item-tool activation with catalog category without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'open the kitchen item tool',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic tool planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'activate_tool', tool: 'item', catalogCategory: 'kitchen' },
  ])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct building focus plan without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'focus the building',
      context: {
        selection: {
          buildingId: 'building_123',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic building planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'focus_building', buildingId: 'building_123' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct clear-selection plan without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'clear selection',
      context: {
        selection: {
          selectedIds: ['wall_123'],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selection planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'select_nodes', nodeIds: [] }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct batch delete plan for multiple selected nodes without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'delete the selected objects',
      context: {
        selection: {
          selectedIds: ['wall_123', 'roof_456'],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic delete planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'delete_nodes', nodeIds: ['wall_123', 'roof_456'] }])
  assert.equal(result.turn.requiresReview, true)
  assert.equal(result.turn.destructiveActionCount, 1)
})

test('createAssistantTurnResult uses bounded level cleanup for clean-everything prompts', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'clean everything',
      chatMode: 'create',
      sessionId: 'assistant-session-cleanup',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: ['slab_old'],
        },
        selectedNodeSummary: [{ id: 'slab_old', type: 'slab', name: 'Old Slab', parentId: 'level_0' }],
        sceneSummary: [{ id: 'wall_old', type: 'wall', name: 'Old Wall', parentId: 'level_0' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic cleanup planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'clear_level_contents', levelId: 'level_0' }])
  assert.equal(result.turn.requiresReview, true)
  assert.equal(result.turn.destructiveActionCount, 1)
})

test('createAssistantTurnResult can refine the most recent assistant-created target when no selection is active', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'delete it',
      chatMode: 'refine',
      sessionId: 'assistant-session-refine',
      context: {
        selection: {
          selectedIds: [],
        },
        assistantSession: {
          sessionId: 'assistant-session-refine',
          chatMode: 'refine',
          lastCreatedNodes: [{ id: 'roof_recent', type: 'roof', name: 'Recent Roof', parentId: 'level_0' }],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic refine planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'delete_target', nodeId: 'roof_recent' }])
  assert.match(result.turn.reply, /delete the selected target/i)
})

test('createAssistantTurnResult can refine a recently referenced target when no selection is active', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'move it left',
      chatMode: 'refine',
      sessionId: 'assistant-session-refine-reference',
      context: {
        selection: {
          selectedIds: [],
        },
        assistantSession: {
          sessionId: 'assistant-session-refine-reference',
          chatMode: 'refine',
          recentReferencedNodes: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic refine planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'move_target', nodeId: 'item_sofa', delta: [-1, 0, 0] }])
  assert.match(result.turn.assumptions[0] ?? '', /most recently referenced item/i)
})

test('createAssistantTurnResult can resolve an explicit node id from the prompt when no selection is active', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'move item_42 left',
      chatMode: 'refine',
      context: {
        selection: {
          selectedIds: [],
        },
        selectedNodeSummary: [
          {
            id: 'item_42',
            type: 'item',
            name: 'Bar Stool',
          },
        ],
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'move_target')
  assert.equal((result.turn.actions[0] as { nodeId?: string } | undefined)?.nodeId, 'item_42')
  assert.match(result.turn.assumptions[0] ?? '', /Bar Stool|item_42/)
})

test('createAssistantTurnResult returns a direct preview toggle without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'enter preview mode',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic viewer planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'set_preview_mode', enabled: true }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct scans visibility toggle without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'hide scans',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic viewer planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'set_scans_visibility', enabled: false }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct top-view action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'top view',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic viewer planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'camera_top_view' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct orbit action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'orbit left',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic viewer planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'orbit_camera', direction: 'ccw' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct fullscreen toggle without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'enter fullscreen',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic viewer planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'set_fullscreen', enabled: true }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct undo action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'undo',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic history planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'undo_history' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct IFC export action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'export the scene as IFC',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic export planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'export_scene', format: 'ifc' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct screenshot action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'take a screenshot',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic export planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'take_screenshot' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct transform-mode action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'open rotate gizmo',
      context: {
        selection: {
          selectedIds: ['item_selected'],
        },
        selectedNodeSummary: [{ id: 'item_selected', type: 'item' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic transform planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'set_transform_mode', transformMode: 'rotate' }])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a direct camera snapshot action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'take a camera snapshot',
      context: {
        selection: {
          selectedIds: ['item_selected'],
        },
        selectedNodeSummary: [{ id: 'item_selected', type: 'item' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic snapshot planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'capture_camera_snapshot', nodeId: 'item_selected' }])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult clarifies when the user asks for a camera snapshot without a valid target', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'take a camera snapshot',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic snapshot planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /camera snapshot/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult returns a direct CAD workplane action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'switch the CAD workplane to XZ',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD helper planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'set_phase', phase: 'cad' },
    { type: 'set_cad_workplane', workplane: 'XZ' },
  ])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult returns a sketch creation plan on the requested workplane without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'create a new sketch on the XZ workplane',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD helper planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'set_phase', phase: 'cad' },
    { type: 'set_cad_workplane', workplane: 'XZ' },
    { type: 'create_default_cad_sketch' },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct duplicate action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'duplicate the selected object',
      context: {
        selection: {
          selectedIds: ['item_selected'],
        },
        selectedNodeSummary: [{ id: 'item_selected', type: 'item' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-target planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'duplicate_target', nodeId: 'item_selected' }])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct delete action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'delete the selected roof',
      context: {
        selection: {
          selectedIds: ['roof_selected'],
        },
        selectedNodeSummary: [{ id: 'roof_selected', type: 'roof' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-target planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'delete_target', nodeId: 'roof_selected' }])
  assert.equal(result.turn.destructiveActionCount, 1)
})

test('createAssistantTurnResult returns a direct move action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'move the selected item 2m right',
      context: {
        selection: {
          selectedIds: ['item_selected'],
        },
        selectedNodeSummary: [{ id: 'item_selected', type: 'item' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-target planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'move_target', nodeId: 'item_selected', delta: [2, 0, 0] },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct rotate action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'rotate the selected item to 90 degrees',
      context: {
        selection: {
          selectedIds: ['item_selected'],
        },
        selectedNodeSummary: [{ id: 'item_selected', type: 'item' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-target planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'rotate_target', nodeId: 'item_selected', rotationY: Math.PI / 2 },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct scale action for the selected target without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'scale the selected item to 150%',
      context: {
        selection: {
          selectedIds: ['item_selected'],
        },
        selectedNodeSummary: [{ id: 'item_selected', type: 'item' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-target planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    { type: 'scale_target', nodeId: 'item_selected', scale: [1.5, 1.5, 1.5] },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult clarifies when a transform-style prompt is used with multiple selected targets', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'duplicate the selected objects',
      context: {
        selection: {
          selectedIds: ['item_a', 'item_b'],
        },
        selectedNodeSummary: [
          { id: 'item_a', type: 'item' },
          { id: 'item_b', type: 'item' },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-target planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /single selected target/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult falls back to a selected-body CAD edit plan for the Spanish ears prompt when the remote planner times out', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'al cubo conviertelo en la superficie dale unas orejas',
      context: {
        selectedNodeSummary: [{ id: 'cbody_selected', type: 'cad-body' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-body CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'add_cad_box_ears')
  assert.equal(result.turn.actions[0]?.bodyId, 'cbody_selected')
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct shell action for the selected CAD body without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'convert the selected body into a shell surface',
      context: {
        selectedNodeSummary: [{ id: 'cbody_selected', type: 'cad-body' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-body CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'shell_cad_body', bodyId: 'cbody_selected' }])
  assert.equal(result.turn.requiresReview, true)
  assert.equal(result.turn.destructiveActionCount, 1)
})

test('createAssistantTurnResult returns a direct face-extrusion action for the selected CAD body without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'add a front tab 0.2 m',
      context: {
        selectedNodeSummary: [{ id: 'cbody_selected', type: 'cad-body' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-body CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'extrude_cad_body_face',
      bodyId: 'cbody_selected',
      face: 'front',
      distance: 0.2,
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct fillet action for the selected CAD body without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'fillet the selected body',
      context: {
        selectedNodeSummary: [{ id: 'cbody_selected', type: 'cad-body' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-body CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'apply_cad_fillet',
      bodyId: 'cbody_selected',
      radius: 0.08,
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct close sketch action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'close the sketch',
      context: {
        selectedNodeSummary: [
          {
            id: 'csketch_selected',
            type: 'cad-sketch',
            closedProfileEntityIds: ['profile_1'],
          },
        ],
        cad: {
          activeSketchId: 'csketch_selected',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD helper planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'close_cad_sketch',
      sketchId: 'csketch_selected',
    },
  ])
  assert.equal(result.turn.requiresReview, false)
})

test('createAssistantTurnResult clarifies when the user asks to close a sketch without an active sketch', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'close the sketch',
      context: {},
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD helper planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /active cad sketch/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult degrades timeouts into a chat fallback instead of throwing', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'does this layout feel balanced?',
      chatMode: 'ask',
      context: {
        sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterChatTurn: async () => {
        throw new Error('OpenRouter assistant planning timed out after 60 seconds.')
      },
    },
  )

  assert.equal(result.provider, 'openrouter')
  assert.equal(result.turn.mode, 'chat')
  assert.match(result.turn.reply, /could not finish/i)
  assert.match(result.turn.assumptions[0] ?? '', /No scene changes were applied/i)
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult returns a direct boolean action for two selected CAD bodies without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'union the selected bodies',
      context: {
        selectedNodeSummary: [
          { id: 'cbody_target', type: 'cad-body' },
          { id: 'cbody_tool', type: 'cad-body' },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-body CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'apply_cad_boolean',
      operation: 'union',
      targetBodyId: 'cbody_target',
      toolBodyId: 'cbody_tool',
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct sketch extrude action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'extrude this sketch 0.5m',
      context: {
        selectedNodeSummary: [
          {
            id: 'csketch_selected',
            type: 'cad-sketch',
            closedProfileEntityIds: ['profile_1'],
          },
        ],
        cad: {
          activeSketchId: 'csketch_selected',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-sketch CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'extrude_cad_sketch',
      sketchId: 'csketch_selected',
      depth: 0.5,
      direction: 'positive',
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult clarifies when the selected sketch has no closed profile for extrusion', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'extrude this sketch',
      context: {
        selectedNodeSummary: [
          {
            id: 'csketch_selected',
            type: 'cad-sketch',
            closedProfileEntityIds: [],
          },
        ],
        cad: {
          activeSketchId: 'csketch_selected',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-sketch CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /closed sketch profile/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult returns a direct sketch revolve action without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'revolve the selected sketch 180 degrees around x',
      context: {
        selectedNodeSummary: [
          {
            id: 'csketch_selected',
            type: 'cad-sketch',
            closedProfileEntityIds: ['profile_1'],
          },
        ],
        cad: {
          activeSketchId: 'csketch_selected',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-sketch CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'revolve_cad_sketch',
      sketchId: 'csketch_selected',
      angle: 180,
      axis: 'X',
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct retry action for the selected CAD body without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'retry the selected body',
      context: {
        selectedNodeSummary: [{ id: 'cbody_selected', type: 'cad-body' }],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic selected-body CAD planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'retry_cad_body',
      bodyId: 'cbody_selected',
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct suppress-operation action for the selected CAD body without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'suppress the last fillet on the selected body',
      context: {
        selectedNodeSummary: [
          {
            id: 'cbody_selected',
            type: 'cad-body',
            operations: [
              { id: 'cadop_extrude', kind: 'extrude', suppressed: false },
              { id: 'cadop_fillet', kind: 'fillet', suppressed: false },
            ],
          },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD operation planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'set_cad_body_operation_suppressed',
      bodyId: 'cbody_selected',
      operationId: 'cadop_fillet',
      suppressed: true,
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult returns a direct restore-operation action for the selected CAD body without calling the remote provider', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'restore the last fillet on the selected body',
      context: {
        selectedNodeSummary: [
          {
            id: 'cbody_selected',
            type: 'cad-body',
            operations: [
              { id: 'cadop_fillet', kind: 'fillet', suppressed: true },
            ],
          },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD operation planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'set_cad_body_operation_suppressed',
      bodyId: 'cbody_selected',
      operationId: 'cadop_fillet',
      suppressed: false,
    },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult clarifies when the selected CAD body operation target is ambiguous', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'suppress the operation on the selected body',
      context: {
        selectedNodeSummary: [
          {
            id: 'cbody_selected',
            type: 'cad-body',
            operations: [
              { id: 'cadop_extrude', kind: 'extrude', suppressed: false },
              { id: 'cadop_fillet', kind: 'fillet', suppressed: false },
            ],
          },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic CAD operation planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'clarify')
  assert.match(result.turn.reply, /specific cad body operation/i)
  assert.equal(result.turn.actions.length, 0)
})

test('createAssistantTurnResult keeps forward refs for deterministic house shell recipes', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'make a small two-bedroom house with kitchen and living room',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        throw new Error('The deterministic house-shell planner should not call the remote provider.')
      },
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.ok(
    result.turn.actions.some((action) => action.type === 'create_wall' && action.refId === '$ref_wall_0'),
  )

  const doorAction = result.turn.actions.find((action) => action.type === 'place_door')
  assert.ok(doorAction)
  if (!doorAction || doorAction.type !== 'place_door') {
    assert.fail('Expected the deterministic house-shell plan to include a door placement.')
  }
  assert.equal(doorAction.wallId, '$ref_wall_0')
})

test('createAssistantTurnResult routes replace commands through a deterministic replacement plan', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'replace this sofa with a chair',
      context: {
        selection: {
          selectedIds: ['item_sofa'],
        },
        selectedNodeSummary: [
          {
            id: 'item_sofa',
            type: 'item',
            name: 'Sofa',
            parentId: 'zone_living',
            position: [2, 0, 2],
          },
        ],
        sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' }],
        catalog: [{ id: 'chair', name: 'Chair', category: 'furniture', attachTo: null, tags: ['seat'] }],
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [
    {
      type: 'place_item',
      assetId: 'chair',
      targetNodeId: 'zone_living',
      placement: 'explicit',
      position: [2, 0, 2],
    },
    { type: 'delete_target', nodeId: 'item_sofa' },
  ])
  assert.equal(result.turn.requiresReview, true)
})

test('createAssistantTurnResult does not match a catalog tag inside a longer prompt word', async () => {
  let remotePlannerCalled = false

  const result = await createAssistantTurnResult(
    {
      prompt: 'add a 4m x 4m room with walls',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'level_0', type: 'level', name: null, level: 0, childIds: [] }],
        catalog: [
          {
            id: 'cube',
            name: 'Cube',
            category: 'furniture',
            attachTo: null,
            tags: ['floor', 'primitive'],
          },
          {
            id: 'ev-wall-charger',
            name: 'Ev-wall-charger',
            category: 'appliance',
            attachTo: 'wall',
            tags: ['wall', 'garage'],
          },
          { id: 'door', name: 'Door', category: 'door', attachTo: 'wall', tags: ['wall'] },
        ],
      },
    },
    {
      ...NO_CODEX_AUTH,
      OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () => {
        remotePlannerCalled = true
        return JSON.stringify({
          reply: 'I can create a rectangular room with walls.',
          mode: 'plan',
          assumptions: [],
          ambiguities: [],
          actions: [],
          requiresReview: false,
          destructiveActionCount: 0,
        })
      },
    },
  )

  // "wall" is a tag on several catalog items, but the prompt says "walls" — a
  // different word describing the room's construction. Substring matching used
  // to read this as a request to place the first wall-mounted asset and never
  // consult the planner at all.
  assert.doesNotMatch(JSON.stringify(result.turn.actions), /ev-wall-charger/)
  assert.equal(remotePlannerCalled, true)
})

test('createAssistantTurnResult still matches an explicitly named catalog item', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'add a sofa',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'level_0', type: 'level', name: null, level: 0, childIds: [] }],
        catalog: [
          {
            id: 'sofa',
            name: 'Sofa',
            category: 'furniture',
            attachTo: null,
            tags: ['seating', 'couch'],
          },
        ],
      },
    },
    {},
  )

  assert.match(JSON.stringify(result.turn.actions), /"assetId":"sofa"/)
})

test('createAssistantTurnResult routes reset-style level cleanup prompts deterministically', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'reset everything on this level',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'wall_a', type: 'wall', name: 'Wall A', parentId: 'level_0' }],
      },
    },
    {},
  )

  assert.equal(result.turn.mode, 'plan')
  assert.deepEqual(result.turn.actions, [{ type: 'clear_level_contents', levelId: 'level_0' }])
  assert.equal(result.turn.destructiveActionCount, 1)
})

test('createAssistantTurnResult preserves explicit non-workspace image assumptions for buildable image plans', async () => {
  const scenarios = [
    {
      kind: 'floorplan' as const,
      requestKind: 'floorplan' as const,
      prompt: 'recreate this floor plan approximately',
      expected: [/editable structural geometry/i, /inferred scale/i, /nearest editable proxy/i],
    },
    {
      kind: 'room-reference' as const,
      requestKind: 'auto' as const,
      prompt: 'use this room reference to furnish the room approximately',
      expected: [/editable furniture layout/i, /scale and spacing are inferred/i, /editable catalog proxies/i],
    },
    {
      kind: 'sketch' as const,
      requestKind: 'sketch' as const,
      prompt: 'create a simple bracket approximation from this drawing',
      expected: [/simple editable geometry/i, /scale is inferred/i, /nearest editable proxy/i],
    },
    {
      kind: 'reference' as const,
      requestKind: 'reference' as const,
      prompt: 'use this reference to build an approximate pavilion',
      expected: [/nearest editable geometry or catalog proxies/i, /scale is inferred/i, /exact replica/i],
    },
  ]

  for (const scenario of scenarios) {
    const result = await createAssistantTurnResult(
      {
        prompt: scenario.prompt,
        image: {
          dataUrl: `data:image/png;base64,${scenario.kind}`,
          kind: scenario.requestKind,
          source: 'upload',
          filename: `${scenario.kind}.png`,
        },
        context: {
          selection: {
            levelId: 'level_0',
            selectedIds: [],
          },
          sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' }],
        },
      },
      {
        ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
      },
      {
        requestOpenRouterTurn: async () =>
          JSON.stringify({
            reply: `Planning from the ${scenario.kind} image.`,
            mode: 'plan',
            assumptions: [],
            ambiguities: [],
            actions: [{ type: 'create_zone', levelId: 'level_0', name: 'Approx Room', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
            requiresReview: true,
            destructiveActionCount: 0,
          }),
      },
    )

    for (const pattern of scenario.expected) {
      assert.ok(
        result.turn.assumptions.some((assumption) => pattern.test(assumption)),
        `Expected ${scenario.kind} assumptions to contain ${pattern}.`,
      )
    }
  }
})

test('createAssistantTurnResult treats auto image intent as workspace-first when viewport and UI cues match the editor', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'remove this',
      context: {
        selection: {
          levelId: 'level_0',
          selectedIds: [],
        },
        sceneSummary: [{ id: 'roof_main', type: 'roof', name: 'Main Roof', parentId: 'level_0' }],
      },
      image: {
        dataUrl: 'data:image/png;base64,workspace-roof',
        kind: 'auto',
        source: 'upload',
        filename: 'reference.png',
        viewport: {
          width: 1365,
          height: 768,
          devicePixelRatio: 1,
          phase: 'structure',
          tool: 'select',
        },
        analysis: {
          hasRedMarkup: true,
          redMarkupBounds: { x: 0.38, y: 0.16, width: 0.24, height: 0.18 },
          imageWidth: 1365,
          imageHeight: 768,
          redPixelCount: 880,
          viewportMatchScore: 0.98,
          workspaceUiScore: 0.74,
          annotationKinds: ['circle', 'region'],
        },
      },
    },
    {},
  )

  assert.equal(result.turn.imageInterpretation?.kind, 'workspace')
  assert.equal(result.turn.actions[0]?.type, 'delete_target')
  assert.match(result.turn.targetingExplanation ?? '', /annotated screenshot/i)
})

for (const fixture of assistantAcceptanceFixtures) {
  test(`assistant acceptance fixture: ${fixture.id}`, async () => {
    const result = await createAssistantTurnResult(
      {
        prompt: fixture.prompt,
        context: fixture.context,
        imageDataUrl: fixture.imageDataUrl,
      },
      {
        ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
      },
      {
        requestOpenRouterTurn:
          fixture.owner === 'assistant-planner-remote'
            ? async () =>
              JSON.stringify({
                reply: fixture.prompt,
                mode: 'plan',
                assumptions: ['Using the attached image as a rough floor-plan reference.'],
                ambiguities: [],
                actions: fixture.expectedTurn.actions,
                requiresReview: true,
                destructiveActionCount: 0,
              })
            : async () => {
              throw new Error(`remote planner should not be called for acceptance fixture ${fixture.id}`)
            },
      },
    )

    assert.equal(result.turn.mode, fixture.expectedTurn.mode)
    assert.match(result.turn.reply, fixture.expectedTurn.replyPattern)
    if (fixture.expectedTurn.hasContinuation) {
      assert.ok(result.turn.actions.length > 0)
      assert.ok(result.turn.continuation)
    } else {
      assert.deepEqual(stripRefIds(result.turn.actions), stripRefIds(fixture.expectedTurn.actions))
      assert.equal(result.turn.continuation ?? null, null)
    }
    assert.equal(result.turn.requiresReview, fixture.expectedTurn.requiresReview)
    assert.equal(result.turn.destructiveActionCount, fixture.expectedTurn.destructiveActionCount)
  })
}

test('buildable image prompts do not collapse into chat-only responses', async () => {
  const result = await createAssistantTurnResult(
    {
      prompt: 'recreate this floor plan approximately',
      imageDataUrl: 'data:image/png;base64,ZmFrZQ==',
      context: {
        selection: {
          levelId: 'level_0',
        },
      },
    },
    {
      ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
    },
    {
      requestOpenRouterTurn: async () =>
        JSON.stringify({
          reply: 'I can recreate that floor plan approximately.',
          mode: 'plan',
          assumptions: ['Using the attached image as a rough floor-plan reference.'],
          ambiguities: [],
          actions: [{ type: 'create_zone', levelId: 'level_0', name: 'Approx Room', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
          requiresReview: true,
          destructiveActionCount: 0,
        }),
    },
  )

  assert.equal(result.turn.mode, 'plan')
  assert.equal(result.turn.actions[0]?.type, 'create_zone')
})

test('CAD-owned acceptance fixtures resolve through deterministic fallback briefs', async () => {
  for (const fixture of assistantAcceptanceFixtures.filter((item) => item.owner === 'cad-brief')) {
    const result = await createCadBriefResult(
      {
        prompt: fixture.prompt,
        context: {
          nodes: [],
          levelId:
            fixture.context &&
              typeof fixture.context === 'object' &&
              fixture.context.selection &&
              typeof fixture.context.selection === 'object' &&
              fixture.context.selection !== null &&
              'levelId' in fixture.context.selection &&
              typeof fixture.context.selection.levelId === 'string'
              ? fixture.context.selection.levelId
              : null,
        },
      },
      {
        ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key',
      },
      {
        requestOpenRouterBrief: async () => {
          throw new Error(`remote CAD planner should not be called for acceptance fixture ${fixture.id}`)
        },
      },
    )

    assert.equal(result.provider, 'fallback')
    const brief = JSON.parse(result.raw)
    assert.equal(Array.isArray(brief.ambiguities), true)
    assert.equal(brief.ambiguities.length, 0)
    assert.equal(Array.isArray(brief.operationGraph), true)
    assert.ok(brief.operationGraph.length > 0)
  }
})

for (const fixture of assistantSurfaceSourceFixtures) {
  test(`assistant surface file stays on shared assistant adapters: ${fixture.id}`, () => {
    const source = readFileSync(path.join(process.cwd(), fixture.path), 'utf8')

    for (const pattern of fixture.requiredPatterns) {
      assert.match(source, pattern)
    }

    for (const pattern of fixture.forbiddenMutationPatterns) {
      assert.doesNotMatch(source, pattern)
    }
  })
}

test('assistantAgenticOperatorFixtures corpus provides 30+ fixtures across all required categories and languages', () => {
  assert.ok(
    assistantAgenticOperatorFixtures.length >= 30,
    `expected >= 30 fixtures, got ${assistantAgenticOperatorFixtures.length}`,
  )

  const ids = new Set<string>()
  const categories = new Set<string>()
  const languages = new Set<string>()

  for (const fixture of assistantAgenticOperatorFixtures) {
    assert.ok(!ids.has(fixture.id), `duplicate fixture ID: ${fixture.id}`)
    ids.add(fixture.id)
    assert.ok(fixture.prompt.trim().length > 0, `empty prompt for fixture ${fixture.id}`)
    assert.ok(fixture.category, `missing category for fixture ${fixture.id}`)
    assert.ok(fixture.baselineFailureClass, `missing baseline failure class for ${fixture.id}`)
    categories.add(fixture.category)
    languages.add(fixture.language)
  }

  const requiredCategories = [
    'general-object',
    'compound-assembly',
    'appearance',
    'inspection',
    'observation-build',
    'asset-import',
    'camera-focus',
    'unsupported',
  ]

  for (const cat of requiredCategories) {
    assert.ok(categories.has(cat), `missing required category: ${cat}`)
  }

  assert.ok(languages.has('en'), 'missing English fixtures')
  assert.ok(languages.has('es'), 'missing Spanish fixtures')
})

const runOpenRouterRawTurn = (raw: string) =>
  createAssistantTurnResult(
    { prompt: '3+3', context: {} },
    { ...NO_CODEX_AUTH, OPENROUTER_API_KEY: 'openrouter-key' },
    { requestOpenRouterTurn: async () => raw },
  )

test('createAssistantTurnResult recovers the answer when the model uses a non-reply key', async () => {
  const result = await runOpenRouterRawTurn(JSON.stringify({ answer: '6' }))

  assert.equal(result.turn.mode, 'chat')
  assert.equal(result.turn.reply, '6')
  assert.deepEqual(result.turn.actions, [])
})

test('createAssistantTurnResult handles a bare JSON primitive from the model', async () => {
  const result = await runOpenRouterRawTurn('6')

  assert.equal(result.turn.mode, 'chat')
  assert.equal(result.turn.reply, '6')
})

test('createAssistantTurnResult keeps a well-formed chat reply unchanged', async () => {
  const result = await runOpenRouterRawTurn(
    JSON.stringify({ reply: '3 + 3 = 6.', mode: 'chat', assumptions: [], ambiguities: [], actions: [] }),
  )

  assert.equal(result.turn.mode, 'chat')
  assert.equal(result.turn.reply, '3 + 3 = 6.')
})
