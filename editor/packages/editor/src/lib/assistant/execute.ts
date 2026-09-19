'use client'

import {
  emitter,
  type AnyNode,
  type AnyNodeId,
  type CadBrief,
  CadBodyNodeSchema,
  generateId,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { placeCadBodyInArchitecture } from '../place-cad-instance'
import { resolveCadSpaceParentId } from '../cad-parent'
import { evaluateCadSolidSpec } from '../cad/local-kernel'
import { CadSolidSpecSchema } from '../cad/solid-spec'
import { applySceneGraphToEditor, type SceneGraph } from '../scene'
import { cadHelperUnavailableMessage } from '../../store/use-cad'
import useCad from '../../store/use-cad'
import useEditor from '../../store/use-editor'
import { downloadIfcScene } from '../ifc-export'
import {
  addCadSketchEntities,
  createBuilding,
  createCeiling,
  createLevel,
  createRoof,
  createSite,
  createSlab,
  createWall,
  createZone,
  clearLevelContents,
  focusCameraOnNodes,
  reparentNode,
  setCadSketchPlane,
  setNodeMetadata,
  deleteCadSketchConstraint,
  deleteNodes,
  deleteTarget,
  duplicateRepositionTarget,
  duplicateTarget,
  moveTarget,
  placeDoor,
  placeItem,
  placeWindow,
  repositionTarget,
  renameNode,
  resetWorkspaceSelection,
  selectBuilding,
  renameLevel,
  resolveCadBody,
  rotateTarget,
  scaleTarget,
  selectLevel,
  selectNodes,
  setNodeVisibility,
  updateCeilingProperties,
  updateCadSketchDimension,
  updateDoorProperties,
  updateItemProperties,
  updatePolygonHoles,
  updatePolygonNode,
  updateReferenceProperties,
  updateRoofProperties,
  updateSiteProperties,
  updateSlabProperties,
  updateWallProperties,
  updateWindowProperties,
  updateZoneColor,
} from './builders'
import { findCatalogItem } from './catalog'
import { startTransformMove } from '../transform-actions'
import {
  getTransformCapabilities,
  getTransformTargetNode,
  resolveTransformTargetFromSelection,
} from '../transform-target'
import {
  AssistantActionSchema,
  type AssistantAction,
  isDestructiveAssistantActionType,
  isSafeImmediateAssistantActionType,
} from './types'
import { prepareAssistantActionForExecution } from './execution-preparation'
import {
  type AssistantActionSequenceIssue,
  validateAssistantActionSequence,
} from './sequence-validation'
import {
  buildEarAttachmentSpecs,
  buildFaceExtrusionSpec,
  buildShellPanelSpecs,
  getBoxBodySummary,
} from './box-features'
import { assistantToolPhaseMap, assistantToolValues } from './tool-surface'

/**
 * Forward-reference prefix. The LLM uses `$ref_N` placeholders when an action
 * needs to reference a node that will be created by an earlier action in the
 * same plan. The executor resolves these to real IDs at runtime.
 */
const FORWARD_REF_PREFIX = '$ref_'

export const isForwardRef = (id: string | undefined | null): boolean =>
  typeof id === 'string' && id.startsWith(FORWARD_REF_PREFIX)

/**
 * Deep-replace every `$ref_N` string value in an action object with the real
 * node ID from `refMap`. Returns a shallow clone so the original is untouched.
 */
const resolveRefsInAction = (
  action: AssistantAction,
  refMap: Map<string, string>,
): AssistantAction => {
  if (refMap.size === 0) return action

  const json = JSON.stringify(action)
  let resolved = json
  for (const [ref, realId] of refMap) {
    // Replace all occurrences of the ref string (it appears as a JSON string value)
    resolved = resolved.replaceAll(`"${ref}"`, `"${realId}"`)
  }
  return resolved === json ? action : (JSON.parse(resolved) as AssistantAction)
}

export type AssistantActionKind = 'safe-immediate' | 'mutating'

export type AssistantValidatedAction = {
  action: AssistantAction
  kind: AssistantActionKind
  destructive: boolean
}

export type AssistantPlanValidationResult = {
  valid: boolean
  actions: AssistantAction[]
  validatedActions: AssistantValidatedAction[]
  errors: string[]
  sequenceIssues: AssistantActionSequenceIssue[]
  requiresReview: boolean
  destructiveActionCount: number
  /** Maps action index → refId string (e.g. "$ref_0") when the LLM assigned one. */
  actionRefIds: Map<number, string>
}

export type AssistantExecutionRuntime = {
  executeCadBrief?: (
    brief: CadBrief,
  ) => Promise<{
    sketchIds?: string[]
    bodyIds?: string[]
  }>
  runCadPrompt?: (
    prompt: string,
  ) => Promise<{
    sketchIds?: string[]
    bodyIds?: string[]
  }>
  generateMacPart?: (
    prompt: string,
  ) => Promise<{
    bodyIds?: string[]
    jobId?: string
  }>
}

export type AssistantExecutionStatus = {
  index: number
  action: AssistantAction
  status: 'started' | 'completed' | 'failed'
  message: string
}

export type AssistantExecutionOptions = {
  maxActions?: number
  reviewConfirmed?: boolean
  runtime?: AssistantExecutionRuntime
  onStatus?: (status: AssistantExecutionStatus) => void
}

export type AssistantExecutionResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
  failureKind: 'plan-validation' | 'execution-rolled-back' | null
  failedActionIndex: number | null
  resolvedForwardRefs: Record<string, string>
  completedActionCount: number
  requiresReview: boolean
  destructiveActionCount: number
  snapshotRestored: boolean
  createdNodeIds: string[]
  bodyIds: string[]
  sketchIds: string[]
}

type AssistantExecutedActionResult = {
  nodeId?: string | null
  bodyIds?: string[]
  sketchIds?: string[]
  deletedNodeIds?: string[]
}

const cadToolSet = new Set(assistantToolValues.filter((tool) => tool.startsWith('cad-')))

const cloneSceneGraph = (): SceneGraph => ({
  nodes: structuredClone(useScene.getState().nodes) as SceneGraph['nodes'],
  rootNodeIds: [...useScene.getState().rootNodeIds],
})

const getCurrentSelectionNode = () => {
  const selection = useViewer.getState().selection
  if (selection.selectedIds.length === 1) {
    return useScene.getState().nodes[selection.selectedIds[0] as AnyNodeId] as AnyNode | undefined
  }
  if (selection.zoneId) {
    return useScene.getState().nodes[selection.zoneId as AnyNodeId] as AnyNode | undefined
  }
  return undefined
}

const getResolvedTransformTarget = () =>
  resolveTransformTargetFromSelection({
    nodes: useScene.getState().nodes,
    selectedIds: useViewer.getState().selection.selectedIds,
    selectedReferenceId: useEditor.getState().selectedReferenceId,
  })

