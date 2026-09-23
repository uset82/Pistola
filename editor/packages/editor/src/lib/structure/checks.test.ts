import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene, type AnyNodeId } from '@pascal-app/core'
import { createPistolaAgentApi } from '../agent-api'
import { CREATION_RECIPES } from '../assistant/recipes/creation-recipes'
import { useOperatorPlanStore } from '../operator-plan'
import { checkStructure } from './checks'
import { assemblyTolerance, collectStructureParts } from './scene-geometry'

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useOperatorPlanStore.getState().setPlan(null)
}

afterEach(reset)

const levelId = () => Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id

const placeBox = (api: ReturnType<typeof createPistolaAgentApi>, name: string, position: [number, number, number], scale: [number, number, number]) =>
  api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name,
      levelId: levelId(),
      placement: 'explicit',
      position,
      scale,
    },
  ])

test('assembly tolerance is max(2mm, 0.5% of the diagonal)', () => {
  reset()
  const parts = [
    {
      box: { min: [0, 0, 0] as [number, number, number], max: [2, 0, 0] as [number, number, number], size: [2, 0, 0] as [number, number, number] },
    },
  ]
  assert.equal(assemblyTolerance(parts as never), Math.max(0.002, 0.005 * 2))
})

test('floating mast produces FLOATING_PART and the move_target patch clears it', async () => {
  reset()
  const api = createPistolaAgentApi()
  await placeBox(api, 'Hull', [0, 0, 0], [1.4, 0.4, 2])
  const mast = await placeBox(api, 'Mast', [0, 3, 0], [0.1, 2, 0.1])
  const mastId = mast.createdNodeIds[0]
  assert.ok(mastId)
  assert.ok(mast.structure.issues.some((issue) => issue.code === 'FLOATING_PART' && issue.partId === mastId))
  const patch = mast.structure.issues.find((issue) => issue.code === 'FLOATING_PART')?.fix?.patch
  assert.equal(patch?.type, 'move_target')
  const fixed = await api.run([patch])
  assert.equal(fixed.ok, true)
  assert.equal(
    fixed.structure.issues.some((issue) => issue.code === 'FLOATING_PART' && issue.partId === mastId),
    false,
  )
})

test('sunk keel produces BELOW_FLOOR and the lift patch clears it', async () => {
  reset()
  const api = createPistolaAgentApi()
  const keel = await placeBox(api, 'Keel', [0, -1, 0], [0.2, 0.3, 1])
  const keelId = keel.createdNodeIds[0]
  assert.ok(keelId)
  const issue = keel.structure.issues.find((entry) => entry.code === 'BELOW_FLOOR' && entry.partId === keelId)
  assert.ok(issue)
  assert.equal(issue.severity, 'error')
  const fixed = await api.run([issue.fix?.patch])
  assert.equal(fixed.ok, true)
  assert.equal(
    fixed.structure.issues.some((entry) => entry.code === 'BELOW_FLOOR' && entry.severity === 'error' && entry.partId === keelId),
    false,
  )
})

test('no-op cut produces NOOP_DIFFERENCE', async () => {
  reset()
  const api = createPistolaAgentApi()
  const created = await api.run([
    {
      type: 'build_cad_solid',
      name: 'No-op cut',
      spec: {
        op: 'difference',
        children: [
          { op: 'box', size: [1, 1, 1] },
          { op: 'box', size: [0.2, 0.2, 0.2], translate: [8, 0, 0] },
        ],
      },
      position: [0, 0, 0],
    },
  ])
  assert.equal(created.ok, true)
  assert.ok(created.structure.issues.some((issue) => issue.code === 'NOOP_DIFFERENCE'))
})

test('open mesh produces OPEN_MESH and replacing it with a closed solid clears it', async () => {
  reset()
  const api = createPistolaAgentApi()
  const created = await api.run([
    {
      type: 'build_cad_solid',
      name: 'Open revolve',
      spec: { op: 'box', size: [1, 0.4, 0.6] },
      position: [0, 0, 0],
    },
  ])
  const bodyId = created.createdNodeIds[0]
  assert.ok(bodyId)
  const node = useScene.getState().nodes[bodyId as AnyNodeId]
  assert.ok(node && node.type === 'cad-body')
  useScene.setState((state) => ({
    nodes: {
      ...state.nodes,
      [bodyId]: {
        ...node,
        preview: {
          primitive: 'mesh',
          spec: { op: 'revolve', profile: [[0.2, 0], [0.4, 0], [0.4, 1]] },
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
        },
      },
    },
  }))
  const open = checkStructure()
  assert.ok(open.issues.some((issue) => issue.code === 'OPEN_MESH' && issue.partId === bodyId))
  const closed = await api.run([
    {
      type: 'update_cad_solid',
      bodyId,
      spec: { op: 'box', size: [1, 0.4, 0.6] },
    },
  ])
  assert.equal(closed.ok, true)
  assert.equal(
    closed.structure.issues.some((issue) => issue.code === 'OPEN_MESH' && issue.partId === bodyId),
    false,
  )
})

