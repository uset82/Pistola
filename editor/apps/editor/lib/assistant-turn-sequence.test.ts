import assert from 'node:assert/strict'
import test from 'node:test'

import type { AssistantTurnResult } from '../../../packages/editor/src/lib/assistant/types'
import { runAssistantTurnSequence } from './assistant-turn-sequence'

const buildTurn = (
  overrides: Partial<AssistantTurnResult> = {},
  continuation: AssistantTurnResult['continuation'] = null,
): AssistantTurnResult => ({
  reply: 'Continuing the build.',
  mode: 'plan',
  assumptions: [],
  ambiguities: [],
  actions: [{ type: 'set_mode', mode: 'select' }],
  requiresReview: false,
  destructiveActionCount: 0,
  continuation,
  ...overrides,
})

test('runAssistantTurnSequence resumes a chunked plan until the final step completes', async () => {
  const firstTurn = buildTurn({}, {
    kind: 'local-sequence',
    intentId: 'house_shell_recipe',
    originPrompt: 'make a furnished small two-bedroom house with kitchen and living room',
    summary: 'Creating the requested house shell.',
    stepIndex: 1,
    totalSteps: 2,
    remainingActions: [{ type: 'set_phase', phase: 'furnish' }],
    resolvedRefs: {},
    autoContinue: true,
  })
  const finalTurn = buildTurn({ reply: 'Final step.' }, null)
  const seenTurns: string[] = []

  const outcome = await runAssistantTurnSequence<string>({
    initialTurn: firstTurn,
    prompt: 'make a furnished small two-bedroom house with kitchen and living room',
    reviewConfirmed: true,
    executeTurnChunk: async (turn, _reviewConfirmed, undoSnapshot) => ({
      result: { ok: true },
      undoSnapshot: undoSnapshot ?? 'snapshot-1',
    }),
    requestAssistantTurn: async () => finalTurn,
    requiresManualReview: () => false,
    shouldContinue: (turn) => Boolean(turn.continuation),
    wasInterrupted: () => false,
    onFetchedTurn: (turn) => {
      seenTurns.push(turn.reply)
    },
  })

  assert.equal(outcome.status, 'executed')
  assert.equal(outcome.undoSnapshot, 'snapshot-1')
  assert.equal(outcome.interrupted, false)
  assert.equal(outcome.finalTurn.reply, 'Final step.')
  assert.deepEqual(seenTurns, ['Final step.'])
})

test('runAssistantTurnSequence forwards structured image attachments during continuation fetches', async () => {
  const firstTurn = buildTurn({}, {
    kind: 'local-sequence',
    intentId: 'workspace_cleanup',
    originPrompt: 'clean this area',
    summary: 'Cleaning the highlighted area.',
    stepIndex: 1,
    totalSteps: 2,
    remainingActions: [{ type: 'delete_nodes', nodeIds: ['wall_a', 'wall_b'] }],
    resolvedRefs: {},
    autoContinue: true,
  })
  let seenImageKind: string | null = null

  await runAssistantTurnSequence<string>({
    initialTurn: firstTurn,
    prompt: 'clean this area',
    image: {
      dataUrl: 'data:image/png;base64,workspace',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        annotationKinds: [],
      },
    },
    reviewConfirmed: true,
    executeTurnChunk: async (_turn, _reviewConfirmed, undoSnapshot) => ({
      result: { ok: true },
      undoSnapshot: undoSnapshot ?? 'snapshot-1',
    }),
    requestAssistantTurn: async ({ image }) => {
      seenImageKind = image?.kind ?? null
      return buildTurn({ reply: 'Final cleanup step.' }, null)
    },
    requiresManualReview: () => false,
    shouldContinue: (turn) => Boolean(turn.continuation),
    wasInterrupted: () => false,
  })

  assert.equal(seenImageKind, 'workspace')
})

