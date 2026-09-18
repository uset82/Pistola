import {
  isDestructiveAssistantActionType,
  type AssistantAction,
} from './types'

export type AssistantActionSequenceIssueCode =
  | 'deleted-target-reference'
  | 'implicit-target-drift'
  | 'invalid-forward-ref-owner'
  | 'missing-forward-ref'

export type AssistantActionSequenceIssue = {
  code: AssistantActionSequenceIssueCode
  index: number
  message: string
}

export type AssistantActionSequenceValidationResult = {
  valid: boolean
  issues: AssistantActionSequenceIssue[]
}

type ImplicitTargetDriftCause = {
  index: number
  actionType: AssistantAction['type']
}

const nodeCreatingActionTypes = new Set<AssistantAction['type']>([
  'create_site',
  'create_building',
  'create_level',
  'create_wall',
  'create_zone',
  'create_slab',
  'create_ceiling',
  'create_roof',
  'place_item',
  'place_door',
  'place_window',
  'duplicate_target',
  'duplicate_reposition_target',
  'create_default_cad_sketch',
  'extrude_cad_sketch',
  'revolve_cad_sketch',
  'apply_cad_boolean',
  'apply_cad_fillet',
  'apply_cad_chamfer',
  'add_cad_box_ears',
  'extrude_cad_body_face',
  'shell_cad_body',
])

const implicitTargetDriftActionTypes = new Set<AssistantAction['type']>([
  'reset_workspace_selection',
  'focus_building',
  'focus_level',
  'focus_camera_on_nodes',
  'select_nodes',
  'reposition_target',
  'run_cad_prompt',
])

const appendId = (ids: string[], value: string | undefined | null) => {
  if (typeof value === 'string' && value.trim().length > 0) {
    ids.push(value)
  }
}

const appendIds = (ids: string[], values: string[] | undefined) => {
  values?.forEach((value) => {
    appendId(ids, value)
  })
}

const collectReferencedIds = (action: AssistantAction): string[] => {
  const ids: string[] = []

  switch (action.type) {
    case 'focus_building':
      appendId(ids, action.buildingId)
      break
    case 'focus_level':
    case 'rename_level':
      appendId(ids, action.levelId)
      break
    case 'select_nodes':
      appendIds(ids, action.nodeIds)
      appendId(ids, action.zoneId)
      break
    case 'reposition_target':
    case 'rename_node':
    case 'update_zone_color':
    case 'update_polygon_node':
    case 'update_polygon_holes':
    case 'update_item_properties':
    case 'update_door_properties':
    case 'update_window_properties':
    case 'update_wall_properties':
    case 'update_slab_properties':
    case 'update_ceiling_properties':
    case 'update_roof_properties':
    case 'update_reference_properties':
    case 'update_site_properties':
    case 'move_target':
    case 'rotate_target':
    case 'scale_target':
    case 'duplicate_target':
    case 'duplicate_reposition_target':
    case 'delete_target':
      appendId(ids, action.nodeId)
      break
    case 'set_node_visibility':
    case 'delete_nodes':
      appendIds(ids, action.nodeIds)
      break
    case 'create_level':
      appendId(ids, action.buildingId)
      break
    case 'create_wall':
    case 'create_zone':
    case 'create_slab':
    case 'create_ceiling':
    case 'create_roof':
    case 'clear_level_contents':
      appendId(ids, action.levelId)
      break
    case 'place_item':
      appendId(ids, action.levelId)
      appendId(ids, action.targetNodeId)
      appendId(ids, action.parentId)
      break
    case 'place_door':
    case 'place_window':
      appendId(ids, action.wallId)
      break
    case 'close_cad_sketch':
    case 'delete_cad_sketch_constraint':
    case 'update_cad_sketch_dimension':
    case 'extrude_cad_sketch':
    case 'revolve_cad_sketch':
      appendId(ids, action.sketchId)
      break
    case 'regenerate_cad_body':
    case 'retry_cad_body':
    case 'set_cad_body_operation_suppressed':
    case 'apply_cad_fillet':
    case 'apply_cad_chamfer':
    case 'add_cad_box_ears':
    case 'extrude_cad_body_face':
    case 'shell_cad_body':
    case 'export_cad_body_step':
      appendId(ids, action.bodyId)
      break
    case 'apply_cad_boolean':
      appendId(ids, action.targetBodyId)
      appendId(ids, action.toolBodyId)
      break
    case 'create_building':
      appendId(ids, action.siteId)
      break
    case 'focus_camera_on_nodes':
      appendIds(ids, action.nodeIds)
      break
    case 'add_cad_sketch_entities':
    case 'set_cad_sketch_plane':
      appendId(ids, action.sketchId)
      break
    case 'reparent_node':
      appendId(ids, action.nodeId)
      appendId(ids, action.newParentId)
      break
    case 'set_node_metadata':
      appendId(ids, action.nodeId)
      break
    default:
      break
  }

  return ids
}

