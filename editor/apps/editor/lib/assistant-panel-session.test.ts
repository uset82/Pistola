import assert from 'node:assert/strict'
import test from 'node:test'

import { assistantSessionResetFixtures } from './assistant-acceptance-fixtures'
import {
  buildAssistantPanelSessionReset,
  createEmptyAssistantSessionMemory,
  rememberCompletedTaskPlan,
  rememberReferencedAssistantNodes,
  rememberFailedPrompt,
  rememberSuccessfulAssistantPrompt,
  restoreAssistantSessionMemory,
} from './assistant-panel-session'

test('buildAssistantPanelSessionReset clears assistant-only state and preserves chat mode when requested', () => {
  const reset = buildAssistantPanelSessionReset({
    currentChatMode: 'refine',
    preserveChatMode: true,
    nextSessionId: 'assistant-session-next',
  })

  assert.equal(reset.status, 'idle')
  assert.deepEqual(reset.messages, [])
  assert.equal(reset.turn, null)
  assert.equal(reset.panelError, null)
  assert.deepEqual(reset.executionEvents, [])
  assert.equal(reset.executionResult, null)
  assert.equal(reset.lastPrompt, null)
  assert.equal(reset.lastPromptImageDataUrl, null)
  assert.equal(reset.attachedImage, null)
  assert.equal(reset.lastUndoSnapshot, null)
  assert.equal(reset.input, '')
  assert.equal(reset.assistantSessionId, 'assistant-session-next')
  assert.equal(reset.chatMode, 'refine')
  assert.equal(reset.isAutoContinuing, false)
  assert.deepEqual(reset.assistantSessionMemory, createEmptyAssistantSessionMemory())
})

test('buildAssistantPanelSessionReset defaults chat mode back to create for a fresh chat', () => {
  const reset = buildAssistantPanelSessionReset({
    currentChatMode: 'ask',
    nextSessionId: 'assistant-session-next',
  })

  assert.equal(reset.chatMode, 'create')
})

for (const fixture of assistantSessionResetFixtures) {
  test(`assistant session reset fixture: ${fixture.id}`, () => {
    const reset = buildAssistantPanelSessionReset({
      currentChatMode: fixture.currentChatMode,
      preserveChatMode: fixture.preserveChatMode,
      nextSessionId: `assistant-session-${fixture.id}`,
    })

    assert.equal(typeof fixture.baselineFailureSource, 'string')
    assert.equal(reset.chatMode, fixture.expectedChatMode)
    assert.deepEqual(reset.assistantSessionMemory, createEmptyAssistantSessionMemory())
  })
}

test('rememberSuccessfulAssistantPrompt keeps unique recent prompts in recency order', () => {
  const memory = rememberSuccessfulAssistantPrompt(
    rememberSuccessfulAssistantPrompt(
      rememberSuccessfulAssistantPrompt(createEmptyAssistantSessionMemory(), 'make a room'),
      'furnish the living room',
    ),
    'make a room',
  )

  assert.deepEqual(memory.recentSuccessfulPrompts, ['make a room', 'furnish the living room'])
})

test('rememberReferencedAssistantNodes keeps unique recent nodes in recency order', () => {
  const memory = rememberReferencedAssistantNodes(
    rememberReferencedAssistantNodes(createEmptyAssistantSessionMemory(), [
      { id: 'zone_living', type: 'zone', name: 'Living Room' },
      { id: 'item_sofa', type: 'item', name: 'Sofa' },
    ]),
    [
      { id: 'item_sofa', type: 'item', name: 'Sofa' },
      { id: 'wall_main', type: 'wall', name: 'Main Wall' },
    ],
  )

  assert.deepEqual(memory.recentReferencedNodes, [
    { id: 'item_sofa', type: 'item', name: 'Sofa' },
    { id: 'wall_main', type: 'wall', name: 'Main Wall' },
    { id: 'zone_living', type: 'zone', name: 'Living Room' },
  ])
})