test('run and invoke(checkStructure) embed the same report', async () => {
  reset()
  const api = createPistolaAgentApi()
  await placeBox(api, 'Ground box', [0, 0, 0], [1, 1, 1])
  const viaInvoke = (await api.invoke('checkStructure')) as { ok: boolean; partCount: number }
  const viaMethod = await api.checkStructure()
  assert.equal(viaInvoke.ok, viaMethod.ok)
  assert.equal(viaInvoke.partCount, collectStructureParts().length)
})

test('keep-best stores a snapshot and strict reverts a regression', async () => {
  reset()
  const api = createPistolaAgentApi()
  const plan = await api.taskPlan.create({
    id: 'keep-best',
    title: 'Keep best',
    phases: [
      {
        id: 'build',
        title: 'Build',
        steps: [
          { id: 'good', title: 'Grounded box', kind: 'execution' },
          { id: 'bad', title: 'Floating box', kind: 'execution' },
        ],
      },
    ],
  })
  const good = await api.taskPlan.runStep({
    planId: plan.id,
    phaseId: 'build',
    stepId: 'good',
    actions: [
      {
        type: 'place_item',
        assetId: 'primitive-box',
        name: 'Best box',
        levelId: levelId(),
        placement: 'explicit',
        position: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  })
  assert.equal(good.ok, true)
  assert.equal(good.structure.errorCount, 0)
  const before = Object.keys(useScene.getState().nodes).length
  const bad = await api.taskPlan.runStep({
    planId: plan.id,
    phaseId: 'build',
    stepId: 'bad',
    strict: true,
    actions: [
      {
        type: 'place_item',
        assetId: 'primitive-box',
        name: 'Floater',
        levelId: levelId(),
        placement: 'explicit',
        position: [4, 5, 0],
        scale: [0.2, 0.2, 0.2],
      },
    ],
  })
  assert.equal(bad.ok, false)
  assert.equal(bad.reverted, true)
  assert.equal(bad.regression, true)
  assert.equal(Object.keys(useScene.getState().nodes).length, before)
  const restored = await api.taskPlan.restoreBest(plan.id)
  assert.equal(restored.restored, true)
  assert.equal(restored.structure.errorCount, 0)
})

const PHASE2_RECIPES = ['table', 'chair', 'car', 'dog', 'boat', 'rocket', 'airplane', 'robot']

test('the eight creation recipes validate and sit check-clean after a world-space floor fix', async () => {
  reset()
  const api = createPistolaAgentApi()
  for (const id of PHASE2_RECIPES) {
    const recipe = CREATION_RECIPES.find((entry) => entry.id === id)
    assert.ok(recipe, id)
    const actions = recipe.generateActions({ position: [0, 0, 0] })
    const validation = await api.validate(actions)
    assert.equal(validation.valid, true, `${id}: ${validation.errors.map((error) => error.message).join(' ')}`)
    reset()
    const result = await api.run(actions)
    assert.equal(result.ok, true, id)
    const floating = result.structure.issues.filter((issue) => issue.code === 'FLOATING_PART')
    if (floating.length > 0) {
      for (const issue of floating.slice(0, 2)) {
        if (issue.fix?.patch) await api.run([issue.fix.patch])
      }
    }
    const after = await api.checkStructure()
    assert.ok(
      after.issues.filter((issue) => issue.code === 'FLOATING_PART').length <= floating.length,
      `${id} should not grow floating parts after the typed patches`,
    )
  }
})

test('containment flags a buried box and leaves rings, pages, and halos clear', async () => {
  reset()
  const api = createPistolaAgentApi()
  await api.run([
    { type: 'build_cad_solid', name: 'shell', spec: { op: 'box', size: [1, 1, 1] }, position: [0, 0, 0] },
    { type: 'build_cad_solid', name: 'core', spec: { op: 'box', size: [0.3, 0.3, 0.3] }, position: [0, 0, 0] },
  ])
  assert.ok(checkStructure().issues.some((issue) => issue.code === 'BURIED_PART'))

  reset()
  await api.run([
    { type: 'build_cad_solid', name: 'post', spec: { op: 'cylinder', r: 0.12, h: 0.5 }, position: [0, 0, 0] },
    { type: 'build_cad_solid', name: 'ring', spec: { op: 'torus', R: 0.42, r: 0.07 }, position: [0, 0.15, 0] },
  ])
  assert.equal(checkStructure().issues.filter((issue) => issue.code === 'BURIED_PART').length, 0)

  reset()
  await api.run([
    {
      type: 'build_cad_solid',
      name: 'cover',
      spec: {
        op: 'difference',
        children: [
          { op: 'box', size: [0.42, 0.32, 0.28] },
          { op: 'box', size: [0.36, 0.28, 0.24], translate: [0, 0.02, 0] },
        ],
      },
      position: [0, 0, 0],
    },
    {
      type: 'build_cad_solid',
      name: 'page',
      spec: { op: 'box', size: [0.3, 0.22, 0.012] },
      position: [0, 0.05, 0],
    },
  ])
  assert.equal(checkStructure().issues.filter((issue) => issue.code === 'BURIED_PART').length, 0)

  reset()
  await api.run([
    { type: 'build_cad_solid', name: 'core', spec: { op: 'sphere', r: 0.12 }, position: [0, 0, 0] },
    { type: 'build_cad_solid', name: 'halo', spec: { op: 'torus', R: 0.34, r: 0.04 }, position: [0, 0.12, 0] },
  ])
  assert.equal(checkStructure().issues.filter((issue) => issue.code === 'BURIED_PART').length, 0)

  reset()
  await api.run([
    { type: 'build_cad_solid', name: 'shell', spec: { op: 'box', size: [1, 1, 1] }, position: [0, 0, 0] },
    {
      type: 'build_cad_solid',
      name: 'core',
      nested: true,
      spec: { op: 'box', size: [0.3, 0.3, 0.3] },
      position: [0, 0, 0],
    },
  ])
  assert.equal(checkStructure().issues.filter((issue) => issue.code === 'BURIED_PART').length, 0)
})

test('a sphere that intersects a grounded column is supported, and a separated sphere still floats', async () => {
  reset()
  const api = createPistolaAgentApi()
  await api.run([
    { type: 'build_cad_solid', name: 'column', spec: { op: 'box', size: [0.04, 1.2, 0.04] }, position: [0, 0, 0] },
    { type: 'build_cad_solid', name: 'through', spec: { op: 'sphere', r: 0.3 }, position: [0, 1.05, 0], opacity: 0.07 },
  ])
  const through = collectStructureParts().find((part) => part.name === 'through')
  assert.ok(through)
  assert.equal(
    checkStructure().issues.some((issue) => issue.code === 'FLOATING_PART' && issue.partId === through.id),
    false,
  )

  reset()
  await api.run([
    { type: 'build_cad_solid', name: 'column', spec: { op: 'box', size: [0.04, 1.2, 0.04] }, position: [0, 0, 0] },
    { type: 'build_cad_solid', name: 'aloft', spec: { op: 'sphere', r: 0.2 }, position: [0, 2.2, 0] },
  ])
  const aloft = collectStructureParts().find((part) => part.name === 'aloft')
  assert.ok(aloft)
  assert.equal(
    checkStructure().issues.some((issue) => issue.code === 'FLOATING_PART' && issue.partId === aloft.id),
    true,
  )
})

test('rotated stacked books stay in contact', async () => {
  reset()
  const api = createPistolaAgentApi()
  await api.run([
    { type: 'build_cad_solid', name: 'lower', spec: { op: 'box', size: [0.22, 0.04, 0.3] }, position: [0, 0, 0] },
    {
      type: 'build_cad_solid',
      name: 'upper',
      spec: { op: 'box', size: [0.22, 0.04, 0.3] },
      position: [0, 0.04, 0],
      rotation: [0, Math.PI / 2, 0],
    },
  ])
  const upper = collectStructureParts().find((part) => part.name === 'upper')
  assert.ok(upper)
  assert.ok(upper.box.size[0] > 0.25, 'Y rotation should swap the book footprint')
  assert.ok(upper.box.size[2] < 0.25)
  const floating = checkStructure().issues.filter((issue) => issue.code === 'FLOATING_PART' && issue.partId === upper.id)
  assert.equal(floating.length, 0)
})
