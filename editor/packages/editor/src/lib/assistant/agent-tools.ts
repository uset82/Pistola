'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type CadBodyNode,
  type ItemNode,
  type WallNode,
  getScaledDimensions,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../store/use-editor'
import useCad from '../../store/use-cad'
import { listAssistantCatalogItems, findCatalogItem } from './catalog'
import { summarizeAssistantNode, type AssistantNodeSummary } from './context'
import { getAllCapabilities, getCapabilitiesByDomain } from './capabilities/registry'
import type { CapabilityDomain } from './capabilities/types'
import {
  executeAssistantPlan,
  validateAssistantPlan,
  type AssistantExecutionResult,
  type AssistantPlanValidationResult,
} from './execute'
import { listCreationRecipes } from './recipes/creation-recipes'

export type InspectSceneParams = {
  levelId?: string
  type?: string
  nameQuery?: string
  limit?: number
  offset?: number
}

export type InspectSceneResult = {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  nodes: AssistantNodeSummary[]
}

export function inspectScene(params: InspectSceneParams = {}): InspectSceneResult {
  const nodes = useScene.getState().nodes
  const allNodes = Object.values(nodes).filter((node): node is AnyNode => Boolean(node))

  const filtered = allNodes.filter((node) => {
    if (params.levelId) {
      if (node.id === params.levelId) return true
      if (node.parentId !== params.levelId) return false
    }
    if (params.type && node.type !== params.type) {
      return false
    }
    if (params.nameQuery) {
      const q = params.nameQuery.toLowerCase()
      const name = (node.name ?? '').toLowerCase()
      const id = node.id.toLowerCase()
      if (!name.includes(q) && !id.includes(q)) return false
    }
    return true
  })

  const limit = Math.max(1, Math.min(params.limit ?? 25, 100))
  const offset = Math.max(0, params.offset ?? 0)
  const paged = filtered.slice(offset, offset + limit)

  return {
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + limit < filtered.length,
    nodes: paged.map(summarizeAssistantNode),
  }
}

export type GetNodesParams = {
  nodeIds: string[]
}

export type GetNodesResult = {
  nodes: Record<string, AssistantNodeSummary | null>
}

export function getNodes(params: GetNodesParams): GetNodesResult {
  const sceneNodes = useScene.getState().nodes
  const result: Record<string, AssistantNodeSummary | null> = {}

  for (const id of params.nodeIds) {
    const node = sceneNodes[id as AnyNodeId]
    result[id] = node ? summarizeAssistantNode(node) : null
  }

  return { nodes: result }
}

export type MeasureMode = 'distance' | 'bounds' | 'wall_length' | 'zone_area' | 'free_floor_space'

export type MeasureParams = {
  mode: MeasureMode
  nodeIds?: string[]
  pointA?: [number, number, number]
  pointB?: [number, number, number]
}

export type NodeBounds = {
  min: [number, number, number]
  max: [number, number, number]
  size: [number, number, number]
  center: [number, number, number]
}

export function calculatePolygonArea(points: Array<[number, number]>): number {
  if (!points || points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const p1 = points[i]
    const p2 = points[j]
    if (p1 && p2) {
      area += p1[0] * p2[1] - p2[0] * p1[1]
    }
  }
  return Math.abs(area) / 2
}

export function calculatePolygonPerimeter(points: Array<[number, number]>): number {
  if (!points || points.length < 2) return 0
  let perimeter = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const p1 = points[i]
    const p2 = points[j]
    if (p1 && p2) {
      perimeter += Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    }
  }
  return perimeter
}