const actionUsesImplicitTarget = (action: AssistantAction) => {
  switch (action.type) {
    case 'reposition_target':
    case 'move_target':
    case 'rotate_target':
    case 'scale_target':
    case 'duplicate_target':
    case 'duplicate_reposition_target':
    case 'delete_target':
      return !action.nodeId
    case 'create_building':
      return !action.siteId
    case 'create_level':
      return !action.buildingId
    case 'create_wall':
    case 'create_zone':
    case 'create_slab':
    case 'create_ceiling':
    case 'create_roof':
    case 'clear_level_contents':
      return !action.levelId
    case 'place_item':
      return !action.levelId && !action.targetNodeId && !action.parentId
    case 'create_default_cad_sketch':
      return true
    case 'close_cad_sketch':
    case 'delete_cad_sketch_constraint':
    case 'update_cad_sketch_dimension':
    case 'extrude_cad_sketch':
    case 'revolve_cad_sketch':
    case 'add_cad_sketch_entities':
    case 'set_cad_sketch_plane':
      return !action.sketchId
    case 'regenerate_cad_body':
    case 'retry_cad_body':
    case 'set_cad_body_operation_suppressed':
    case 'apply_cad_fillet':
    case 'apply_cad_chamfer':
    case 'add_cad_box_ears':
    case 'extrude_cad_body_face':
    case 'shell_cad_body':
    case 'export_cad_body_step':
      return !action.bodyId
    case 'apply_cad_boolean':
      return !action.targetBodyId || !action.toolBodyId
    default:
      return false
  }
}

const actionChangesImplicitTargetContext = (action: AssistantAction) =>
  nodeCreatingActionTypes.has(action.type) ||
  implicitTargetDriftActionTypes.has(action.type) ||
  isDestructiveAssistantActionType(action.type)

const actionCanOwnForwardRef = (action: AssistantAction) =>
  nodeCreatingActionTypes.has(action.type)

export const validateAssistantActionSequence = (
  actions: readonly AssistantAction[],
): AssistantActionSequenceValidationResult => {
  const issues: AssistantActionSequenceIssue[] = []
  const createdForwardRefs = new Set<string>()
  const deletedTargetIds = new Set<string>()
  let driftCause: ImplicitTargetDriftCause | null = null

  actions.forEach((action, index) => {
    if (action.refId && !actionCanOwnForwardRef(action)) {
      issues.push({
        code: 'invalid-forward-ref-owner',
        index,
        message: `Action ${index + 1} uses refId "${action.refId}" on "${action.type}", but only node-creating actions may define forward refs.`,
      })
    }

    for (const targetId of collectReferencedIds(action)) {
      if (deletedTargetIds.has(targetId)) {
        issues.push({
          code: 'deleted-target-reference',
          index,
          message: `Action ${index + 1} targets "${targetId}" after it was deleted earlier in this reviewed plan.`,
        })
      }

      if (targetId.startsWith('$ref_') && !createdForwardRefs.has(targetId)) {
        issues.push({
          code: 'missing-forward-ref',
          index,
          message: `Action ${index + 1} references "${targetId}" before any earlier creating action defines that refId.`,
        })
      }
    }

    if (driftCause && actionUsesImplicitTarget(action)) {
      issues.push({
        code: 'implicit-target-drift',
        index,
        message: `Action ${index + 1} relies on an implicit target after action ${driftCause.index + 1} (${driftCause.actionType}) changed selection or scene context. Use an explicit node ID or forward ref instead.`,
      })
    }

    if (action.refId && actionCanOwnForwardRef(action)) {
      createdForwardRefs.add(action.refId)
    }

    switch (action.type) {
      case 'delete_target':
        if (typeof action.nodeId === 'string' && action.nodeId.trim().length > 0) {
          deletedTargetIds.add(action.nodeId)
        }
        break
      case 'delete_nodes':
        action.nodeIds.forEach((nodeId) => {
          if (nodeId.trim().length > 0) {
            deletedTargetIds.add(nodeId)
          }
        })
        break
      default:
        break
    }

    if (actionChangesImplicitTargetContext(action)) {
      driftCause = { index, actionType: action.type }
    }
  })

  return {
    valid: issues.length === 0,
    issues,
  }
}
