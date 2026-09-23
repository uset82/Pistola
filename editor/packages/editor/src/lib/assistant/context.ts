'use client'

import {
  getCadBodyTransform,
  meshBounds,
  transformMesh,
  useScene,
  type AnyNode,
  type AnyNodeId,
  type CadBodyNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useCad from '../../store/use-cad'
import useEditor from '../../store/use-editor'
import { listAssistantCatalogItems } from './catalog'

export type AssistantNodeSummary = Record<string, unknown>

export type AssistantWorkspaceContext = {
  phase: string
  workspace: 'architecture' | 'cad'
  mode: string
  tool: string | null
  structureLayer: string
  selection: {
    buildingId: string | null
    levelId: string | null
    zoneId: string | null
    selectedIds: string[]
  }
  selectedNodeSummary: AssistantNodeSummary[]
  levelSummary: AssistantNodeSummary | null
  buildingSummary: AssistantNodeSummary | null
  sceneSummary: AssistantNodeSummary[]
  catalog: ReturnType<typeof listAssistantCatalogItems>
  cad: {
    helperStatus: string
    lastError: string | null
    activeSketchId: string | null
  }
}

const walkBoundsThroughParents = (
  node: AnyNode,
  bounds: { min: [number, number, number]; max: [number, number, number] },
) => {
  let min: [number, number, number] = [...bounds.min]
  let max: [number, number, number] = [...bounds.max]
  let parentId = node.parentId
  const nodes = useScene.getState().nodes
  while (parentId) {
    const parent = nodes[parentId as AnyNodeId]
    if (!parent) break
    const position = 'position' in parent && Array.isArray(parent.position) ? parent.position : [0, 0, 0]
    const scale = 'scale' in parent && Array.isArray(parent.scale) ? parent.scale : [1, 1, 1]
    const [positionX = 0, positionY = 0, positionZ = 0] = position
    const [scaleX = 1, scaleY = 1, scaleZ = 1] = scale
    min = [positionX + min[0] * scaleX, positionY + min[1] * scaleY, positionZ + min[2] * scaleZ]
    max = [positionX + max[0] * scaleX, positionY + max[1] * scaleY, positionZ + max[2] * scaleZ]
    parentId = parent.parentId
  }
  const nextMin: [number, number, number] = [Math.min(min[0], max[0]), Math.min(min[1], max[1]), Math.min(min[2], max[2])]
  const nextMax: [number, number, number] = [Math.max(min[0], max[0]), Math.max(min[1], max[1]), Math.max(min[2], max[2])]
  return {
    min: nextMin,
    max: nextMax,
    size: [nextMax[0] - nextMin[0], nextMax[1] - nextMin[1], nextMax[2] - nextMin[2]] as [number, number, number],
  }
}

export const describeCadBody = (node: CadBodyNode) => {
  const preview = node.preview
  const mesh = preview.primitive === 'mesh' ? preview : null
  const metadata = (node.metadata ?? {}) as { partId?: unknown; role?: unknown }
  const spec = mesh && mesh.spec && typeof mesh.spec === 'object' ? mesh.spec : null
  let bbox: ReturnType<typeof walkBoundsThroughParents> | null = null
  if (mesh && mesh.positions.length > 0) {
    const transform = getCadBodyTransform(node)
    const world = transformMesh(
      { positions: mesh.positions, indices: mesh.indices },
      transform.position,
      transform.scale,
      transform.rotation,
    )
    const measured = meshBounds(world.positions)
    bbox = walkBoundsThroughParents(node, { min: measured.min, max: measured.max })
  }
  return {
    partId: typeof metadata.partId === 'string' ? metadata.partId : null,
    role: typeof metadata.role === 'string' ? metadata.role : null,
    bbox,
    color: 'color' in preview ? preview.color : null,
    opacity: typeof node.opacity === 'number' ? node.opacity : mesh && typeof mesh.opacity === 'number' ? mesh.opacity : 1,
    triangles: mesh ? Math.floor(mesh.indices.length / 3) : 0,
    spec,
  }
}

export const summarizeAssistantNode = (node: AnyNode): AssistantNodeSummary => {
  switch (node.type) {
    case 'site':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        polygon: node.polygon.points,
        childIds: node.children.map((child) => (typeof child === 'string' ? child : child.id)),
      }
    case 'building':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        childIds: node.children,
      }
    case 'level':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        level: node.level,
        childIds: node.children,
      }
    case 'wall':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        start: node.start,
        end: node.end,
        height: node.height ?? 2.5,
        thickness: node.thickness ?? 0.15,
        childIds: node.children,
      }
    case 'zone':
      return {
        id: node.id,
        type: node.type,
        name: node.name,
        parentId: node.parentId,
        polygon: node.polygon,
        color: node.color,
      }
    case 'slab':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        polygon: node.polygon,
        holes: node.holes,
        elevation: node.elevation,
      }
    case 'ceiling':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        polygon: node.polygon,
        holes: node.holes,
        height: node.height,
        childIds: node.children,
      }
    case 'roof':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        position: node.position,
        rotation: node.rotation,
        length: node.length ?? null,
        height: node.height ?? null,
        leftWidth: node.leftWidth ?? null,
        rightWidth: node.rightWidth ?? null,
        childIds: node.children,
      }
    case 'item':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? node.asset.name,
        parentId: node.parentId,
        position: node.position,
        rotation: node.rotation,
        scale: node.scale,
        side: node.side ?? null,
        asset: {
          id: node.asset.id,
          name: node.asset.name,
          category: node.asset.category,
          attachTo: node.asset.attachTo ?? null,
          dimensions: node.asset.dimensions,
        },
      }
    case 'door':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        wallId: node.wallId ?? node.parentId,
        position: node.position,
        width: node.width,
        height: node.height,
        side: node.side ?? null,
      }
    case 'window':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        wallId: node.wallId ?? node.parentId,
        position: node.position,
        width: node.width,
        height: node.height,
        side: node.side ?? null,
      }
    case 'cad-sketch':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        plane: node.plane,
        position: node.position,
        editStatus: node.editStatus,
        entityCount: node.entities.length,
        closedProfileEntityIds: node.closedProfileEntityIds,
      }
    case 'cad-body': {
      const operations = node.operationHistory.length > 0 ? node.operationHistory : node.operations
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        transform: getCadBodyTransform(node),
        regenStatus: node.regenStatus,
        sourceSketchIds: node.sourceSketchIds,
        operationKinds: operations.map((operation) => operation.kind),
        operations: operations.map((operation) => ({
          id: operation.id,
          kind: operation.kind,
          suppressed: operation.suppressed,
        })),
        ...describeCadBody(node),
      }
    }
    default:
      return {
        id: node.id,
        type: node.type,
        name: 'name' in node ? (node.name ?? null) : null,
        parentId: node.parentId,
      }
  }
}

