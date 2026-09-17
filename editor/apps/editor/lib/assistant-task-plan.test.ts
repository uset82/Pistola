import assert from 'node:assert/strict'
import test from 'node:test'

import type { AssistantTurnResult } from '../../../packages/editor/src/lib/assistant/types'
import type { AssistantExecutionResult } from '@pascal-app/editor'
import {
  executeTaskPlan,
  getTaskPlanProgress,
  parseTaskPlanFromTurn,
} from './assistant-task-plan'

const buildExecutionResult = (ok = true): AssistantExecutionResult => ({
  ok,
  errors: ok ? [] : ['Step failed.'],
  failureKind: ok ? null : 'plan-validation',
  failedActionIndex: ok ? null : 0,
  resolvedForwardRefs: {},
  completedActionCount: ok ? 1 : 0,
  requiresReview: false,
  destructiveActionCount: 0,
  snapshotRestored: false,
  createdNodeIds: [],
  bodyIds: [],
  sketchIds: [],
  warnings: [],
})

test('parseTaskPlanFromTurn converts a task-plan turn into a local task plan', () => {
  const turn: AssistantTurnResult = {
    reply: 'Build the room first, then furnish it.',
    mode: 'task-plan',
    assumptions: [],
    ambiguities: [],
    actions: [],
    steps: [
      {
        description: 'Create the room shell.',
        agent: 'structure',
        actions: [{ type: 'create_zone', levelId: 'level_0', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
      },
      {
        description: 'Place the sofa.',
        agent: 'furnish',
        actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
      },
    ],
    requiresReview: true,
    destructiveActionCount: 0,
  }

  const plan = parseTaskPlanFromTurn(turn, 'make a furnished room')

  assert.ok(plan)
  assert.equal(plan?.title, 'Build the room first, then furnish it.')
  assert.equal(plan?.steps.length, 2)
  assert.equal(plan?.steps[0]?.status, 'pending')
  assert.equal(plan?.steps[1]?.agent, 'furnish')
})

test('parseTaskPlanFromTurn falls back to wrapping actions when steps are missing', () => {
  const turn: AssistantTurnResult = {
    reply: 'Execute the fallback plan.',
    mode: 'task-plan',
    assumptions: [],
    ambiguities: [],
    actions: [{ type: 'set_phase', phase: 'structure' }],
    requiresReview: true,
    destructiveActionCount: 0,
  }

  const plan = parseTaskPlanFromTurn(turn, 'fallback')

  assert.ok(plan)
  assert.equal(plan?.steps.length, 1)
  assert.equal(plan?.steps[0]?.actions[0]?.type, 'set_phase')
})

test('executeTaskPlan runs each step in order and marks them done on success', async () => {
  const plan = parseTaskPlanFromTurn(
    {
      reply: 'Build the room and then furnish it.',
      mode: 'task-plan',
      assumptions: [],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Create the room shell.',
          agent: 'structure',
          actions: [{ type: 'create_zone', levelId: 'level_0', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
        },
        {
          description: 'Place the sofa.',
          agent: 'furnish',
          actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
    'make a furnished room',
  )

  assert.ok(plan)

  const started: string[] = []
  const completed = await executeTaskPlan(plan!, {
    executePlan: async (_actions: unknown) => {
      started.push(started.length === 0 ? 'create_zone' : 'place_item')
      return buildExecutionResult(true)
    },
  })

  assert.deepEqual(started, ['create_zone', 'place_item'])
  assert.deepEqual(
    completed.steps.map((step) => step.status),
    ['done', 'done'],
  )
})

test('executeTaskPlan stops on a failing step and reports the error', async () => {
  const plan = parseTaskPlanFromTurn(
    {
      reply: 'Build the room and then furnish it.',
      mode: 'task-plan',
      assumptions: [],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Create the room shell.',
          agent: 'structure',
          actions: [{ type: 'create_zone', levelId: 'level_0', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
        },
        {
          description: 'Place the sofa.',
          agent: 'furnish',
          actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
    'make a furnished room',
  )

  assert.ok(plan)

  let callCount = 0
  const completed = await executeTaskPlan(plan!, {
    executePlan: async () => {
      callCount += 1
      return buildExecutionResult(callCount === 1)
    },
  })

  assert.equal(callCount, 2)
  assert.equal(completed.steps[0]?.status, 'done')
  assert.equal(completed.steps[1]?.status, 'error')
  assert.match(completed.steps[1]?.error ?? '', /step failed/i)
})

test('executeTaskPlan leaves remaining steps pending when execution fails mid-plan', async () => {
  const plan = parseTaskPlanFromTurn(
    {
      reply: 'Build, furnish, and refine the room.',
      mode: 'task-plan',
      assumptions: [],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Create the room shell.',
          agent: 'structure',
          actions: [{ type: 'create_zone', levelId: 'level_0', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
        },
        {
          description: 'Place the sofa.',
          agent: 'furnish',
          actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
        },
        {
          description: 'Refine the windows.',
          agent: 'layout',
          actions: [{ type: 'set_grid_visibility', enabled: false }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
    'make a furnished room',
  )

  assert.ok(plan)

  let callCount = 0
  const completed = await executeTaskPlan(plan!, {
    executePlan: async () => {
      callCount += 1
      return callCount === 2
        ? {
            ...buildExecutionResult(false),
            errors: ['Network disconnected during execution.'],
          }
        : buildExecutionResult(true)
    },
  })

  assert.equal(completed.steps[0]?.status, 'done')
  assert.equal(completed.steps[1]?.status, 'error')
  assert.equal(completed.steps[2]?.status, 'pending')
  assert.match(completed.steps[1]?.error ?? '', /network disconnected/i)
})

test('executeTaskPlan yields between fast steps so stop-after-current can interrupt', async () => {
  const plan = parseTaskPlanFromTurn(
    {
      reply: 'Build, furnish, and refine the room.',
      mode: 'task-plan',
      assumptions: [],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Create the room shell.',
          agent: 'structure',
          actions: [{ type: 'set_grid_visibility', enabled: true }],
        },
        {
          description: 'Place the sofa.',
          agent: 'furnish',
          actions: [{ type: 'set_guides_visibility', enabled: true }],
        },
        {
          description: 'Refine the windows.',
          agent: 'layout',
          actions: [{ type: 'set_grid_visibility', enabled: false }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
    'make a furnished room',
  )

  assert.ok(plan)

  let stopRequested = false
  const completed = await executeTaskPlan(plan!, {
    executePlan: async () => buildExecutionResult(true),
    onStepComplete: (stepIndex) => {
      if (stepIndex === 0) {
        setTimeout(() => {
          stopRequested = true
        }, 0)
      }
    },
    shouldStop: () => stopRequested,
  })

  assert.deepEqual(
    completed.steps.map((step) => step.status),
    ['done', 'pending', 'pending'],
  )
})

test('getTaskPlanProgress returns completed totals and the active step index', () => {
  const progress = getTaskPlanProgress({
    id: 'plan_1',
    title: 'Build the room',
    prompt: 'build the room',
    createdAt: Date.now(),
    steps: [
      {
        id: 'step-0',
        description: 'Create room',
        agent: 'structure',
        actions: [],
        status: 'done',
      },
      {
        id: 'step-1',
        description: 'Place sofa',
        agent: 'furnish',
        actions: [],
        status: 'running',
      },
      {
        id: 'step-2',
        description: 'Add lamp',
        agent: 'furnish',
        actions: [],
        status: 'pending',
      },
    ],
  })

  assert.deepEqual(progress, {
    completed: 1,
    total: 3,
    activeStep: 1,
    hasError: false,
  })
})