export function getNodeBounds(node: AnyNode): NodeBounds | null {
  if (node.type === 'item') {
    const item = node as ItemNode
    const pos = item.position ?? [0, 0, 0]
    const [w, h, d] = getScaledDimensions(item)
    return {
      min: [pos[0] - w / 2, pos[1], pos[2] - d / 2],
      max: [pos[0] + w / 2, pos[1] + h, pos[2] + d / 2],
      size: [w, h, d],
      center: [pos[0], pos[1] + h / 2, pos[2]],
    }
  }

  if (node.type === 'wall') {
    const wall = node as WallNode
    const minX = Math.min(wall.start[0], wall.end[0])
    const maxX = Math.max(wall.start[0], wall.end[0])
    const minZ = Math.min(wall.start[1], wall.end[1])
    const maxZ = Math.max(wall.start[1], wall.end[1])
    const height = wall.height ?? 2.5
    const thickness = wall.thickness ?? 0.15
    return {
      min: [minX - thickness / 2, 0, minZ - thickness / 2],
      max: [maxX + thickness / 2, height, maxZ + thickness / 2],
      size: [maxX - minX + thickness, height, maxZ - minZ + thickness],
      center: [(minX + maxX) / 2, height / 2, (minZ + maxZ) / 2],
    }
  }

  if (node.type === 'cad-body') {
    const body = node as CadBodyNode
    const position = body.position ?? [0, 0, 0]
    const metadata = (body.metadata ?? {}) as {
      bbox?: { min?: [number, number, number]; max?: [number, number, number] }
    }
    const bbox = metadata.bbox
    if (
      Array.isArray(bbox?.min) &&
      bbox.min.length === 3 &&
      Array.isArray(bbox?.max) &&
      bbox.max.length === 3
    ) {
      const min: [number, number, number] = [
        bbox.min[0] + position[0],
        bbox.min[1] + position[1],
        bbox.min[2] + position[2],
      ]
      const max: [number, number, number] = [
        bbox.max[0] + position[0],
        bbox.max[1] + position[1],
        bbox.max[2] + position[2],
      ]
      return {
        min,
        max,
        size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      }
    }

    if (body.preview?.primitive === 'box') {
      const [width, height, depth] = body.preview.dimensions
      return {
        min: [position[0] - width / 2, position[1], position[2] - depth / 2],
        max: [position[0] + width / 2, position[1] + height, position[2] + depth / 2],
        size: [width, height, depth],
        center: [position[0], position[1] + height / 2, position[2]],
      }
    }
  }

  if (node.type === 'zone' || node.type === 'slab') {
    const polygon: Array<[number, number]> = (node as any).polygon ?? []
    if (polygon.length === 0) return null
    const xs = polygon.map((p) => p[0])
    const zs = polygon.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    const y = typeof (node as any).elevation === 'number' ? (node as any).elevation : 0
    return {
      min: [minX, y, minZ],
      max: [maxX, y + 0.2, maxZ],
      size: [maxX - minX, 0.2, maxZ - minZ],
      center: [(minX + maxX) / 2, y + 0.1, (minZ + maxZ) / 2],
    }
  }

  return null
}

export type MeasureResult =
  | { mode: 'distance'; distance: number; pointA: [number, number, number]; pointB: [number, number, number] }
  | { mode: 'bounds'; bounds: Record<string, NodeBounds | null> }
  | { mode: 'wall_length'; walls: Record<string, { length: number; height: number; thickness: number; start: [number, number]; end: [number, number] }> }
  | { mode: 'zone_area'; zones: Record<string, { areaM2: number; perimeterM: number; pointCount: number }> }
  | { mode: 'free_floor_space'; zoneId: string; totalAreaM2: number; occupiedAreaM2: number; freeAreaM2: number; percentFree: number }
  | { mode: 'error'; message: string }

export function measure(params: MeasureParams): MeasureResult {
  const sceneNodes = useScene.getState().nodes

  switch (params.mode) {
    case 'distance': {
      let pA = params.pointA
      let pB = params.pointB

      if ((!pA || !pB) && params.nodeIds && params.nodeIds.length >= 2) {
        const nodeA = sceneNodes[params.nodeIds[0] as AnyNodeId]
        const nodeB = sceneNodes[params.nodeIds[1] as AnyNodeId]
        if (nodeA && nodeB) {
          const bA = getNodeBounds(nodeA)
          const bB = getNodeBounds(nodeB)
          if (bA && bB) {
            pA = bA.center
            pB = bB.center
          }
        }
      }

      if (!pA || !pB) {
        return { mode: 'error', message: 'Distance measurement requires pointA and pointB, or two valid nodeIds.' }
      }

      const distance = Math.hypot(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2])
      return { mode: 'distance', distance: Math.round(distance * 1000) / 1000, pointA: pA, pointB: pB }
    }

    case 'bounds': {
      const boundsMap: Record<string, NodeBounds | null> = {}
      const targetIds = params.nodeIds ?? []
      for (const id of targetIds) {
        const node = sceneNodes[id as AnyNodeId]
        boundsMap[id] = node ? getNodeBounds(node) : null
      }
      return { mode: 'bounds', bounds: boundsMap }
    }

    case 'wall_length': {
      const wallsMap: Record<string, { length: number; height: number; thickness: number; start: [number, number]; end: [number, number] }> = {}
      const targetIds = params.nodeIds ?? []
      for (const id of targetIds) {
        const node = sceneNodes[id as AnyNodeId]
        if (node?.type === 'wall') {
          const wall = node as WallNode
          const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
          wallsMap[id] = {
            length: Math.round(len * 1000) / 1000,
            height: wall.height ?? 2.5,
            thickness: wall.thickness ?? 0.15,
            start: wall.start,
            end: wall.end,
          }
        }
      }
      return { mode: 'wall_length', walls: wallsMap }
    }

    case 'zone_area': {
      const zonesMap: Record<string, { areaM2: number; perimeterM: number; pointCount: number }> = {}
      const targetIds = params.nodeIds ?? []
      for (const id of targetIds) {
        const node = sceneNodes[id as AnyNodeId]
        if (node?.type === 'zone' || node?.type === 'slab') {
          const poly: Array<[number, number]> = (node as any).polygon ?? []
          zonesMap[id] = {
            areaM2: Math.round(calculatePolygonArea(poly) * 100) / 100,
            perimeterM: Math.round(calculatePolygonPerimeter(poly) * 100) / 100,
            pointCount: poly.length,
          }
        }
      }
      return { mode: 'zone_area', zones: zonesMap }
    }

    case 'free_floor_space': {
      const zoneId = params.nodeIds?.[0]
      if (!zoneId) {
        return { mode: 'error', message: 'free_floor_space requires a zoneId in nodeIds.' }
      }
      const zone = sceneNodes[zoneId as AnyNodeId]
      if (!zone || (zone.type !== 'zone' && zone.type !== 'slab')) {
        return { mode: 'error', message: `Node "${zoneId}" is not a zone or slab.` }
      }

      const poly: Array<[number, number]> = (zone as any).polygon ?? []
      const totalArea = calculatePolygonArea(poly)

      // Find items placed inside this zone or having parentId = zoneId
      let occupiedArea = 0
      for (const node of Object.values(sceneNodes)) {
        if (node?.type === 'item') {
          const item = node as ItemNode
          if (item.parentId === zoneId) {
            const [w, , d] = getScaledDimensions(item)
            occupiedArea += w * d
          }
        }
      }

      const freeArea = Math.max(0, totalArea - occupiedArea)
      const percentFree = totalArea > 0 ? Math.round((freeArea / totalArea) * 100) : 0

      return {
        mode: 'free_floor_space',
        zoneId,
        totalAreaM2: Math.round(totalArea * 100) / 100,
        occupiedAreaM2: Math.round(occupiedArea * 100) / 100,
        freeAreaM2: Math.round(freeArea * 100) / 100,
        percentFree,
      }
    }

    default:
      return { mode: 'error', message: `Unknown measurement mode "${params.mode}".` }
  }
}

