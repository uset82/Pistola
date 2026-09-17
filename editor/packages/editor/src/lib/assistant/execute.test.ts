import assert from 'node:assert/strict'
import test from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { executeAssistantPlan, validateAssistantPlan } from './execute'
import { prepareAssistantActionForExecution } from './execution-preparation'

const resetSceneWithTestNodes = (nodeIds: string[]) => {
  useScene.getState().clearScene()
  clearSceneHistory()

  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  if (!levelId) {
    throw new Error('Expected the default scene to include level 0.')
  }

  for (const nodeId of nodeIds) {
    useScene.getState().createNode(
      {
        id: nodeId,
        object: 'node',
        type: 'wall',
        visible: true,
        metadata: {},
        start: [0, 0],
        end: [1, 0],
        height: 2.7,
        thickness: 0.1,
      } as never,
      levelId,
    )
  }
}

test('prepareAssistantActionForExecution skips repeated delete_target steps for already deleted nodes', () => {
  const prepared = prepareAssistantActionForExecution(
    {
      type: 'delete_target',
      nodeId: 'wall_old',
    },
    new Set(['wall_old']),
  )

  assert.equal(prepared.action, null)
  assert.match(prepared.skippedMessage, /already deleted earlier in this plan/i)
})

test('prepareAssistantActionForExecution filters repeated delete_nodes targets and preserves the remaining plan', () => {
  resetSceneWithTestNodes(['slab_old'])

  const prepared = prepareAssistantActionForExecution(
    {
      type: 'delete_nodes',
      nodeIds: ['wall_old', 'roof_old', 'slab_old'],
    },
    new Set(['wall_old', 'roof_old']),
  )

  assert.notEqual(prepared.action, null)
  if (!prepared.action || prepared.action.type !== 'delete_nodes') {
    assert.fail('Expected delete_nodes to remain executable with the undeleted targets.')
  }

  assert.deepEqual(prepared.action.nodeIds, ['slab_old'])
  assert.match(prepared.skippedMessage ?? '', /continue with the remaining nodes/i)
})

test('prepareAssistantActionForExecution skips delete_nodes when every target was already removed', () => {
  const prepared = prepareAssistantActionForExecution(
    {
      type: 'delete_nodes',
      nodeIds: ['wall_old', 'roof_old'],
    },
    new Set(['wall_old', 'roof_old']),
  )

  assert.equal(prepared.action, null)
  assert.match(prepared.skippedMessage, /none of the reviewed targets still exist/i)
})

test('validateAssistantPlan rejects ordered plans that reference a node after deleting it', () => {
  const validation = validateAssistantPlan([
    { type: 'delete_target', nodeId: 'roof_old' },
    { type: 'rename_node', nodeId: 'roof_old', name: 'Dog House Roof' },
  ])

  assert.equal(validation.valid, false)
  assert.equal(validation.sequenceIssues[0]?.code, 'deleted-target-reference')
  assert.equal(
    validation.errors.some((error) => /deleted earlier in this reviewed plan/i.test(error)),
    true,
  )
})

test('executeAssistantPlan fails stale image-grounded delete_target actions before mutating a reviewed plan', async () => {
  resetSceneWithTestNodes([])

  const result = await executeAssistantPlan(
    [{ type: 'delete_target', nodeId: 'wall_missing' }],
    { reviewConfirmed: true },
  )

  assert.equal(result.ok, false)
  assert.equal(result.failureKind, 'plan-validation')
  assert.equal(result.completedActionCount, 0)
  assert.equal(result.warnings.length, 0)
  assert.match(result.errors[0] ?? '', /resolved target no longer exists/i)
})

test('executeAssistantPlan aborts reviewed delete batches when some reviewed targets disappear before execution', async () => {
  resetSceneWithTestNodes(['wall_surviving'])

  const result = await executeAssistantPlan(
    [{ type: 'delete_nodes', nodeIds: ['wall_surviving', 'wall_missing'] }],
    { reviewConfirmed: true },
  )

  assert.equal(result.ok, false)
  assert.equal(result.failureKind, 'plan-validation')
  assert.equal(result.completedActionCount, 0)
  assert.match(result.errors[0] ?? '', /continue with the remaining nodes/i)
  assert.equal(Boolean(useScene.getState().nodes.wall_surviving), true)
})

test('executeAssistantPlan rolls back reviewed plans when a later mutating action fails', async () => {
  resetSceneWithTestNodes([])
  const initialZoneCount = Object.values(useScene.getState().nodes).filter((node) => node.type === 'zone').length
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.ok(levelId)

  const result = await executeAssistantPlan(
    [
      {
        type: 'create_zone',
        refId: '$ref_zone_0',
        levelId,
        polygon: [[0, 0], [4, 0], [4, 4], [0, 4]],
      },
      { type: 'place_item', assetId: 'dog_bed', targetNodeId: '$ref_zone_0', placement: 'center' },
    ],
    { reviewConfirmed: true },
  )

  assert.equal(result.ok, false)
  assert.equal(result.failureKind, 'execution-rolled-back')
  assert.equal(result.snapshotRestored, true)
  assert.equal(result.completedActionCount, 1)
  assert.match(result.errors[0] ?? '', /asset "dog_bed" was not found in the catalog/i)
  const finalZoneCount = Object.values(useScene.getState().nodes).filter((node) => node.type === 'zone').length
  assert.equal(finalZoneCount, initialZoneCount)
})

test('executeAssistantPlan routes execute_cad_brief through the runtime bridge', async () => {
  let seenIntent: string | null = null
  resetSceneWithTestNodes([])
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.ok(levelId)
  useViewer.getState().setSelection({ selectedIds: [], zoneId: null, levelId })

  const result = await executeAssistantPlan(
    [
      {
        type: 'execute_cad_brief',
        brief: {
          intent: 'build a box 1m x 2m x 0.5m',
          sketchPlans: [
            {
              plane: 'level',
              entities: [
                {
                  type: 'rectangle',
                  points: [
                    [-0.5, -1],
                    [0.5, 1],
                  ],
                  params: {},
                },
              ],
              dimensions: [],
              constraints: [],
            },
          ],
          operationGraph: [
            {
              id: 'op_box_extrude_1',
              op: 'extrude',
              params: {
                sketchIndex: 0,
                distance: 0.5,
                direction: [0, 1, 0],
                symmetric: false,
              },
              dependsOn: [],
            },
          ],
          assumptions: [],
          ambiguities: [],
        },
      },
    ],
    {
      reviewConfirmed: true,
      runtime: {
        executeCadBrief: async (brief) => {
          seenIntent = brief.intent
          return {
            bodyIds: ['cbody_generated'],
            sketchIds: ['csketch_generated'],
          }
        },
      },
    },
  )

  assert.equal(seenIntent, 'build a box 1m x 2m x 0.5m')
  assert.equal(result.ok, true)
  assert.deepEqual(result.bodyIds, ['cbody_generated'])
  assert.deepEqual(result.sketchIds, ['csketch_generated'])
})