const getSnapshotTargetNode = (nodeId: string) => useScene.getState().nodes[nodeId as AnyNodeId] ?? null

const getDateStamp = () => new Date().toISOString().split('T')[0]

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const getCadBodyById = (bodyId: string | undefined) => {
  const node = bodyId
    ? useScene.getState().nodes[bodyId as AnyNodeId]
    : getCurrentSelectionNode()
  return node?.type === 'cad-body' ? node : null
}

const getCadSketchById = (sketchId: string | undefined) => {
  if (sketchId) {
    const node = useScene.getState().nodes[sketchId as AnyNodeId]
    return node?.type === 'cad-sketch' ? node : null
  }

  const activeSketchId = useEditor.getState().activeSketchId
  if (activeSketchId) {
    const activeNode = useScene.getState().nodes[activeSketchId as AnyNodeId]
    if (activeNode?.type === 'cad-sketch') return activeNode
  }

  const node = getCurrentSelectionNode()
  return node?.type === 'cad-sketch' ? node : null
}

const getSelectedCadBodies = () =>
  useViewer
    .getState()
    .selection.selectedIds.map((nodeId) => useScene.getState().nodes[nodeId as AnyNodeId])
    .filter((node): node is AnyNode => node != null && node.type === 'cad-body')

const getCadBodyOperations = (bodyId: string | undefined) => {
  const body = getCadBodyById(bodyId)
  if (!body) return null
  return body.operationHistory.length > 0 ? body.operationHistory : body.operations
}

const createAttachmentBodies = (
  parentId: string,
  specs: Array<{
    name: string
    position: [number, number, number]
    rotation: [number, number, number]
    dimensions: [number, number, number]
    color: string
  }>,
  warning: string,
) =>
  specs.map((spec) => {
    const nextBody = CadBodyNodeSchema.parse({
      id: generateId('cbody'),
      name: spec.name,
      parentId,
      transform: {
        position: spec.position,
        rotation: spec.rotation,
        scale: [1, 1, 1],
      },
      sourceSketchId: null,
      sourceSketchIds: [],
      regenStatus: 'idle',
      regenError: null,
      preview: {
        primitive: 'box',
        dimensions: spec.dimensions,
        color: spec.color,
      },
      operations: [],
      operationHistory: [],
      artifacts: {},
      warnings: [warning],
    })

    useScene.getState().createNode(nextBody, parentId as AnyNodeId)
    return nextBody.id
  })

const buildBoxEarBodies = (bodyId: string | undefined) => {
  const body = getCadBodyById(bodyId)
  if (!body) throw new Error('Select a CAD body before adding ears.')
  const boxBody = getBoxBodySummary(body)
  if (!boxBody) {
    throw new Error('The selected CAD body must use a box preview before adding ears.')
  }
  const createdBodyIds = createAttachmentBodies(
    boxBody.parentId,
    buildEarAttachmentSpecs(boxBody),
    'Assistant-generated CAD ear attachment.',
  )

  useViewer.getState().setSelection({ selectedIds: [body.id, ...createdBodyIds], zoneId: null })
  useEditor.getState().setActiveSketchId(null)
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)

  return [body.id, ...createdBodyIds]
}

const buildBoxFaceExtrusionBodies = (
  bodyId: string | undefined,
  face: Extract<AssistantAction, { type: 'extrude_cad_body_face' }>['face'],
  distance?: number,
) => {
  const body = getCadBodyById(bodyId)
  if (!body) throw new Error('Select a CAD body before extruding a face.')
  const boxBody = getBoxBodySummary(body)
  if (!boxBody) {
    throw new Error('The selected CAD body must use a box preview before extruding a face.')
  }

  const createdBodyIds = createAttachmentBodies(
    boxBody.parentId,
    [buildFaceExtrusionSpec(boxBody, face, distance)],
    'Assistant-generated CAD face extrusion.',
  )

  useViewer.getState().setSelection({ selectedIds: [body.id, ...createdBodyIds], zoneId: null })
  useEditor.getState().setActiveSketchId(null)
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)

  return [body.id, ...createdBodyIds]
}

const buildShellCadBody = (bodyId: string | undefined, thickness?: number) => {
  const body = getCadBodyById(bodyId)
  if (!body) throw new Error('Select a CAD body before creating a shell.')
  const boxBody = getBoxBodySummary(body)
  if (!boxBody) {
    throw new Error('The selected CAD body must use a box preview before creating a shell.')
  }

  const createdBodyIds = createAttachmentBodies(
    boxBody.parentId,
    buildShellPanelSpecs(boxBody, thickness),
    'Assistant-generated CAD shell surface panel.',
  )
  useScene.getState().deleteNode(body.id as AnyNodeId)
  useViewer.getState().setSelection({ selectedIds: createdBodyIds, zoneId: null })
  useEditor.getState().setActiveSketchId(null)
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)

  return createdBodyIds
}

const classifyAction = (action: AssistantAction): AssistantValidatedAction => ({
  action,
  kind: isSafeImmediateAssistantActionType(action.type) ? 'safe-immediate' : 'mutating',
  destructive: isDestructiveAssistantActionType(action.type),
})

