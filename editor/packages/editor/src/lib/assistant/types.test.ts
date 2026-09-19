import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AssistantActionSchema,
  AssistantTurnResultSchema,
  assistantToolValues,
  isDestructiveAssistantActionType,
  isSafeImmediateAssistantActionType,
} from './types'

test('AssistantActionSchema parses a safe action', () => {
  const action = AssistantActionSchema.parse({
    type: 'set_phase',
    phase: 'structure',
  })

  assert.equal(action.type, 'set_phase')
  assert.equal(isSafeImmediateAssistantActionType(action.type), true)
})

test('AssistantActionSchema parses a CAD helper control action', () => {
  const action = AssistantActionSchema.parse({
    type: 'set_cad_workplane',
    workplane: 'XZ',
  })

  assert.equal(action.type, 'set_cad_workplane')
  assert.equal(isSafeImmediateAssistantActionType(action.type), true)
})

test('AssistantActionSchema parses a direct CAD brief execution action', () => {
  const action = AssistantActionSchema.parse({
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
          dimensions: [
            { kind: 'distance', value: 1, label: 'width' },
            { kind: 'distance', value: 2, label: 'depth' },
          ],
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
  })

  assert.equal(action.type, 'execute_cad_brief')
  assert.equal(action.brief.operationGraph[0]?.op, 'extrude')
  assert.equal(isSafeImmediateAssistantActionType(action.type), false)
})

test('AssistantActionSchema parses a MAC part generation action', () => {
  const action = AssistantActionSchema.parse({
    type: 'generate_mac_part',
    prompt: 'Create a 50x50x6 mm base plate with a 20 mm central hole.',
  })
  assert.equal(action.type, 'generate_mac_part')
})

test('AssistantActionSchema parses a local CAD solid action', () => {
  const action = AssistantActionSchema.parse({
    type: 'build_cad_solid',
    name: 'Hull',
    spec: { op: 'box', size: [0.16, 0.08, 0.4] },
    color: '#c8322d',
  })
  assert.equal(action.type, 'build_cad_solid')
  assert.equal((action.spec as { op?: string }).op, 'box')
})

test('AssistantActionSchema parses CAD sketch refinement actions', () => {
  const deleteConstraint = AssistantActionSchema.parse({
    type: 'delete_cad_sketch_constraint',
    sketchId: 'csketch_123',
    constraintId: 'constraint_1',
  })
  const updateDimension = AssistantActionSchema.parse({
    type: 'update_cad_sketch_dimension',
    sketchId: 'csketch_123',
    dimensionId: 'dimension_1',
    value: 1.25,
  })

  assert.equal(deleteConstraint.type, 'delete_cad_sketch_constraint')
  assert.equal(updateDimension.type, 'update_cad_sketch_dimension')
  assert.equal(isSafeImmediateAssistantActionType(deleteConstraint.type), false)
})

