import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { createPistolaAgentApi } from '../agent-api'
import { useOperatorPlanStore } from '../operator-plan'
import { checkBlueprint, checkSceneAgainstPlan } from './check'
import { proposeRelationSnaps } from './snap'

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useOperatorPlanStore.getState().setPlan(null)
}

afterEach(reset)

const sailboat = (mastY = 0.4, mastH = 2.4) => ({
  version: 2 as const,
  title: 'Sailboat',
  frame: { up: '+Y', front: '+Z', right: '+X', units: 'meters', origin: 'bottom-center' },
  overall_m: [1.4, 2.8, 3.2],
  anchor: 'floor' as const,
  parts: [
    {
      id: 'hull',
      name: 'Hull',
      role: 'hull',
      technique: 'primitive' as const,
      primitive: 'box' as const,
      dims_m: [1.4, 0.4, 3.2] as [number, number, number],
      position_m: [0, 0, 0] as [number, number, number],
      color: '#8b5a2b',
      parent: null,
    },
    {
      id: 'mast',
      name: 'Mast',
      role: 'mast',
      technique: 'primitive' as const,
      primitive: 'cylinder' as const,
      dims_m: [0.1, mastH, 0.1] as [number, number, number],
      position_m: [0, mastY, 0.2] as [number, number, number],
      color: '#d6c6a8',
      parent: 'hull',
    },
  ],
  relations: [
    { a: 'mast', aFace: 'ny' as const, rel: 'on_top_of' as const, b: 'hull', bFace: 'py' as const, tol_m: 0.02 },
  ],
})

test('plan.check catches a sailboat mast that is not on the hull', () => {
  const ok = checkBlueprint(sailboat(0.4, 2.4))
  assert.equal(ok.ok, true)
  const bad = checkBlueprint(sailboat(2, 2.4))
  assert.equal(bad.ok, false)
  assert.ok(bad.issues.some((issue) => issue.code === 'RELATION_VIOLATED' && issue.partId === 'mast'))
})

test('the snapper proposes a move_target that sits the mast on the hull and does not apply it', () => {
  const snapped = proposeRelationSnaps(sailboat(2, 2.4))
  assert.equal(snapped.applied, false)
  assert.equal(snapped.patches.length, 1)
  assert.equal(snapped.patches[0]?.patch.type, 'move_target')
  assert.deepEqual(snapped.patches[0]?.delta, [0, -1.6, 0])
})

test('taskPlan.create({blueprint}) builds one step per part plus check and render', async () => {
  reset()
  const api = createPistolaAgentApi()
  const plan = await api.taskPlan.create({
    id: 'from-blueprint',
    replace: true,
    blueprint: sailboat(),
  })
  assert.equal(plan.title, 'Sailboat')
  assert.equal(plan.phases[0]?.id, 'build')
  const ids = plan.phases[0]?.steps.map((step) => step.id)
  assert.deepEqual(ids, ['hull', 'mast', 'check', 'render'])
  assert.equal(plan.phases[0]?.steps[0]?.kind, 'execution')
  assert.equal(plan.phases[0]?.steps[2]?.kind, 'validation')
  const checked = await api.invoke('plan.check', sailboat(2, 2.4))
  assert.equal((checked as { ok: boolean }).ok, false)
})

test('taskPlan.create rejects a blueprint that fails plan.check', async () => {
  reset()
  const api = createPistolaAgentApi()
  await assert.rejects(
    () =>
      api.taskPlan.create({
        id: 'bad-blueprint',
        replace: true,
        blueprint: sailboat(2, 2.4),
      }),
    /plan.check/,
  )
})

test('applying the snapper delta makes plan.check pass and does not mutate the scene', () => {
  const before = Object.keys(useScene.getState().nodes)
  const bad = sailboat(2, 2.4)
  const snapped = proposeRelationSnaps(bad)
  const mast = bad.parts[1]
  assert.ok(mast && snapped.patches[0])
  mast.position_m = [
    mast.position_m[0] + snapped.patches[0].delta[0],
    mast.position_m[1] + snapped.patches[0].delta[1],
    mast.position_m[2] + snapped.patches[0].delta[2],
  ]
  assert.equal(checkBlueprint(bad).ok, true)
  assert.deepEqual(Object.keys(useScene.getState().nodes), before)
})

test('scene-vs-plan reports PART_MISSING, DIM_MISMATCH and POSITION_MISMATCH', async () => {
  reset()
  const api = createPistolaAgentApi()
  const empty = checkSceneAgainstPlan(sailboat())
  assert.ok(empty.issues.some((issue) => issue.code === 'PART_MISSING' && issue.partId === 'hull'))
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  await api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name: 'Hull',
      levelId,
      placement: 'explicit',
      position: [0, 0, 2],
      scale: [1.4, 0.8, 3.2],
    },
    {
      type: 'place_item',
      assetId: 'primitive-cylinder',
      name: 'Mast',
      levelId,
      placement: 'explicit',
      position: [0, 0.4, 0.2],
      scale: [0.1, 2.4, 0.1],
    },
  ])
  const report = await api.invoke('plan.checkScene', sailboat())
  const issues = (report as { issues: Array<{ code: string; partId: string }> }).issues
  assert.ok(issues.some((issue) => issue.code === 'DIM_MISMATCH' && issue.partId === 'hull'))
  assert.ok(issues.some((issue) => issue.code === 'POSITION_MISMATCH' && issue.partId === 'hull'))
})

test('plan.check flags a cyclic parent and an overall that the parts cannot make', () => {
  const cyclic = sailboat()
  cyclic.parts[0]!.parent = 'mast'
  cyclic.parts[1]!.parent = 'hull'
  const cycle = checkBlueprint(cyclic)
  assert.ok(cycle.issues.some((issue) => issue.code === 'RELATION_VIOLATED' && issue.fix?.hint?.includes('cyclic')))
  const huge = sailboat()
  huge.overall_m = [10, 10, 10]
  const acceptance = checkBlueprint(huge)
  assert.ok(acceptance.issues.some((issue) => issue.code === 'ACCEPTANCE_FAILED'))
})