test('rememberCompletedTaskPlan keeps recent plans and derived summaries in recency order', () => {
  const kitchenPlan = {
    id: 'plan-kitchen',
    title: 'Build kitchen shell',
    prompt: 'build a kitchen',
    createdAt: 1,
    steps: [
      { id: 'step-0', description: 'Create shell', actions: [], status: 'done' as const, agent: 'structure' as const },
      { id: 'step-1', description: 'Add openings', actions: [], status: 'done' as const, agent: 'layout' as const },
    ],
  }
  const cafePlan = {
    id: 'plan-cafe',
    title: 'Build cafe shell',
    prompt: 'build a cafe',
    createdAt: 2,
    steps: [{ id: 'step-0', description: 'Create cafe', actions: [], status: 'done' as const, agent: 'structure' as const }],
  }

  const memory = rememberCompletedTaskPlan(
    rememberCompletedTaskPlan(createEmptyAssistantSessionMemory(), kitchenPlan),
    cafePlan,
  )

  assert.deepEqual(
    memory.taskPlans.map((plan) => ({ title: plan.title, stepCount: plan.steps.length, prompt: plan.prompt })),
    [
      { title: 'Build cafe shell', stepCount: 1, prompt: 'build a cafe' },
      { title: 'Build kitchen shell', stepCount: 2, prompt: 'build a kitchen' },
    ],
  )
  assert.deepEqual(
    memory.taskPlanSummaries.map((plan) => ({ title: plan.title, stepCount: plan.stepCount })),
    [
      { title: 'Build cafe shell', stepCount: 1 },
      { title: 'Build kitchen shell', stepCount: 2 },
    ],
  )
})

test('rememberFailedPrompt keeps unique failed prompts in recency order', () => {
  const memory = rememberFailedPrompt(
    rememberFailedPrompt(createEmptyAssistantSessionMemory(), 'clean everything'),
    'clean everything',
  )

  assert.deepEqual(memory.failedPrompts, ['clean everything'])
})

test('restoreAssistantSessionMemory restores persisted conversation and assistant context', () => {
  const restored = restoreAssistantSessionMemory({
    lastCreatedNodes: [{ id: 'cad_body_1', type: 'cad-body', name: 'Box Body' }],
    recentReferencedNodes: [{ id: 'cad_body_1', type: 'cad-body', name: 'Box Body' }],
    lastError: null,
    codexThreadId: 'codex-thread-1',
    recentSuccessfulPrompts: ['build a box 1m x 1m x 1m'],
    failedPrompts: ['clean everything'],
    preferredComplexity: 'detailed',
    conversationHistory: [
      { role: 'user', text: 'build a box 1m x 1m x 1m' },
      { role: 'assistant', text: 'I can run a CAD build for that request.' },
    ],
  })

  assert.deepEqual(restored.lastCreatedNodes, [
    { id: 'cad_body_1', type: 'cad-body', name: 'Box Body' },
  ])
  assert.deepEqual(restored.recentSuccessfulPrompts, ['build a box 1m x 1m x 1m'])
  assert.equal(restored.preferredComplexity, 'detailed')
  assert.equal(restored.codexThreadId, 'codex-thread-1')
  assert.deepEqual(restored.conversationHistory, [
    { role: 'user', text: 'build a box 1m x 1m x 1m' },
    { role: 'assistant', text: 'I can run a CAD build for that request.' },
  ])
})

test('createEmptyAssistantSessionMemory starts without a Codex thread id', () => {
  assert.equal(createEmptyAssistantSessionMemory().codexThreadId, null)
})

test('buildAssistantPanelSessionReset clears any stored Codex thread id on new chat', () => {
  const reset = buildAssistantPanelSessionReset({
    currentChatMode: 'create',
    preserveChatMode: true,
    nextSessionId: 'assistant-session-fresh',
  })

  assert.equal(reset.assistantSessionMemory.codexThreadId, null)
})
