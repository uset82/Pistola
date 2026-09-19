import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { createPistolaAgentApi } from '../agent-api'
import { useOperatorPlanStore } from '../operator-plan'
import { AGENT_EXAMPLES } from './catalog'
import { getExample, searchExamples } from './search'

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useOperatorPlanStore.getState().setPlan(null)
}

afterEach(reset)

test('examples.search ranks wheel-axle and examples.get returns editable $ref actions', async () => {
  reset()
  const api = createPistolaAgentApi()
  const hits = await api.invoke('examples.search', 'wheel axle')
  assert.equal((hits as Array<{ id: string }>)[0]?.id, 'wheel-axle')
  const got = await api.invoke('examples.get', { id: 'leg-set', at: [2, 0, 0] })
  const actions = (got as { actions: Array<{ position?: number[]; refId?: string; levelId?: string }> }).actions
  assert.equal(actions.length, 4)
  assert.ok(actions.every((action) => action.refId?.startsWith('$ref_')))
  assert.ok(actions[0]?.position?.[0] === 2 - (1.2 / 2 - 0.06) || Math.abs((actions[0]?.position?.[0] ?? 0) - (2 - 0.54)) < 0.01)
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.equal(actions[0]?.levelId, levelId)
  assert.ok(searchExamples('revolve').some((hit) => hit.id === 'technique-revolve'))
})

test('every technique, subassembly and library example builds with 0 checker errors', async () => {
  reset()
  const api = createPistolaAgentApi()
  const ids = AGENT_EXAMPLES.filter((entry) => entry.kind !== 'recipe').map((entry) => entry.id)
  assert.ok(ids.includes('technique-box'))
  assert.ok(ids.includes('cabinet-carcass'))
  assert.ok(ids.includes('library-geometric-phone-stand'))
  const failures: string[] = []
  for (const id of ids) {
    reset()
    const instantiated = getExample({ id })
    const validation = await api.validate(instantiated.actions)
    if (!validation.valid) {
      failures.push(`${id}: invalid ${validation.errors.map((error) => error.message).join(' ')}`)
      continue
    }
    const result = await api.run(instantiated.actions)
    if (!result.ok) {
      failures.push(`${id}: run failed`)
      continue
    }
    const report = await api.checkStructure()
    if (report.errorCount > 0) {
      failures.push(`${id}: ${report.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code).join(', ')}`)
    }
  }
  assert.deepEqual(failures, [])
})
