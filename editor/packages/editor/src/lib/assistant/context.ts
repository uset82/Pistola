'use client'

import type { AnyNode, AnyNodeId } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useCad from '../../store/use-cad'
import useEditor from '../../store/use-editor'
import { listAssistantCatalogItems } from './catalog'

export type AssistantNodeSummary = Record<string, unknown>

export type AssistantWorkspaceContext = {
  phase: string
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
        transform: node.transform,
        regenStatus: node.regenStatus,
        sourceSketchIds: node.sourceSketchIds,
        operationKinds: operations.map((operation) => operation.kind),
        operations: operations.map((operation) => ({
          id: operation.id,
          kind: operation.kind,
          suppressed: operation.suppressed,
        })),
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
