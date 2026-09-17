import assert from 'node:assert/strict'
import test from 'node:test'

import type { AssistantTurnResult } from '../../../packages/editor/src/lib/assistant/types'
import { shouldRequestAssistantContinuation } from './assistant-continuation'

const buildTurn = (continuation: AssistantTurnResult['continuation']): AssistantTurnResult => ({
  reply: 'Continuing the build.',
  mode: 'plan',
  assumptions: [],
  ambiguities: [],
  actions: [{ type: 'set_mode', mode: 'select' }],
  requiresReview: false,
  destructiveActionCount: 0,
  continuation,
})

test('shouldRequestAssistantContinuation returns true for an active matching continuation run', () => {
  const turn = buildTurn({
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

  assert.equal(
    shouldRequestAssistantContinuation({
      turn,
      stopRequested: false,
      runId: 3,
      activeRunId: 3,
    }),
    true,
  )
})

test('shouldRequestAssistantContinuation stops when the user interrupts or the run id changes', () => {
  const turn = buildTurn({
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

  assert.equal(
    shouldRequestAssistantContinuation({
      turn,
      stopRequested: true,
      runId: 3,
      activeRunId: 3,
    }),
    false,
  )
  assert.equal(
    shouldRequestAssistantContinuation({
      turn,
      stopRequested: false,
      runId: 3,
      activeRunId: 4,
    }),
    false,
  )
  assert.equal(
    shouldRequestAssistantContinuation({
      turn: buildTurn(null),
      stopRequested: false,
      runId: 3,
      activeRunId: 3,
    }),
    false,
  )
})