export type SearchCatalogParams = {
  query: string
  category?: string
  limit?: number
}

export function searchCatalog(params: SearchCatalogParams) {
  const items = listAssistantCatalogItems()
  const q = params.query.toLowerCase()
  const categoryFilter = params.category?.toLowerCase()

  const matched = items.filter((item) => {
    if (categoryFilter && item.category.toLowerCase() !== categoryFilter) {
      return false
    }
    if (!q) return true
    return (
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  })

  const limit = Math.max(1, Math.min(params.limit ?? 20, 50))
  return {
    total: matched.length,
    items: matched.slice(0, limit),
  }
}

export type ListCapabilitiesParams = {
  domain?: CapabilityDomain
}

export function listCapabilities(params: ListCapabilitiesParams = {}) {
  const caps = params.domain ? getCapabilitiesByDomain(params.domain) : getAllCapabilities()
  return {
    total: caps.length,
    capabilities: caps.map((c) => ({
      type: c.type,
      domain: c.domain,
      safeImmediate: c.safeImmediate,
      destructive: c.destructive,
      describe: c.describe,
      examples: c.examples,
    })),
  }
}

export function getWorkspaceState() {
  const editorState = useEditor.getState()
  const viewerState = useViewer.getState()
  const cadState = useCad.getState()

  return {
    phase: editorState.phase,
    mode: editorState.mode,
    activeTool: editorState.tool,
    structureLayer: editorState.structureLayer,
    cameraMode: viewerState.cameraMode,
    selection: {
      buildingId: viewerState.selection.buildingId,
      levelId: viewerState.selection.levelId,
      zoneId: viewerState.selection.zoneId,
      selectedIds: viewerState.selection.selectedIds,
    },
    cad: {
      activeWorkplane: editorState.activeWorkplane,
      activeSketchId: editorState.activeSketchId,
      helperStatus: cadState.helperStatus,
      lastError: cadState.lastError,
    },
  }
}

export async function validateActions(params: { actions: unknown }): Promise<AssistantPlanValidationResult> {
  return validateAssistantPlan(params.actions)
}

export async function executeActions(params: {
  actions: unknown
  reviewConfirmed?: boolean
}): Promise<AssistantExecutionResult> {
  return executeAssistantPlan(params.actions, {
    reviewConfirmed: params.reviewConfirmed,
  })
}

export type AgentToolName =
  | 'inspect_scene'
  | 'get_nodes'
  | 'measure'
  | 'search_catalog'
  | 'list_capabilities'
  | 'list_recipes'
  | 'get_workspace_state'
  | 'validate_actions'
  | 'execute_actions'
  | 'ask_user'
  | 'finish'

export async function executeAgentTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'inspect_scene':
      return inspectScene(args as InspectSceneParams)
    case 'get_nodes':
      return getNodes(args as GetNodesParams)
    case 'measure':
      return measure(args as MeasureParams)
    case 'search_catalog':
      return searchCatalog(args as SearchCatalogParams)
    case 'list_capabilities':
      return listCapabilities(args as ListCapabilitiesParams)
    case 'list_recipes':
      return listCreationRecipes()
    case 'get_workspace_state':
      return getWorkspaceState()
    case 'validate_actions':
      return validateActions({ actions: args.actions })
    case 'execute_actions':
      return executeActions({
        actions: args.actions,
        reviewConfirmed: Boolean(args.reviewConfirmed),
      })
    case 'ask_user':
      return { status: 'asked', question: args.question }
    case 'finish':
      return { status: 'finished', reply: args.reply, assumptions: args.assumptions ?? [] }
    default:
      throw new Error(`Unknown agent tool: ${name}`)
  }
}
