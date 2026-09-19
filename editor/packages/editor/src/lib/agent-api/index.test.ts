import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { createPistolaAgentApi } from './index'
import { useOperatorPlanStore } from '../operator-plan'

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useOperatorPlanStore.getState().setPlan(null)
}

afterEach(reset)

test('taskPlan executes typed actions directly without an AI provider and undoes the whole plan', async () => {
  reset()
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('Direct operator execution must not call fetch.')
  }) as typeof fetch

  try {
    const api = createPistolaAgentApi()
    const manual = await api.manual()
    assert.equal(manual.operatorPlan.version, 1)
    assert.equal(manual.operatorPlan.owner, 'ide')
    const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
    assert.ok(levelId)
    const beforeCount = Object.keys(useScene.getState().nodes).length
    const plan = await api.taskPlan.create({
      id: 'direct-plan',
      title: 'Build directly',
      phases: [
        {
          id: 'build',
          title: 'Build',
          steps: [
            { id: 'box', title: 'Place the box', kind: 'execution' },
            { id: 'sphere', title: 'Place the sphere', kind: 'execution' },
          ],
        },
      ],
    })

    const firstOutcome = await api.taskPlan.runStep({
      planId: plan.id,
      phaseId: 'build',
      stepId: 'box',
      actions: [
        {
          type: 'place_item',
          assetId: 'primitive-box',
          name: 'Codex direct box',
          levelId,
          placement: 'explicit',
          position: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    })

    assert.equal(firstOutcome.ok, true)
    assert.equal(firstOutcome.plan.status, 'running')
    const outcome = await api.taskPlan.runStep({
      planId: plan.id,
      phaseId: 'build',
      stepId: 'sphere',
      actions: [
        {
          type: 'place_item',
          assetId: 'primitive-sphere',
          name: 'Codex direct sphere',
          levelId,
          placement: 'explicit',
          position: [2, 0, 0],
          scale: [0.5, 0.5, 0.5],
        },
      ],
    })

    assert.equal(outcome.ok, true)
    assert.equal(outcome.plan.status, 'done')
    assert.equal(outcome.plan.undoAvailable, true)
    assert.equal(outcome.plan.phases[0]?.steps[0]?.evidence?.kind, 'execution')
    assert.ok(Object.keys(useScene.getState().nodes).length > beforeCount)
    assert.equal(fetchCalls, 0)

    const undo = await api.taskPlan.undo(plan.id)
    assert.equal(undo.undone, true)
    assert.equal(Object.keys(useScene.getState().nodes).length, beforeCount)
    assert.equal(await api.taskPlan.get(), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('taskPlan rejects an over-limit batch without mutating the scene', async () => {
  reset()
  const api = createPistolaAgentApi()
  const before = structuredClone(useScene.getState().nodes)
  const plan = await api.taskPlan.create({
    id: 'invalid-plan',
    title: 'Reject invalid work',
    phases: [
      {
        id: 'build',
        title: 'Build',
        steps: [{ id: 'too-many', title: 'Run too many actions', kind: 'execution' }],
      },
    ],
  })
  const outcome = await api.taskPlan.runStep({
    planId: plan.id,
    phaseId: 'build',
    stepId: 'too-many',
    actions: Array.from({ length: 26 }, () => ({ type: 'set_phase', phase: 'structure' })),
  })

  assert.equal(outcome.ok, false)
  assert.equal(outcome.plan.status, 'error')
  assert.equal(outcome.plan.undoAvailable, false)
  assert.deepEqual(useScene.getState().nodes, before)

  const retry = await api.taskPlan.runStep({
    planId: plan.id,
    phaseId: 'build',
    stepId: 'too-many',
    actions: [{ type: 'set_phase', phase: 'structure' }],
  })
  assert.equal(retry.ok, true)
  assert.equal(retry.plan.status, 'done')
  assert.equal(retry.plan.phases[0]?.steps[0]?.evidence?.actionCount, 1)
})

test('invoke routes allowlisted methods and rejects unknown ones', async () => {
  reset()
  const api = createPistolaAgentApi()
  assert.equal(api.apiVersion, 1)
  const manual = await api.invoke('manual')
  assert.equal((manual as { apiVersion: number }).apiVersion, 1)
  assert.ok((manual as { solidSpec: { primitives: string[] } }).solidSpec.primitives.includes('box'))
  await assert.rejects(() => api.invoke('pistola_chat'), /Unknown pistola method/)
})

test('taskPlan.create keeps an unfinished plan unless replace is true', async () => {
  reset()
  const api = createPistolaAgentApi()
  await api.taskPlan.create({
    id: 'keep-me',
    title: 'Keep me',
    source: 'cursor',
    phases: [{ id: 'one', title: 'One', steps: [{ id: 'a', title: 'A' }] }],
  })
  await assert.rejects(
    () =>
      api.taskPlan.create({
        id: 'replace-me',
        title: 'Replace me',
        phases: [{ id: 'one', title: 'One', steps: [{ id: 'a', title: 'A' }] }],
      }),
    /replace: true/,
  )
  const replaced = await api.taskPlan.create({
    id: 'replaced',
    title: 'Replaced',
    source: 'claude-code',
    replace: true,
    phases: [{ id: 'one', title: 'One', steps: [{ id: 'a', title: 'A' }] }],
  })
  assert.equal(replaced.id, 'replaced')
  assert.equal(replaced.source, 'claude-code')
})

test('validate reports the real action index and solid-spec path', async () => {
  reset()
  const api = createPistolaAgentApi()
  const result = await api.validate([
    { type: 'set_phase', phase: 'structure' },
    { type: 'build_cad_solid', spec: { op: 'box' } },
  ])
  assert.equal(result.valid, false)
  assert.equal(result.errors[0]?.index, 1)
  assert.equal(result.errors[0]?.type, 'build_cad_solid')
  assert.match(result.errors[0]?.message ?? '', /size|spec/)
})

test('taskPlan requires explicit confirmation before destructive execution', async () => {
  reset()
  const api = createPistolaAgentApi()
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.ok(levelId)
  const created = await api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name: 'Delete target',
      levelId,
      placement: 'explicit',
      position: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ])
  const targetId = created.createdNodeIds[0]
  assert.ok(targetId)

  const plan = await api.taskPlan.create({
    id: 'destructive-plan',
    title: 'Delete directly',
    phases: [
      {
        id: 'edit',
        title: 'Edit',
        steps: [{ id: 'delete', title: 'Delete the target', kind: 'execution' }],
      },
    ],
  })
  const outcome = await api.taskPlan.runStep({
    planId: plan.id,
    phaseId: 'edit',
    stepId: 'delete',
    actions: [{ type: 'delete_nodes', nodeIds: [targetId] }],
  })

  assert.equal(outcome.ok, false)
  assert.equal(outcome.result?.requiresReview, true)
  assert.ok((useScene.getState().nodes as Record<string, unknown>)[targetId])
  assert.equal(outcome.plan.undoAvailable, false)
})
