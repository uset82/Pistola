import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  createOperatorPlan,
  getOperatorPhaseStatus,
  getOperatorPlanProgress,
  recoverInterruptedOperatorPlan,
  updateOperatorPlanStep,
} from './operator-plan'

const makePlan = () =>
  createOperatorPlan(
    {
      id: 'plan-1',
      title: 'Build a test object',
      source: 'codex',
      phases: [
        {
          id: 'model',
          title: 'Model',
          steps: [
            { id: 'inspect', title: 'Inspect the scene', kind: 'observation' },
            { id: 'build', title: 'Build the object', kind: 'execution' },
          ],
        },
        {
          id: 'verify',
          title: 'Verify',
          steps: [{ id: 'visual', title: 'Check the render', kind: 'validation' }],
        },
      ],
    },
    100,
  )

describe('operator plan lifecycle', () => {
  test('derives pending, running, and done progress from child steps', () => {
    let plan = makePlan()
    assert.deepEqual(getOperatorPlanProgress(plan), { completed: 0, total: 3, percent: 0, status: 'pending' })

    plan = updateOperatorPlanStep(
      plan,
      { planId: plan.id, phaseId: 'model', stepId: 'inspect', status: 'running' },
      110,
    )
    assert.equal(getOperatorPhaseStatus(plan.phases[0]!), 'running')

    plan = updateOperatorPlanStep(
      plan,
      {
        planId: plan.id,
        phaseId: 'model',
        stepId: 'inspect',
        status: 'done',
        evidence: { kind: 'observation', summary: 'Scene contains one empty level.' },
      },
      120,
    )
    assert.deepEqual(getOperatorPlanProgress(plan), { completed: 1, total: 3, percent: 33, status: 'running' })

    for (const [phaseId, stepId] of [
      ['model', 'build'],
      ['verify', 'visual'],
    ] as const) {
      plan = updateOperatorPlanStep(
        plan,
        {
          planId: plan.id,
          phaseId,
          stepId,
          status: 'done',
          evidence: { kind: 'validation', summary: `${stepId} verified.` },
        },
        130,
      )
    }
    assert.deepEqual(getOperatorPlanProgress(plan), { completed: 3, total: 3, percent: 100, status: 'done' })
  })

  test('rejects unsupported optimistic completion and empty errors', () => {
    const plan = makePlan()
    assert.throws(() =>
      updateOperatorPlanStep(plan, {
        planId: plan.id,
        phaseId: 'model',
        stepId: 'build',
        status: 'done',
      }),
    )
    assert.throws(
      () =>
        updateOperatorPlanStep(plan, {
          planId: plan.id,
          phaseId: 'model',
          stepId: 'build',
          status: 'error',
        }),
      /requires a non-empty error message/,
    )
  })

  test('turns a stale running step into an interrupted step after reload', () => {
    const running = updateOperatorPlanStep(
      makePlan(),
      { planId: 'plan-1', phaseId: 'model', stepId: 'build', status: 'running' },
      110,
    )
    const recovered = recoverInterruptedOperatorPlan(running, 200)
    assert.equal(recovered?.status, 'interrupted')
    assert.equal(recovered?.phases[0]?.steps[1]?.status, 'interrupted')
    assert.equal(recovered?.phases[0]?.steps[1]?.error, 'Execution was interrupted by a page reload.')
    assert.equal(recovered?.undoAvailable, false)
  })

  test('drops a stale in-memory undo claim after reload', () => {
    const plan = { ...makePlan(), undoAvailable: true }
    const recovered = recoverInterruptedOperatorPlan(plan, 200)
    assert.equal(recovered?.undoAvailable, false)
    assert.equal(recovered?.status, 'pending')
  })

  test('rejects duplicate step ids across phases', () => {
    assert.throws(() =>
      createOperatorPlan({
        title: 'Invalid plan',
        phases: [
          { id: 'a', title: 'A', steps: [{ id: 'same', title: 'First' }] },
          { id: 'b', title: 'B', steps: [{ id: 'same', title: 'Second' }] },
        ],
      }),
    )
  })
})