const getNode = (nodes: Record<string, AnyNode>, nodeId: string | null | undefined) =>
  nodeId ? (nodes[nodeId as AnyNodeId] as AnyNode | undefined) ?? null : null

const getSceneSummary = (
  nodes: Record<string, AnyNode>,
  levelId: string | null,
  selectedIds: string[],
  zoneId: string | null,
) => {
  const importantIds = new Set<string>(selectedIds)
  if (zoneId) importantIds.add(zoneId)
  if (levelId) importantIds.add(levelId)

  const levelNode = getNode(nodes, levelId)
  if (levelNode?.type === 'level') {
    for (const childId of levelNode.children) {
      importantIds.add(childId)
    }
  }

  return Array.from(importantIds)
    .map((id) => getNode(nodes, id))
    .filter((node): node is AnyNode => Boolean(node))
    .map((node) => summarizeAssistantNode(node))
}

export const getAssistantWorkspaceContext = (): AssistantWorkspaceContext => {
  const editor = useEditor.getState()
  const viewer = useViewer.getState()
  const cad = useCad.getState()
  const nodes = useScene.getState().nodes
  const { selectedIds, zoneId, buildingId, levelId } = viewer.selection

  return {
    phase: editor.phase,
    workspace: editor.workspace,
    mode: editor.mode,
    tool: editor.tool,
    structureLayer: editor.structureLayer,
    selection: {
      buildingId,
      levelId,
      zoneId,
      selectedIds: [...selectedIds],
    },
    selectedNodeSummary: selectedIds
      .map((id) => getNode(nodes, id))
      .filter((node): node is AnyNode => Boolean(node))
      .map((node) => summarizeAssistantNode(node)),
    levelSummary: (() => {
      const level = getNode(nodes, levelId)
      return level?.type === 'level' ? summarizeAssistantNode(level) : null
    })(),
    buildingSummary: (() => {
      const building = getNode(nodes, buildingId)
      return building?.type === 'building' ? summarizeAssistantNode(building) : null
    })(),
    sceneSummary: getSceneSummary(nodes, levelId, selectedIds, zoneId),
    catalog: listAssistantCatalogItems(),
    cad: {
      helperStatus: cad.helperStatus,
      lastError: cad.lastError,
      activeSketchId: editor.activeSketchId,
    },
  }
}