const getValidationError = (action: AssistantAction) => {
  switch (action.type) {
    case 'reset_workspace_selection':
    case 'set_camera_mode':
    case 'set_theme':
    case 'set_level_view_mode':
    case 'set_wall_view_mode':
    case 'set_preview_mode':
    case 'set_scans_visibility':
    case 'set_guides_visibility':
    case 'set_grid_visibility':
    case 'set_transform_pivot':
    case 'camera_top_view':
    case 'orbit_camera':
    case 'set_fullscreen':
    case 'undo_history':
    case 'redo_history':
    case 'export_scene':
    case 'copy_share_link':
    case 'take_screenshot':
      return null
    case 'set_transform_mode': {
      const transformTarget = getResolvedTransformTarget()
      const transformNode = getTransformTargetNode(useScene.getState().nodes, transformTarget)
      if (!transformTarget || !transformNode) {
        return 'Select a single transformable target before entering a transform mode.'
      }

      const capabilities = getTransformCapabilities(transformNode)
      return capabilities[action.transformMode]
        ? null
        : `The selected ${transformNode.type} does not support ${action.transformMode} mode.`
    }
    case 'capture_camera_snapshot':
    case 'view_camera_snapshot':
    case 'clear_camera_snapshot':
      return isForwardRef(action.nodeId) || getSnapshotTargetNode(action.nodeId)
        ? null
        : `Node "${action.nodeId}" was not found.`
    case 'focus_building': {
      if (isForwardRef(action.buildingId)) return null
      const node = useScene.getState().nodes[action.buildingId as AnyNodeId]
      return node?.type === 'building' ? null : `Building "${action.buildingId}" was not found.`
    }
    case 'focus_level': {
      if (isForwardRef(action.levelId)) return null
      const node = useScene.getState().nodes[action.levelId as AnyNodeId]
      return node?.type === 'level' ? null : `Level "${action.levelId}" was not found.`
    }
    case 'select_nodes': {
      for (const nodeId of action.nodeIds) {
        if (!isForwardRef(nodeId) && !useScene.getState().nodes[nodeId as AnyNodeId])
          return `Node "${nodeId}" was not found.`
      }
      if (action.zoneId && !isForwardRef(action.zoneId)) {
        const zone = useScene.getState().nodes[action.zoneId as AnyNodeId]
        if (zone?.type !== 'zone') return `Zone "${action.zoneId}" was not found.`
      }
      return null
    }
    case 'reposition_target':
    case 'duplicate_reposition_target': {
      if (isForwardRef(action.nodeId)) return null
      const node = action.nodeId
        ? useScene.getState().nodes[action.nodeId as AnyNodeId]
        : getCurrentSelectionNode()
      if (!node) return 'Select a single item, door, or window before running this action.'
      return node.type === 'item' || node.type === 'door' || node.type === 'window'
        ? null
        : `The selected ${node.type} does not support reposition mode.`
    }
    case 'create_level': {
      if (!action.buildingId || isForwardRef(action.buildingId)) return null
      const building = useScene.getState().nodes[action.buildingId as AnyNodeId]
      return building?.type === 'building' ? null : `Building "${action.buildingId}" was not found.`
    }
    case 'close_cad_sketch': {
      if (isForwardRef(action.sketchId)) return null
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) {
        return action.sketchId
          ? `CAD sketch "${action.sketchId}" was not found.`
          : 'Select or open a CAD sketch before closing it.'
      }
      return null
    }
    case 'delete_cad_sketch_constraint': {
      if (isForwardRef(action.sketchId)) return null
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) {
        return action.sketchId
          ? `CAD sketch "${action.sketchId}" was not found.`
          : 'Select or open a CAD sketch before deleting a constraint.'
      }
      return sketch.constraints.some((constraint) => constraint.id === action.constraintId)
        ? null
        : `Constraint "${action.constraintId}" was not found on CAD sketch "${sketch.id}".`
    }
    case 'update_cad_sketch_dimension': {
      if (isForwardRef(action.sketchId)) return null
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) {
        return action.sketchId
          ? `CAD sketch "${action.sketchId}" was not found.`
          : 'Select or open a CAD sketch before updating a dimension.'
      }
      return sketch.dimensions.some((dimension) => dimension.id === action.dimensionId)
        ? null
        : `Dimension "${action.dimensionId}" was not found on CAD sketch "${sketch.id}".`
    }
    case 'rename_level': {
      if (isForwardRef(action.levelId)) return null
      const level = useScene.getState().nodes[action.levelId as AnyNodeId]
      return level?.type === 'level' ? null : `Level "${action.levelId}" was not found.`
    }
    case 'rename_node': {
      if (isForwardRef(action.nodeId)) return null
      return useScene.getState().nodes[action.nodeId as AnyNodeId]
        ? null
        : `Node "${action.nodeId}" was not found.`
    }
    case 'set_node_visibility': {
      for (const nodeId of action.nodeIds) {
        if (!isForwardRef(nodeId) && !useScene.getState().nodes[nodeId as AnyNodeId]) {
          return `Node "${nodeId}" was not found.`
        }
      }
      return null
    }
    case 'update_zone_color': {
      if (isForwardRef(action.nodeId)) return null
      const zone = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return zone?.type === 'zone' ? null : `Zone "${action.nodeId}" was not found.`
    }
    case 'update_polygon_node': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      if (!node) return `Node "${action.nodeId}" was not found.`
      return node.type === 'site' || node.type === 'zone' || node.type === 'slab' || node.type === 'ceiling'
        ? null
        : `Node "${action.nodeId}" does not support polygon updates.`
    }
    case 'update_polygon_holes': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      if (!node) return `Node "${action.nodeId}" was not found.`
      return node.type === 'slab' || node.type === 'ceiling'
        ? null
        : `Node "${action.nodeId}" does not support polygon hole updates.`
    }
    case 'create_wall':
    case 'create_zone':
    case 'create_slab':
    case 'create_ceiling':
    case 'create_roof': {
      if (!action.levelId || isForwardRef(action.levelId)) return null
      const level = useScene.getState().nodes[action.levelId as AnyNodeId]
      return level?.type === 'level' ? null : `Level "${action.levelId}" was not found.`
    }
    case 'place_item':
      return null
    case 'place_door':
    case 'place_window': {
      if (isForwardRef(action.wallId)) return null
      const wall = useScene.getState().nodes[action.wallId as AnyNodeId]
      return wall?.type === 'wall' ? null : `Wall "${action.wallId}" was not found.`
    }
    case 'update_item_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'item' ? null : `Item "${action.nodeId}" was not found.`
    }
    case 'update_door_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'door' ? null : `Door "${action.nodeId}" was not found.`
    }
    case 'update_window_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'window' ? null : `Window "${action.nodeId}" was not found.`
    }
    case 'update_wall_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'wall' ? null : `Wall "${action.nodeId}" was not found.`
    }
    case 'update_slab_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'slab' ? null : `Slab "${action.nodeId}" was not found.`
    }
    case 'update_ceiling_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'ceiling' ? null : `Ceiling "${action.nodeId}" was not found.`
    }
    case 'update_roof_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'roof' ? null : `Roof "${action.nodeId}" was not found.`
    }
    case 'update_reference_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'guide' || node?.type === 'scan'
        ? null
        : `Reference "${action.nodeId}" was not found.`
    }
    case 'update_site_properties': {
      if (isForwardRef(action.nodeId)) return null
      const node = useScene.getState().nodes[action.nodeId as AnyNodeId]
      return node?.type === 'site' ? null : `Site "${action.nodeId}" was not found.`
    }
    case 'move_target':
    case 'rotate_target':
    case 'scale_target':
    case 'duplicate_target':
    case 'delete_target':
      return isForwardRef(action.nodeId) || action.nodeId || getCurrentSelectionNode()
        ? null
        : 'Select a single node before running this action.'
    case 'delete_nodes': {
      return null
    }
    case 'create_default_cad_sketch': {
      const level = useViewer.getState().selection.levelId
      const siteExists = useScene
        .getState()
        .rootNodeIds.some((rootId) => useScene.getState().nodes[rootId]?.type === 'site')
      return level || siteExists ? null : 'Create or select a site or level before starting a CAD sketch.'
    }
    case 'execute_cad_brief': {
      const level = useViewer.getState().selection.levelId
      const siteExists = useScene
        .getState()
        .rootNodeIds.some((rootId) => useScene.getState().nodes[rootId]?.type === 'site')
      return level || siteExists || resolveCadSpaceParentId()
        ? null
        : 'Create or select a site or level before creating CAD geometry.'
    }
    case 'build_cad_solid': {
      const specResult = CadSolidSpecSchema.safeParse(action.spec)
      if (!specResult.success) {
        return specResult.error.issues
          .map((issue) => `${issue.path.join('.') || 'spec'}: ${issue.message}`)
          .join('; ')
      }
      const level = useViewer.getState().selection.levelId
      const siteExists = useScene
        .getState()
        .rootNodeIds.some((rootId) => useScene.getState().nodes[rootId]?.type === 'site')
      return level || siteExists || resolveCadSpaceParentId()
        ? null
        : 'Create or select a site or level before creating CAD geometry.'
    }
    case 'extrude_cad_sketch':
    case 'revolve_cad_sketch': {
      if (isForwardRef(action.sketchId)) return null
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) {
        return action.sketchId
          ? `CAD sketch "${action.sketchId}" was not found.`
          : 'Select or open a CAD sketch before running this action.'
      }
      if (sketch.closedProfileEntityIds.length === 0) {
        return `The active CAD sketch needs a closed profile before using "${action.type}".`
      }
      if (action.type === 'revolve_cad_sketch' && action.axis === 'custom' && !action.customAxis) {
        return 'Custom revolve axes require a customAxis vector.'
      }

      const { helperStatus, lastError } = useCad.getState()
      return helperStatus === 'error' ? lastError || cadHelperUnavailableMessage : null
    }
    case 'regenerate_cad_body':
    case 'export_cad_body_step': {
      if (isForwardRef(action.bodyId)) return null
      const node = action.bodyId
        ? useScene.getState().nodes[action.bodyId as AnyNodeId]
        : getCurrentSelectionNode()
      return node?.type === 'cad-body' ? null : 'Select a CAD body before running this action.'
    }
    case 'retry_cad_body': {
      if (isForwardRef(action.bodyId)) return null
      const node = action.bodyId
        ? useScene.getState().nodes[action.bodyId as AnyNodeId]
        : getCurrentSelectionNode()
      return node?.type === 'cad-body' ? null : 'Select a CAD body before retrying regeneration.'
    }
    case 'set_cad_body_operation_suppressed': {
      if (isForwardRef(action.bodyId)) return null
      const body = getCadBodyById(action.bodyId)
      if (!body) return 'Select a CAD body before changing operation suppression.'
      const operations = getCadBodyOperations(body.id)
      return operations?.some((operation) => operation.id === action.operationId)
        ? null
        : `CAD operation "${action.operationId}" was not found on the selected body.`
    }
    case 'apply_cad_boolean': {
      const targetNode =
        action.targetBodyId && !isForwardRef(action.targetBodyId)
          ? useScene.getState().nodes[action.targetBodyId as AnyNodeId]
          : null
      const toolNode =
        action.toolBodyId && !isForwardRef(action.toolBodyId)
          ? useScene.getState().nodes[action.toolBodyId as AnyNodeId]
          : null

      if (action.targetBodyId && !isForwardRef(action.targetBodyId) && targetNode?.type !== 'cad-body') {
        return `CAD body "${action.targetBodyId}" was not found.`
      }
      if (action.toolBodyId && !isForwardRef(action.toolBodyId) && toolNode?.type !== 'cad-body') {
        return `CAD body "${action.toolBodyId}" was not found.`
      }
      if (action.targetBodyId && action.toolBodyId && action.targetBodyId === action.toolBodyId) {
        return 'Boolean operations require two different CAD bodies.'
      }

      const selectedBodies = getSelectedCadBodies()
      return action.targetBodyId || action.toolBodyId || selectedBodies.length === 2
        ? null
        : 'Select exactly two CAD bodies before running this action.'
    }
    case 'apply_cad_fillet':
    case 'apply_cad_chamfer':
    case 'add_cad_box_ears':
    case 'extrude_cad_body_face':
    case 'shell_cad_body': {
      if (isForwardRef(action.bodyId)) return null
      const node = action.bodyId
        ? useScene.getState().nodes[action.bodyId as AnyNodeId]
        : getCurrentSelectionNode()
      if (node?.type !== 'cad-body') return 'Select a CAD body before running this action.'
      if (
        (action.type === 'add_cad_box_ears' ||
          action.type === 'extrude_cad_body_face' ||
          action.type === 'shell_cad_body') &&
        node.preview.primitive !== 'box'
      ) {
        return 'The selected CAD body must use a box preview before running this action.'
      }
      return null
    }
    case 'activate_tool': {
      if (!cadToolSet.has(action.tool)) return null
      return null
    }
    case 'create_site':
      return null
    case 'create_building': {
      if (action.siteId && !isForwardRef(action.siteId)) {
        const site = useScene.getState().nodes[action.siteId as AnyNodeId]
        if (!site) return `Site node "${action.siteId}" was not found.`
        if (site.type !== 'site') return `Node "${action.siteId}" is not a site.`
      }
      return null
    }
    case 'focus_camera_on_nodes': {
      for (const nodeId of action.nodeIds) {
        if (!isForwardRef(nodeId) && !useScene.getState().nodes[nodeId as AnyNodeId]) {
          return `Node "${nodeId}" was not found.`
        }
      }
      return null
    }
    case 'add_cad_sketch_entities': {
      if (action.sketchId && !isForwardRef(action.sketchId)) {
        const sketch = getCadSketchById(action.sketchId)
        if (!sketch) return `CAD sketch "${action.sketchId}" was not found.`
      }
      return null
    }
    case 'set_cad_sketch_plane': {
      if (action.sketchId && !isForwardRef(action.sketchId)) {
        const sketch = getCadSketchById(action.sketchId)
        if (!sketch) return `CAD sketch "${action.sketchId}" was not found.`
      }
      return null
    }
    case 'reparent_node': {
      if (!isForwardRef(action.nodeId) && !useScene.getState().nodes[action.nodeId as AnyNodeId]) {
        return `Node "${action.nodeId}" was not found.`
      }
      if (!isForwardRef(action.newParentId) && !useScene.getState().nodes[action.newParentId as AnyNodeId]) {
        return `New parent node "${action.newParentId}" was not found.`
      }
      return null
    }
    case 'set_node_metadata': {
      if (!isForwardRef(action.nodeId) && !useScene.getState().nodes[action.nodeId as AnyNodeId]) {
        return `Node "${action.nodeId}" was not found.`
      }
      return null
    }
    default:
      return null
  }
}