test('runAssistantTurnSequence stops before fetching the next turn when interrupted', async () => {
  const firstTurn = buildTurn({}, {
    kind: 'local-sequence',
    intentId: 'house_shell_recipe',
    originPrompt: 'make a furnished small two-bedroom house with kitchen and living room',
    summary: 'Creating the requested house shell.',
    stepIndex: 1,
    totalSteps: 2,
    remainingActions: [{ type: 'set_phase', phase: 'furnish' }],
    resolvedRefs: {},
    autoContinue: true,
  })
  let interrupted = false
  let fetchCount = 0

  const outcome = await runAssistantTurnSequence<string>({
    initialTurn: firstTurn,
    prompt: 'make a furnished small two-bedroom house with kitchen and living room',
    reviewConfirmed: true,
    executeTurnChunk: async (_turn, _reviewConfirmed, undoSnapshot) => {
      interrupted = true
      return {
        result: { ok: true },
        undoSnapshot: undoSnapshot ?? 'snapshot-1',
      }
    },
    requestAssistantTurn: async () => {
      fetchCount += 1
      return buildTurn({ reply: 'Should not be fetched.' }, null)
    },
    requiresManualReview: () => false,
    shouldContinue: () => !interrupted,
    wasInterrupted: () => interrupted,
  })

  assert.equal(outcome.status, 'executed')
  assert.equal(outcome.interrupted, true)
  assert.equal(fetchCount, 0)
  assert.equal(outcome.undoSnapshot, 'snapshot-1')
})

test('runAssistantTurnSequence retains the undo snapshot when a later chunk fails', async () => {
  const firstTurn = buildTurn({}, {
    kind: 'local-sequence',
    intentId: 'house_shell_recipe',
    originPrompt: 'make a furnished small two-bedroom house with kitchen and living room',
    summary: 'Creating the requested house shell.',
    stepIndex: 1,
    totalSteps: 2,
    remainingActions: [{ type: 'set_phase', phase: 'furnish' }],
    resolvedRefs: {},
    autoContinue: true,
  })
  const secondTurn = buildTurn({ reply: 'Second step.' }, null)
  let executeCount = 0

  const outcome = await runAssistantTurnSequence<string>({
    initialTurn: firstTurn,
    prompt: 'make a furnished small two-bedroom house with kitchen and living room',
    reviewConfirmed: true,
    executeTurnChunk: async (_turn, _reviewConfirmed, undoSnapshot) => {
      executeCount += 1
      return executeCount === 1
        ? {
            result: { ok: true },
            undoSnapshot: undoSnapshot ?? 'snapshot-1',
          }
        : {
            result: { ok: false },
            undoSnapshot: undoSnapshot ?? 'snapshot-1',
          }
    },
    requestAssistantTurn: async () => secondTurn,
    requiresManualReview: () => false,
    shouldContinue: (turn) => Boolean(turn.continuation),
    wasInterrupted: () => false,
  })

  assert.equal(outcome.status, 'error')
  assert.equal(outcome.undoSnapshot, 'snapshot-1')
  assert.equal(outcome.finalTurn.reply, 'Second step.')
})

test('runAssistantTurnSequence returns task-plan when a continuation fetch switches modes', async () => {
  const firstTurn = buildTurn({}, {
    kind: 'local-sequence',
    intentId: 'broad_build',
    originPrompt: 'make a furnished house',
    summary: 'Starting the build.',
    stepIndex: 1,
    totalSteps: 2,
    remainingActions: [{ type: 'set_phase', phase: 'furnish' }],
    resolvedRefs: {},
    autoContinue: true,
  })

  const outcome = await runAssistantTurnSequence<string>({
    initialTurn: firstTurn,
    prompt: 'make a furnished house',
    reviewConfirmed: true,
    executeTurnChunk: async (_turn, _reviewConfirmed, undoSnapshot) => ({
      result: { ok: true },
      undoSnapshot: undoSnapshot ?? 'snapshot-1',
    }),
    requestAssistantTurn: async () => ({
      reply: 'I split the rest into explicit steps.',
      mode: 'task-plan',
      assumptions: [],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Furnish the living room.',
          agent: 'furnish',
          actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    }),
    requiresManualReview: () => false,
    shouldContinue: (turn) => Boolean(turn.continuation),
    wasInterrupted: () => false,
  })

  assert.equal(outcome.status, 'task-plan')
  assert.equal(outcome.undoSnapshot, 'snapshot-1')
  assert.equal(outcome.finalTurn.mode, 'task-plan')
})
