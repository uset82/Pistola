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
    assert.ok('operatorPlan' in manual)
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

test('exportScene dumps nodes without mutating the scene', async () => {
  reset()
  const api = createPistolaAgentApi()
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.ok(levelId)
  await api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name: 'Export probe',
      levelId,
      placement: 'explicit',
      position: [1, 0, 0],
      scale: [0.5, 0.4, 0.3],
    },
  ])
  const before = structuredClone(useScene.getState().nodes)
  const exported = (await api.invoke('exportScene')) as {
    apiVersion: number
    frame: { up: string }
    nodes: Array<{ name: string | null; bounds: { size: number[] } | null }>
  }
  assert.equal(exported.apiVersion, 1)
  assert.equal(exported.frame.up, '+Y')
  const probe = exported.nodes.find((node) => node.name === 'Export probe')
  assert.ok(probe)
  assert.deepEqual(probe.bounds?.size, [0.5, 0.4, 0.3])
  assert.deepEqual(useScene.getState().nodes, before)
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
    source: 'qoder',
    replace: true,
    phases: [{ id: 'one', title: 'One', steps: [{ id: 'a', title: 'A' }] }],
  })
  assert.equal(replaced.id, 'replaced')
  assert.equal(replaced.source, 'qoder')
})

test('manual sections and runRecipe are allowlisted', async () => {
  reset()
  const api = createPistolaAgentApi()
  const frame = (await api.invoke('manual', { section: 'frame' })) as { value: { up: string } }
  assert.equal(frame.value.up, '+Y')
  const examples = await api.manual({ section: 'examples' })
  assert.ok('value' in examples)
  if (!('value' in examples)) throw new Error('Expected a manual section result.')
  const values = examples.value as Record<string, unknown>
  const box = values.box
  assert.ok(box && typeof box === 'object' && 'op' in box)
  assert.equal(box.op, 'box')
  await assert.rejects(() => api.runRecipe('missing-recipe'), /not found/)
})

test('update_cad_solid keeps the body id', async () => {
  reset()
  const api = createPistolaAgentApi()
  const created = await api.run([
    {
      type: 'build_cad_solid',
      name: 'Keep me',
      spec: { op: 'box', size: [1, 0.4, 0.6] },
      position: [0, 0, 0],
      rotation: [0, 0.2, 0],
      partId: 'hull',
      role: 'hull',
    },
  ])
  const bodyId = created.createdNodeIds[0] ?? created.bodyIds?.[0]
  assert.ok(bodyId)
  const updated = await api.run([
    {
      type: 'update_cad_solid',
      bodyId,
      spec: { op: 'box', size: [1.2, 0.4, 0.6] },
      position: [0, 0.1, 0],
    },
  ])
  assert.equal(updated.ok, true)
  assert.equal(updated.createdNodeIds[0] ?? updated.bodyIds?.[0] ?? bodyId, bodyId)
  const node = useScene.getState().nodes[bodyId as never] as {
    id: string
    preview?: { spec?: { size?: number[] } }
    transform?: { position?: number[] }
    position?: number[]
  }
  assert.equal(node?.id, bodyId)
  assert.equal(node.preview?.spec?.size?.[0], 1.2)
  const pos = node.transform?.position ?? node.position
  assert.deepEqual(pos, [0, 0.1, 0])
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

test('getNodes() lists the scene and invoke keeps an action array whole', async () => {
  reset()
  const api = createPistolaAgentApi()
  const listed = await api.getNodes()
  assert.ok(Object.keys(listed.nodes).length > 0)

  const created = (await api.invoke('run', [
    {
      type: 'build_cad_solid',
      name: 'Invoke box',
      partId: 'invoke-box',
      role: 'probe',
      spec: { op: 'box', size: [0.4, 0.2, 0.3] },
      color: '#2266aa',
      opacity: 1,
    },
  ])) as { ok: boolean; createdNodeIds: string[] }
  assert.equal(created.ok, true)
  const bodyId = created.createdNodeIds[0]
  assert.ok(bodyId)

  const one = (await api.invoke('getNodes', [bodyId])) as { nodes: Record<string, { partId?: string; spec?: { op?: string } }> }
  assert.equal(one.nodes[bodyId]?.partId, 'invoke-box')
  assert.equal(one.nodes[bodyId]?.spec?.op, 'box')

  const inspected = await api.inspect({ partId: 'invoke-box' })
  assert.equal(inspected.total, 1)
  const summary = inspected.nodes[0] as {
    role?: string
    color?: string
    opacity?: number
    triangles?: number
    bbox?: { size?: number[] }
  }
  assert.equal(summary.role, 'probe')
  assert.equal(summary.color, '#2266aa')
  assert.equal(summary.opacity, 1)
  assert.ok((summary.triangles ?? 0) > 0)
  assert.ok((summary.bbox?.size?.[0] ?? 0) > 0.3)

  const exported = await api.exportScene()
  const probe = exported.nodes.find((node) => node.id === bodyId) as {
    partId?: string
    role?: string
    spec?: { op?: string }
    triangles?: number
  }
  assert.equal(probe.partId, 'invoke-box')
  assert.equal(probe.role, 'probe')
  assert.equal(probe.spec?.op, 'box')
  assert.ok((probe.triangles ?? 0) > 0)
})

test('undoStep restores a step and re-running it replaces the part', async () => {
  reset()
  const api = createPistolaAgentApi()
  const plan = await api.taskPlan.create({
    id: 'step-undo',
    title: 'Step undo',
    phases: [{ id: 'build', title: 'Build', steps: [{ id: 'box', title: 'Box', kind: 'execution' }] }],
  })
  const before = Object.keys(useScene.getState().nodes).length
  const actions = [{ type: 'build_cad_solid', name: 'Step box', spec: { op: 'box', size: [0.2, 0.2, 0.2] } }]
  const first = await api.taskPlan.runStep({ planId: plan.id, phaseId: 'build', stepId: 'box', actions })
  assert.equal(first.ok, true)
  const after = Object.keys(useScene.getState().nodes).length
  assert.equal(after, before + 1)
  const second = await api.taskPlan.runStep({ planId: plan.id, phaseId: 'build', stepId: 'box', actions })
  assert.equal(second.ok, true)
  assert.equal(Object.keys(useScene.getState().nodes).length, after)
  const undone = await api.taskPlan.undoStep({ planId: plan.id, phaseId: 'build', stepId: 'box' })
  assert.equal(undone.undone, true)
  assert.equal(Object.keys(useScene.getState().nodes).length, before)
  const step = undone.plan.phases[0]?.steps[0]
  assert.equal(step?.status, 'pending')
})

test('exportActions round-trips through replay', async () => {
  reset()
  const api = createPistolaAgentApi()
  await api.replay([
    { type: 'build_cad_solid', name: 'Replay probe', spec: { op: 'box', size: [0.3, 0.3, 0.3] } },
  ])
  const exported = api.exportActions()
  assert.equal(exported.length, 1)
  assert.equal((exported[0] as { name?: string } | undefined)?.name, 'Replay probe')
  await api.replay(exported)
  const names = Object.values(useScene.getState().nodes).map((node) => node?.name)
  assert.equal(names.filter((name) => name === 'Replay probe').length, 1)
  assert.equal(api.exportActions().length, 1)
})