export const validateAssistantPlan = (
  actionsInput: unknown,
  options: { maxActions?: number } = {},
): AssistantPlanValidationResult => {
  const maxActions = options.maxActions ?? 25

  try {
    // Extract refId from raw actions before Zod strips unknown fields.
    const actionRefIds = new Map<number, string>()
    if (Array.isArray(actionsInput)) {
      for (let i = 0; i < actionsInput.length; i += 1) {
        const raw = actionsInput[i]
        if (raw && typeof raw === 'object' && 'refId' in raw && typeof raw.refId === 'string') {
          actionRefIds.set(i, raw.refId)
        }
      }
    }

    const actions = Array.isArray(actionsInput)
      ? actionsInput.map((action) => AssistantActionSchema.parse(action))
      : []

    if (actions.length > maxActions) {
      return {
        valid: false,
        actions,
        validatedActions: [],
        errors: [`Assistant plans may contain at most ${maxActions} actions.`],
        sequenceIssues: [],
        requiresReview: false,
        destructiveActionCount: 0,
        actionRefIds,
      }
    }

    const errors = actions
      .map((action, index) => {
        const issue = getValidationError(action)
        return issue ? `Action ${index + 1}: ${issue}` : null
      })
      .filter((issue): issue is string => Boolean(issue))
    const sequenceValidation = validateAssistantActionSequence(actions)
    const sequenceErrors = sequenceValidation.issues.map((issue) => issue.message)

    const validatedActions = actions.map(classifyAction)
    const destructiveActionCount = validatedActions.filter((item) => item.destructive).length
    const requiresReview = validatedActions.some((item) => item.kind === 'mutating')

    return {
      valid: errors.length === 0 && sequenceErrors.length === 0,
      actions,
      validatedActions,
      errors: [...errors, ...sequenceErrors],
      sequenceIssues: sequenceValidation.issues,
      requiresReview,
      destructiveActionCount,
      actionRefIds,
    }
  } catch (error) {
    return {
      valid: false,
      actions: [],
      validatedActions: [],
      errors: [error instanceof Error ? error.message : 'Assistant actions failed to parse.'],
      sequenceIssues: [],
      requiresReview: false,
      destructiveActionCount: 0,
      actionRefIds: new Map(),
    }
  }
}