test('AssistantActionSchema parses building focus and batch delete actions', () => {
  const focusAction = AssistantActionSchema.parse({
    type: 'focus_building',
    buildingId: 'building_123',
  })
  const resetAction = AssistantActionSchema.parse({
    type: 'reset_workspace_selection',
  })
  const repositionAction = AssistantActionSchema.parse({
    type: 'reposition_target',
    nodeId: 'item_123',
  })
  const duplicateRepositionAction = AssistantActionSchema.parse({
    type: 'duplicate_reposition_target',
    nodeId: 'door_123',
  })
  const deleteAction = AssistantActionSchema.parse({
    type: 'delete_nodes',
    nodeIds: ['wall_123', 'item_456'],
  })

  assert.equal(resetAction.type, 'reset_workspace_selection')
  assert.equal(focusAction.type, 'focus_building')
  assert.equal(repositionAction.type, 'reposition_target')
  assert.equal(duplicateRepositionAction.type, 'duplicate_reposition_target')
  assert.equal(deleteAction.type, 'delete_nodes')
  assert.equal(isSafeImmediateAssistantActionType(resetAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(focusAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(repositionAction.type), true)
  assert.equal(isDestructiveAssistantActionType(deleteAction.type), true)
})

test('AssistantActionSchema parses create_guide', () => {
  const action = AssistantActionSchema.parse({
    type: 'create_guide',
    view: 'front',
    url: 'data:image/png;base64,AAAA',
    position: [0, 1, -1.2],
  })
  assert.equal(action.type, 'create_guide')
  assert.equal(action.view, 'front')
})

test('AssistantActionSchema parses an item tool activation with a catalog category', () => {
  const action = AssistantActionSchema.parse({
    type: 'activate_tool',
    tool: 'item',
    catalogCategory: 'kitchen',
  })

  assert.equal(action.type, 'activate_tool')
  assert.equal(action.catalogCategory, 'kitchen')
  assert.equal(isSafeImmediateAssistantActionType(action.type), true)
})

test('AssistantActionSchema only allows currently implemented tool activations', () => {
  const toolValues = assistantToolValues as readonly string[]

  assert.equal(toolValues.includes('wall'), true)
  assert.equal(toolValues.includes('cad-inspect'), true)
  assert.equal(toolValues.includes('room'), false)
  assert.equal(toolValues.includes('custom-room'), false)
  assert.equal(toolValues.includes('column'), false)
  assert.equal(toolValues.includes('stair'), false)

  const unsupportedColumn = AssistantActionSchema.safeParse({
    type: 'activate_tool',
    tool: 'column',
  })
  const unsupportedRoom = AssistantActionSchema.safeParse({
    type: 'activate_tool',
    tool: 'room',
  })

  assert.equal(unsupportedColumn.success, false)
  assert.equal(unsupportedRoom.success, false)
})

test('AssistantActionSchema parses editor control actions as safe immediate actions', () => {
  const cameraAction = AssistantActionSchema.parse({
    type: 'set_camera_mode',
    cameraMode: 'orthographic',
  })
  const transformAction = AssistantActionSchema.parse({
    type: 'set_transform_mode',
    transformMode: 'rotate',
  })
  const undoAction = AssistantActionSchema.parse({
    type: 'undo_history',
  })

  assert.equal(cameraAction.type, 'set_camera_mode')
  assert.equal(transformAction.type, 'set_transform_mode')
  assert.equal(undoAction.type, 'undo_history')
  assert.equal(isSafeImmediateAssistantActionType(cameraAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(transformAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(undoAction.type), true)
})

test('AssistantActionSchema parses a destructive action', () => {
  const action = AssistantActionSchema.parse({
    type: 'delete_target',
    nodeId: 'roof_123',
  })

  assert.equal(action.type, 'delete_target')
  assert.equal(isDestructiveAssistantActionType(action.type), true)
})

test('AssistantActionSchema parses a bounded level cleanup action', () => {
  const action = AssistantActionSchema.parse({
    type: 'clear_level_contents',
    levelId: 'level_0',
  })

  assert.equal(action.type, 'clear_level_contents')
  assert.equal(action.levelId, 'level_0')
  assert.equal(isDestructiveAssistantActionType(action.type), true)
})

test('AssistantTurnResultSchema keeps action plans under the 25 action limit', () => {
  const actions = Array.from({ length: 25 }, () => ({
    type: 'set_mode',
    mode: 'select',
  }))

  const turn = AssistantTurnResultSchema.parse({
    reply: 'I can do that.',
    mode: 'plan',
    assumptions: [],
    ambiguities: [],
    actions,
    requiresReview: false,
    destructiveActionCount: 0,
  })

  assert.equal(turn.actions.length, 25)
})

test('AssistantTurnResultSchema parses structured continuation metadata', () => {
  const turn = AssistantTurnResultSchema.parse({
    reply: 'Continuing the build.',
    mode: 'plan',
    assumptions: ['Continuing the existing build sequence.'],
    ambiguities: [],
    actions: [{ type: 'set_mode', mode: 'select' }],
    requiresReview: false,
    destructiveActionCount: 0,
    continuation: {
      kind: 'local-sequence',
      intentId: 'house_shell_recipe',
      originPrompt: 'make a furnished small two-bedroom house with kitchen and living room',
      summary: 'Creating the requested house shell.',
      stepIndex: 1,
      totalSteps: 2,
      remainingActions: [{ type: 'set_phase', phase: 'furnish' }],
      autoContinue: true,
    },
  })

  assert.equal(turn.continuation?.kind, 'local-sequence')
  assert.equal(turn.continuation?.remainingActions.length, 1)
})

test('AssistantTurnResultSchema parses image interpretation and grounded target candidates', () => {
  const turn = AssistantTurnResultSchema.parse({
    reply: 'I can remove the highlighted walls after review.',
    mode: 'plan',
    assumptions: [],
    ambiguities: [],
    actions: [{ type: 'delete_nodes', nodeIds: ['wall_a', 'wall_b'] }],
    requiresReview: true,
    destructiveActionCount: 1,
    targetingExplanation: 'Using the uploaded screenshot as workspace context.',
    targetCandidates: [
      { id: 'wall_a', type: 'wall', name: 'Wall A', source: 'image-region', confidence: 0.82 },
      { id: 'wall_b', type: 'wall', name: 'Wall B', source: 'image-region', confidence: 0.79 },
    ],
    imageInterpretation: {
      kind: 'workspace',
      ocrText: ['REMOVE'],
      annotationHints: [{ kind: 'region', region: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } }],
      targetHints: [{ text: 'wall', targetTypes: ['wall'] }],
      buildHints: [{ text: 'Resolve targets against existing scene nodes first.' }],
      confidence: 0.91,
    },
  })

  assert.equal(turn.imageInterpretation?.kind, 'workspace')
  assert.equal(turn.targetCandidates?.length, 2)
  assert.equal(turn.targetCandidates?.[0]?.source, 'image-region')
})

test('AssistantTurnResultSchema preserves forward refs used by later actions', () => {
  const turn = AssistantTurnResultSchema.parse({
    reply: 'Creating the shell.',
    mode: 'plan',
    assumptions: [],
    ambiguities: [],
    actions: [
      {
        type: 'create_wall',
        refId: '$ref_wall_0',
        levelId: 'level_0',
        start: [0, 0],
        end: [5, 0],
      },
      {
        type: 'place_door',
        wallId: '$ref_wall_0',
        localX: 1.2,
      },
    ],
    requiresReview: true,
    destructiveActionCount: 0,
  })

  assert.equal(turn.actions[0]?.type, 'create_wall')
  assert.equal(turn.actions[0]?.refId, '$ref_wall_0')

  const doorAction = turn.actions[1]
  assert.equal(doorAction?.type, 'place_door')
  if (!doorAction || doorAction.type !== 'place_door') {
    assert.fail('Expected the second action to remain a place_door action.')
  }
  assert.equal(doorAction.wallId, '$ref_wall_0')
})

test('AssistantActionSchema parses a direct CAD body edit action', () => {
  const action = AssistantActionSchema.parse({
    type: 'apply_cad_fillet',
    bodyId: 'cbody_123',
    radius: 0.08,
  })

  assert.equal(action.type, 'apply_cad_fillet')
  assert.equal(isSafeImmediateAssistantActionType(action.type), false)
  assert.equal(isDestructiveAssistantActionType(action.type), false)
})

test('AssistantActionSchema parses a direct CAD sketch operation', () => {
  const action = AssistantActionSchema.parse({
    type: 'extrude_cad_sketch',
    sketchId: 'csketch_123',
    depth: 0.5,
    direction: 'symmetric',
  })

  assert.equal(action.type, 'extrude_cad_sketch')
  assert.equal(action.direction, 'symmetric')
  assert.equal(isSafeImmediateAssistantActionType(action.type), false)
})

test('AssistantActionSchema parses a CAD body retry action', () => {
  const action = AssistantActionSchema.parse({
    type: 'retry_cad_body',
    bodyId: 'cbody_123',
  })

  assert.equal(action.type, 'retry_cad_body')
  assert.equal(isDestructiveAssistantActionType(action.type), false)
})

test('AssistantActionSchema parses direct CAD box feature edits', () => {
  const faceAction = AssistantActionSchema.parse({
    type: 'extrude_cad_body_face',
    bodyId: 'cbody_123',
    face: 'front',
    distance: 0.2,
  })
  const shellAction = AssistantActionSchema.parse({
    type: 'shell_cad_body',
    bodyId: 'cbody_123',
    thickness: 0.05,
  })

  assert.equal(faceAction.type, 'extrude_cad_body_face')
  assert.equal(faceAction.face, 'front')
  assert.equal(shellAction.type, 'shell_cad_body')
  assert.equal(shellAction.thickness, 0.05)
  assert.equal(isSafeImmediateAssistantActionType(faceAction.type), false)
  assert.equal(isDestructiveAssistantActionType(shellAction.type), true)
})

test('AssistantActionSchema parses a close CAD sketch action', () => {
  const action = AssistantActionSchema.parse({
    type: 'close_cad_sketch',
    sketchId: 'csketch_123',
  })

  assert.equal(action.type, 'close_cad_sketch')
  assert.equal(isSafeImmediateAssistantActionType(action.type), true)
})

test('AssistantActionSchema parses a CAD body operation suppression action', () => {
  const action = AssistantActionSchema.parse({
    type: 'set_cad_body_operation_suppressed',
    bodyId: 'cbody_123',
    operationId: 'cadop_123',
    suppressed: true,
  })

  assert.equal(action.type, 'set_cad_body_operation_suppressed')
  assert.equal(isSafeImmediateAssistantActionType(action.type), false)
})

test('AssistantActionSchema parses camera snapshot mutations', () => {
  const action = AssistantActionSchema.parse({
    type: 'capture_camera_snapshot',
    nodeId: 'level_123',
  })

  assert.equal(action.type, 'capture_camera_snapshot')
  assert.equal(isSafeImmediateAssistantActionType(action.type), false)
})

test('AssistantActionSchema parses export and screenshot actions', () => {
  const exportAction = AssistantActionSchema.parse({
    type: 'export_scene',
    format: 'glb',
  })
  const screenshotAction = AssistantActionSchema.parse({
    type: 'take_screenshot',
  })

  assert.equal(exportAction.type, 'export_scene')
  assert.equal(exportAction.format, 'glb')
  assert.equal(screenshotAction.type, 'take_screenshot')
  assert.equal(isSafeImmediateAssistantActionType(exportAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(screenshotAction.type), true)
})

test('AssistantActionSchema parses viewer visibility and camera utility actions', () => {
  const scansAction = AssistantActionSchema.parse({
    type: 'set_scans_visibility',
    enabled: false,
  })
  const gridAction = AssistantActionSchema.parse({
    type: 'set_grid_visibility',
    enabled: true,
  })
  const orbitAction = AssistantActionSchema.parse({
    type: 'orbit_camera',
    direction: 'ccw',
  })

  assert.equal(scansAction.type, 'set_scans_visibility')
  assert.equal(gridAction.type, 'set_grid_visibility')
  assert.equal(orbitAction.type, 'orbit_camera')
  assert.equal(isSafeImmediateAssistantActionType(scansAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(gridAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(orbitAction.type), true)
})

test('AssistantActionSchema parses phase 1 gap actions', () => {
  const siteAction = AssistantActionSchema.parse({
    type: 'create_site',
    name: 'Main Site',
  })
  const buildingAction = AssistantActionSchema.parse({
    type: 'create_building',
    siteId: 'site_1',
    name: 'Guest House',
  })
  const focusCameraAction = AssistantActionSchema.parse({
    type: 'focus_camera_on_nodes',
    nodeIds: ['wall_1', 'wall_2'],
  })
  const addEntitiesAction = AssistantActionSchema.parse({
    type: 'add_cad_sketch_entities',
    sketchId: 'csk_1',
    entities: [{ kind: 'circle', center: [0, 0], radius: 2 }],
  })
  const setPlaneAction = AssistantActionSchema.parse({
    type: 'set_cad_sketch_plane',
    sketchId: 'csk_1',
    plane: 'XZ',
  })
  const reparentAction = AssistantActionSchema.parse({
    type: 'reparent_node',
    nodeId: 'item_1',
    newParentId: 'level_1',
  })
  const metadataAction = AssistantActionSchema.parse({
    type: 'set_node_metadata',
    nodeId: 'item_1',
    key: 'status',
    value: 'approved',
  })

  assert.equal(siteAction.type, 'create_site')
  assert.equal(buildingAction.type, 'create_building')
  assert.equal(focusCameraAction.type, 'focus_camera_on_nodes')
  assert.equal(addEntitiesAction.type, 'add_cad_sketch_entities')
  assert.equal(setPlaneAction.type, 'set_cad_sketch_plane')
  assert.equal(reparentAction.type, 'reparent_node')
  assert.equal(metadataAction.type, 'set_node_metadata')
  assert.equal(isSafeImmediateAssistantActionType(focusCameraAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(setPlaneAction.type), true)
  assert.equal(isSafeImmediateAssistantActionType(metadataAction.type), true)
})