const buildExecutionResult = (
  validation: Pick<AssistantPlanValidationResult, 'requiresReview' | 'destructiveActionCount'>,
  overrides: Partial<AssistantExecutionResult>,
): AssistantExecutionResult => ({
  ok: false,
  errors: [],
  warnings: [],
  failureKind: null,
  failedActionIndex: null,
  resolvedForwardRefs: {},
  completedActionCount: 0,
  requiresReview: validation.requiresReview,
  destructiveActionCount: validation.destructiveActionCount,
  snapshotRestored: false,
  createdNodeIds: [],
  bodyIds: [],
  sketchIds: [],
  ...overrides,
})

const notifyStatus = (options: AssistantExecutionOptions, payload: AssistantExecutionStatus) => {
  options.onStatus?.(payload)
}

const executeAction = async (
  action: AssistantAction,
  options: AssistantExecutionOptions,
): Promise<AssistantExecutedActionResult> => {
  switch (action.type) {
    case 'reset_workspace_selection':
      return { nodeId: resetWorkspaceSelection() }
    case 'set_phase':
      useEditor.getState().setPhase(action.phase)
      return {}
    case 'set_workspace':
      useEditor.getState().setWorkspace(action.workspace)
      return {}
    case 'set_mode':
      useEditor.getState().setMode(action.mode)
      return {}
    case 'set_structure_layer':
      useEditor.getState().setStructureLayer(action.layer)
      return {}
    case 'set_camera_mode':
      useViewer.getState().setCameraMode(action.cameraMode)
      return {}
    case 'set_theme':
      useViewer.getState().setTheme(action.theme)
      return {}
    case 'set_level_view_mode':
      useViewer.getState().setLevelMode(action.levelMode)
      return {}
    case 'set_wall_view_mode':
      useViewer.getState().setWallMode(action.wallMode)
      return {}
    case 'set_preview_mode':
      useEditor.getState().setPreviewMode(action.enabled)
      return {}
    case 'set_scans_visibility':
      useViewer.getState().setShowScans(action.enabled)
      return {}
    case 'set_guides_visibility':
      useViewer.getState().setShowGuides(action.enabled)
      return {}
    case 'set_grid_visibility':
      useViewer.getState().setShowGrid(action.enabled)
      return {}
    case 'set_cad_workplane':
      useEditor.getState().setWorkspace('cad')
      useEditor.getState().setActiveWorkplane(action.workplane)
      return {}
    case 'set_transform_mode': {
      const transformTarget = getResolvedTransformTarget()
      if (!transformTarget) throw new Error('Select a single transformable target before entering a transform mode.')

      if (action.transformMode === 'move') {
        startTransformMove(transformTarget)
      } else {
        useEditor.getState().setTransformMode(action.transformMode)
      }
      return {}
    }
    case 'set_transform_pivot':
      useEditor.getState().setTransformPivot(action.pivot)
      return {}
    case 'camera_top_view':
      emitter.emit('camera-controls:top-view')
      return {}
    case 'orbit_camera':
      emitter.emit(action.direction === 'cw' ? 'camera-controls:orbit-cw' : 'camera-controls:orbit-ccw')
      return {}
    case 'set_fullscreen':
      if (action.enabled) {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen()
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen()
      }
      return {}
    case 'undo_history':
      useScene.temporal.getState().undo()
      return {}
    case 'redo_history':
      useScene.temporal.getState().redo()
      return {}
    case 'export_scene': {
      if (action.format === 'json') {
        const { nodes, rootNodeIds } = useScene.getState()
        downloadBlob(
          new Blob([JSON.stringify({ nodes, rootNodeIds }, null, 2)], { type: 'application/json' }),
          `scene_${getDateStamp()}.json`,
        )
        return {}
      }

      if (action.format === 'ifc') {
        const { nodes, rootNodeIds } = useScene.getState()
        downloadIfcScene({ nodes, rootNodeIds })
        return {}
      }

      const exportScene = useViewer.getState().exportScene
      if (!exportScene) {
        throw new Error('3D model export is not available in this editor session.')
      }
      await exportScene()
      return {}
    }
    case 'copy_share_link':
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is not available in this editor session.')
      }
      await navigator.clipboard.writeText(window.location.href)
      return {}
    case 'take_screenshot': {
      const canvas = document.querySelector('canvas')
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('No canvas is available for screenshot capture.')
      }
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `screenshot_${getDateStamp()}.png`
      link.click()
      return {}
    }
    case 'capture_camera_snapshot':
      if (!getSnapshotTargetNode(action.nodeId)) throw new Error(`Node "${action.nodeId}" was not found.`)
      emitter.emit('camera-controls:capture', { nodeId: action.nodeId as AnyNodeId })
      return { nodeId: action.nodeId }
    case 'view_camera_snapshot':
      if (!getSnapshotTargetNode(action.nodeId)) throw new Error(`Node "${action.nodeId}" was not found.`)
      emitter.emit('camera-controls:view', { nodeId: action.nodeId as AnyNodeId })
      return { nodeId: action.nodeId }
    case 'clear_camera_snapshot':
      if (!getSnapshotTargetNode(action.nodeId)) throw new Error(`Node "${action.nodeId}" was not found.`)
      useScene.getState().updateNode(action.nodeId as AnyNodeId, { camera: undefined } as any)
      return { nodeId: action.nodeId }
    case 'close_cad_sketch': {
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) throw new Error('Select or open a CAD sketch before closing it.')
      useScene
        .getState()
        .updateNode(sketch.id as AnyNodeId, { editStatus: 'idle' } as Record<string, unknown>)
      useEditor.getState().setActiveSketchId(null)
      return { sketchIds: [sketch.id], nodeId: sketch.id }
    }
    case 'delete_cad_sketch_constraint': {
      const sketchId = deleteCadSketchConstraint(action)
      return { sketchIds: [sketchId], nodeId: sketchId }
    }
    case 'update_cad_sketch_dimension': {
      const sketchId = updateCadSketchDimension(action)
      return { sketchIds: [sketchId], nodeId: sketchId }
    }
    case 'activate_tool': {
      const phase = assistantToolPhaseMap[action.tool]
      if (phase) useEditor.getState().setPhase(phase)
      if (action.tool === 'cad-boolean' && action.cadBooleanMode) {
        useEditor.getState().setCadBooleanMode(action.cadBooleanMode)
      }
      useEditor.getState().setCatalogCategory(action.catalogCategory ?? null)
      useEditor.getState().setMode(action.tool === 'cad-inspect' ? 'select' : 'build')
      useEditor.getState().setTool(action.tool)
      return {}
    }
    case 'focus_building':
      return { nodeId: selectBuilding(action.buildingId) }
    case 'focus_level':
      return { nodeId: selectLevel(action.levelId) }
    case 'select_nodes':
      return { nodeId: selectNodes(action) }
    case 'reposition_target':
      return { nodeId: repositionTarget(action) }
    case 'create_level':
      return { nodeId: createLevel(action) }
    case 'rename_level':
      return { nodeId: renameLevel(action) }
    case 'rename_node':
      return { nodeId: renameNode(action) }
    case 'set_node_visibility':
      return { nodeId: setNodeVisibility(action) }
    case 'update_zone_color':
      return { nodeId: updateZoneColor(action) }
    case 'update_polygon_node':
      return { nodeId: updatePolygonNode(action) }
    case 'update_polygon_holes':
      return { nodeId: updatePolygonHoles(action) }
    case 'create_wall':
      useEditor.getState().setWorkspace('architecture')
      return { nodeId: createWall(action) }
    case 'create_zone':
      return { nodeId: createZone(action) }
    case 'create_slab':
      return { nodeId: createSlab(action) }
    case 'create_ceiling':
      return { nodeId: createCeiling(action) }
    case 'create_roof':
      return { nodeId: createRoof(action) }
    case 'place_item':
      if (!findCatalogItem(action.assetId)) {
        throw new Error(`Asset "${action.assetId}" was not found in the catalog.`)
      }
      return { nodeId: placeItem(action) }
    case 'place_door':
      return { nodeId: placeDoor(action) }
    case 'place_window':
      return { nodeId: placeWindow(action) }
    case 'update_item_properties':
      return { nodeId: updateItemProperties(action) }
    case 'update_door_properties':
      return { nodeId: updateDoorProperties(action) }
    case 'update_window_properties':
      return { nodeId: updateWindowProperties(action) }
    case 'update_wall_properties':
      return { nodeId: updateWallProperties(action) }
    case 'update_slab_properties':
      return { nodeId: updateSlabProperties(action) }
    case 'update_ceiling_properties':
      return { nodeId: updateCeilingProperties(action) }
    case 'update_roof_properties':
      return { nodeId: updateRoofProperties(action) }
    case 'update_reference_properties':
      return { nodeId: updateReferenceProperties(action) }
    case 'update_site_properties':
      return { nodeId: updateSiteProperties(action) }
    case 'move_target':
      return { nodeId: moveTarget(action) }
    case 'rotate_target':
      return { nodeId: rotateTarget(action) }
    case 'scale_target':
      return { nodeId: scaleTarget(action) }
    case 'duplicate_target':
      return { nodeId: duplicateTarget(action) }
    case 'duplicate_reposition_target':
      return { nodeId: duplicateRepositionTarget(action) }
    case 'delete_target':
      return (() => {
        const deletedNodeId = deleteTarget(action)
        return { nodeId: deletedNodeId, deletedNodeIds: [deletedNodeId] }
      })()
    case 'delete_nodes':
      return { nodeId: deleteNodes(action), deletedNodeIds: [...action.nodeIds] }
    case 'clear_level_contents':
      return { nodeId: clearLevelContents(action) }
    case 'execute_cad_brief': {
      if (!options.runtime?.executeCadBrief) {
        throw new Error('Direct CAD brief execution is not available in this runtime.')
      }
      useEditor.getState().setWorkspace('cad')
      const result = await options.runtime.executeCadBrief(action.brief)
      return {
        nodeId: result.bodyIds?.[0] ?? result.sketchIds?.[0] ?? null,
        bodyIds: result.bodyIds ?? [],
        sketchIds: result.sketchIds ?? [],
      }
    }
    case 'run_cad_prompt': {
      if (!options.runtime?.runCadPrompt) {
        throw new Error('CAD prompt execution is not available in this runtime.')
      }
      useEditor.getState().setWorkspace('cad')
      const result = await options.runtime.runCadPrompt(action.prompt)
      return {
        bodyIds: result.bodyIds ?? [],
        sketchIds: result.sketchIds ?? [],
      }
    }
    case 'generate_mac_part': {
      if (!options.runtime?.generateMacPart) {
        throw new Error('MAC part generation is not available in this runtime.')
      }
      useEditor.getState().setWorkspace('cad')
      try {
        const result = await options.runtime.generateMacPart(action.prompt)
        return {
          bodyIds: result.bodyIds ?? [],
          nodeId: result.bodyIds?.[0] ?? null,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/MAC runtime unavailable/i.test(message)) {
          const parentId = resolveCadSpaceParentId()
          if (!parentId) throw error
          return await executeAction(
            {
              type: 'build_cad_solid',
              name: `CAD: ${action.prompt.slice(0, 48)}`,
              spec: { op: 'box', size: [2, 1.2, 1.5] },
            },
            options,
          )
        }
        throw error
      }
    }
    case 'build_cad_solid': {
      useEditor.getState().setWorkspace('cad')
      const parentId = action.parentId ?? resolveCadSpaceParentId()
      if (!parentId) throw new Error('CAD space is unavailable for local solids.')
      const mesh = evaluateCadSolidSpec(action.spec)
      const body = CadBodyNodeSchema.parse({
        name: action.name ?? 'CAD Solid',
        parentId,
        position: action.position ?? [0, 0, 0],
        regenStatus: 'idle',
        preview: {
          primitive: 'mesh',
          spec: action.spec,
          positions: mesh.positions,
          indices: mesh.indices,
          color: action.color ?? '#60a5fa',
        },
        operations: [],
        operationHistory: [],
        sourceSketchIds: [],
        artifacts: {},
        warnings: [],
        metadata: {
          cadEngine: 'local-kernel',
          volume: mesh.volume,
          bbox: mesh.bbox,
        },
      })
      useScene.getState().createNode(body, parentId as AnyNodeId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      return { bodyIds: [body.id], nodeId: body.id }
    }
    case 'place_cad_body_in_architecture': {
      const nodeId = placeCadBodyInArchitecture(action.bodyId, action.levelId)
      return { nodeId }
    }
    case 'create_default_cad_sketch': {
      const sketch = useCad.getState().createDefaultSketch(action.position)
      if (!sketch) throw new Error(useCad.getState().lastError || 'Unable to create a CAD sketch.')
      return { sketchIds: [sketch.id], nodeId: sketch.id }
    }
    case 'extrude_cad_sketch': {
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) throw new Error('Select or open a CAD sketch before extruding.')
      useEditor.getState().setWorkspace('cad')
      useEditor.getState().setActiveSketchId(sketch.id)
      useViewer.getState().setSelection({ selectedIds: [sketch.id], zoneId: null })
      const bodyId = await useCad.getState().extrudeSelectedSketch({
        depth: action.depth,
        direction: action.direction,
      })
      if (!bodyId) {
        throw new Error(useCad.getState().lastError || 'Unable to extrude the CAD sketch.')
      }
      return { sketchIds: [sketch.id], bodyIds: [bodyId], nodeId: bodyId }
    }
    case 'revolve_cad_sketch': {
      const sketch = getCadSketchById(action.sketchId)
      if (!sketch) throw new Error('Select or open a CAD sketch before revolving.')
      useEditor.getState().setWorkspace('cad')
      useEditor.getState().setActiveSketchId(sketch.id)
      useViewer.getState().setSelection({ selectedIds: [sketch.id], zoneId: null })
      const bodyId = await useCad.getState().revolveSelectedSketch({
        angle: action.angle,
        axis: action.axis,
        customAxis: action.customAxis,
      })
      if (!bodyId) {
        throw new Error(useCad.getState().lastError || 'Unable to revolve the CAD sketch.')
      }
      return { sketchIds: [sketch.id], bodyIds: [bodyId], nodeId: bodyId }
    }
    case 'regenerate_cad_body': {
      const body = resolveCadBody(action.bodyId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      await useCad.getState().regenerateSelectedBody(
        typeof action.depth === 'number' ? { depth: action.depth } : undefined,
      )
      if (useCad.getState().lastError) {
        throw new Error(useCad.getState().lastError || 'Unable to regenerate the CAD body.')
      }
      return { bodyIds: [body.id], nodeId: body.id }
    }
    case 'retry_cad_body': {
      const body = resolveCadBody(action.bodyId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      await useCad.getState().retrySelectedBody()
      if (useCad.getState().lastError) {
        throw new Error(useCad.getState().lastError || 'Unable to retry the CAD body regeneration.')
      }
      return { bodyIds: [body.id], nodeId: body.id }
    }
    case 'set_cad_body_operation_suppressed': {
      const body = resolveCadBody(action.bodyId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      const ok = await useCad
        .getState()
        .setOperationSuppressed(body.id, action.operationId, action.suppressed)
      if (!ok) {
        throw new Error(useCad.getState().lastError || 'Unable to update CAD operation suppression.')
      }
      return { bodyIds: [body.id], nodeId: body.id }
    }
    case 'apply_cad_boolean': {
      const selectedBodies =
        action.targetBodyId && action.toolBodyId
          ? [action.targetBodyId, action.toolBodyId]
          : useViewer
              .getState()
              .selection.selectedIds.filter(
                (nodeId) => useScene.getState().nodes[nodeId as AnyNodeId]?.type === 'cad-body',
              )
      if (selectedBodies.length !== 2) {
        throw new Error('Select exactly two CAD bodies before applying a Boolean operation.')
      }
      useViewer.getState().setSelection({ selectedIds: selectedBodies, zoneId: null })
      const bodyId = await useCad.getState().applyBooleanToSelection({
        operation: action.operation,
      })
      if (!bodyId) {
        throw new Error(useCad.getState().lastError || 'Unable to apply the CAD Boolean operation.')
      }
      return { bodyIds: [bodyId], nodeId: bodyId }
    }
    case 'apply_cad_fillet': {
      const body = resolveCadBody(action.bodyId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      const bodyId = await useCad.getState().applyFilletToSelection({
        edgeRefs: action.edgeRefs,
        radius: action.radius,
      })
      if (!bodyId) {
        throw new Error(useCad.getState().lastError || 'Unable to apply the CAD fillet.')
      }
      return { bodyIds: [bodyId], nodeId: bodyId }
    }
    case 'apply_cad_chamfer': {
      const body = resolveCadBody(action.bodyId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      const bodyId = await useCad.getState().applyChamferToSelection({
        edgeRefs: action.edgeRefs,
        distance: action.distance,
      })
      if (!bodyId) {
        throw new Error(useCad.getState().lastError || 'Unable to apply the CAD chamfer.')
      }
      return { bodyIds: [bodyId], nodeId: bodyId }
    }
    case 'add_cad_box_ears': {
      const bodyIds = buildBoxEarBodies(action.bodyId)
      return { bodyIds, nodeId: bodyIds[0] }
    }
    case 'extrude_cad_body_face': {
      const bodyIds = buildBoxFaceExtrusionBodies(action.bodyId, action.face, action.distance)
      return { bodyIds, nodeId: bodyIds[0] }
    }
    case 'shell_cad_body': {
      const bodyIds = buildShellCadBody(action.bodyId, action.thickness)
      return { bodyIds, nodeId: bodyIds[0] }
    }
    case 'export_cad_body_step': {
      const body = resolveCadBody(action.bodyId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      await useCad.getState().exportSelectedBodyStep()
      if (useCad.getState().lastError) {
        throw new Error(useCad.getState().lastError || 'Unable to export the CAD body.')
      }
      return { bodyIds: [body.id], nodeId: body.id }
    }
    case 'create_site': {
      const siteId = createSite(action)
      return { nodeId: siteId }
    }
    case 'create_building': {
      const buildingId = createBuilding(action)
      return { nodeId: buildingId }
    }
    case 'focus_camera_on_nodes': {
      const targetId = focusCameraOnNodes(action)
      return { nodeId: targetId ?? undefined }
    }
    case 'add_cad_sketch_entities': {
      const sketchId = addCadSketchEntities(action)
      return { sketchIds: [sketchId], nodeId: sketchId }
    }
    case 'set_cad_sketch_plane': {
      const sketchId = setCadSketchPlane(action)
      return { sketchIds: [sketchId], nodeId: sketchId }
    }
    case 'reparent_node': {
      const nodeId = reparentNode(action)
      return { nodeId }
    }
    case 'set_node_metadata': {
      const nodeId = setNodeMetadata(action)
      return { nodeId }
    }
    default:
      return {}
  }
}

export const executeAssistantPlan = async (
  actionsInput: unknown,
  options: AssistantExecutionOptions = {},
): Promise<AssistantExecutionResult> => {
  const validation = validateAssistantPlan(actionsInput, { maxActions: options.maxActions })
  if (!validation.valid) {
    return buildExecutionResult(validation, {
      errors: validation.errors,
      failureKind: 'plan-validation',
    })
  }

  if (validation.requiresReview && !options.reviewConfirmed) {
    return buildExecutionResult(validation, {
      errors: ['This plan changes the scene and must be reviewed before execution.'],
      failureKind: 'plan-validation',
    })
  }

  const snapshot = validation.requiresReview ? cloneSceneGraph() : null
  const createdNodeIds: string[] = []
  const bodyIds: string[] = []
  const sketchIds: string[] = []
  const warnings: string[] = []
  const deletedNodeIds = new Set<string>()
  let completedActionCount = 0
  let snapshotRestored = false
  let failedActionIndex: number | null = null

  // Forward-reference map: $ref_N → actual node ID created during execution.
  const refMap = new Map<string, string>()

  try {
    for (let index = 0; index < validation.actions.length; index += 1) {
      let action = validation.actions[index]
      if (!action) continue

      // Resolve any $ref_N placeholders from earlier actions.
      if (refMap.size > 0) {
        action = resolveRefsInAction(action, refMap)
      }

      const preparedAction = prepareAssistantActionForExecution(action, deletedNodeIds)
      if (!preparedAction.action) {
        if (validation.requiresReview) {
          failedActionIndex = index
          const errorMessage =
            preparedAction.skippedMessage ||
            `Action ${index + 1} could not be prepared for reviewed execution.`
          notifyStatus(options, {
            index,
            action,
            status: 'failed',
            message: errorMessage,
          })
          if (snapshot && completedActionCount > 0) {
            applySceneGraphToEditor(snapshot)
            snapshotRestored = true
            return buildExecutionResult(validation, {
              errors: [errorMessage],
              failureKind: 'execution-rolled-back',
              failedActionIndex,
              completedActionCount,
              snapshotRestored,
            })
          }
          return buildExecutionResult(validation, {
            errors: [errorMessage],
            failureKind: 'plan-validation',
            failedActionIndex,
          })
        }

        completedActionCount += 1
        warnings.push(preparedAction.skippedMessage)
        notifyStatus(options, {
          index,
          action,
          status: 'completed',
          message: preparedAction.skippedMessage,
        })
        continue
      }

      action = preparedAction.action
      if (preparedAction.skippedMessage) {
        if (validation.requiresReview) {
          failedActionIndex = index
          const errorMessage = `Action ${index + 1}: ${preparedAction.skippedMessage}`
          notifyStatus(options, {
            index,
            action,
            status: 'failed',
            message: errorMessage,
          })
          if (snapshot && completedActionCount > 0) {
            applySceneGraphToEditor(snapshot)
            snapshotRestored = true
            return buildExecutionResult(validation, {
              errors: [errorMessage],
              failureKind: 'execution-rolled-back',
              failedActionIndex,
              completedActionCount,
              snapshotRestored,
            })
          }
          return buildExecutionResult(validation, {
            errors: [errorMessage],
            failureKind: 'plan-validation',
            failedActionIndex,
          })
        }

        warnings.push(preparedAction.skippedMessage)
      }

      notifyStatus(options, { index, action, status: 'started', message: `Running ${action.type}...` })

      try {
        const result = await executeAction(action, options)

        // If this action declared a refId AND produced a node, register the mapping.
        const refId = validation.actionRefIds.get(index)
        if (refId && result.nodeId) {
          refMap.set(refId, result.nodeId)
        }

        if (result.nodeId) createdNodeIds.push(result.nodeId)
        if (result.bodyIds) bodyIds.push(...result.bodyIds)
        if (result.sketchIds) sketchIds.push(...result.sketchIds)
        if (result.deletedNodeIds) {
          for (const nodeId of result.deletedNodeIds) {
            deletedNodeIds.add(nodeId)
          }
        }
        completedActionCount += 1
        notifyStatus(options, {
          index,
          action,
          status: 'completed',
          message: preparedAction.skippedMessage ?? `${action.type} completed.`,
        })
      } catch (actionError) {
        const actionMessage = actionError instanceof Error ? actionError.message : `${action.type} failed.`
        failedActionIndex = index
        if (validation.requiresReview) {
          if (snapshot) {
            applySceneGraphToEditor(snapshot)
            snapshotRestored = true
          }
          notifyStatus(options, {
            index,
            action,
            status: 'failed',
            message: actionMessage,
          })
          return buildExecutionResult(validation, {
            errors: [`Action ${index + 1}: ${actionMessage}`],
            failureKind: 'execution-rolled-back',
            failedActionIndex,
            completedActionCount,
            snapshotRestored,
          })
        }

        warnings.push(`Action ${index + 1}: ${actionMessage}`)
        completedActionCount += 1
        notifyStatus(options, {
          index,
          action,
          status: 'completed',
          message: `Skipped: ${actionMessage}`,
        })
      }
    }

    return {
      ok: true,
      errors: [],
      warnings,
      failureKind: null,
      failedActionIndex: null,
      resolvedForwardRefs: Object.fromEntries(refMap),
      completedActionCount,
      requiresReview: validation.requiresReview,
      destructiveActionCount: validation.destructiveActionCount,
      snapshotRestored,
      createdNodeIds,
      bodyIds,
      sketchIds,
    }
  } catch (error) {
    if (snapshot) {
      applySceneGraphToEditor(snapshot)
      snapshotRestored = true
    }

    const failedAction = validation.actions[failedActionIndex ?? completedActionCount]
    if (failedAction) {
      notifyStatus(options, {
        index: failedActionIndex ?? completedActionCount,
        action: failedAction,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Assistant execution failed.',
      })
    }

    return buildExecutionResult(validation, {
      errors: [error instanceof Error ? error.message : 'Assistant execution failed.'],
      warnings,
      failureKind: validation.requiresReview ? 'execution-rolled-back' : 'plan-validation',
      failedActionIndex: failedActionIndex ?? completedActionCount,
      completedActionCount,
      snapshotRestored,
    })
  }
}
