'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type AssetInput,
  BuildingNode,
  type CadBodyNode,
  CadSketchEntity,
  type CadSketchNode,
  CeilingNode,
  DoorNode,
  emitter,
  generateId,
  type GuideNode,
  ItemNode,
  LevelNode,
  RoofNode,
  type ScanNode,
  SiteNode,
  SlabNode,
  WallNode,
  WindowNode,
  ZoneNode,
  getCadBodyTransform,
  pointInPolygon,
  spatialGridManager,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { clampToWall as clampDoorToWall, hasWallChildOverlap as doorOverlap } from '../../components/tools/door/door-math'
import {
  calculateItemRotation,
} from '../../components/tools/item/placement-math'
import { clampToWall as clampWindowToWall, hasWallChildOverlap as windowOverlap } from '../../components/tools/window/window-math'
import { duplicateTransformTarget } from '../transform-actions'
import { getTransformCapabilities, getTransformTargetNode } from '../transform-target'
import useEditor from '../../store/use-editor'
import { findCatalogItem } from './catalog'
import type { AssistantAction } from './types'

const polygonOffset = 0.5
const roofDefaultHeight = 1.5

const getNodes = () => useScene.getState().nodes

const getNode = <T extends AnyNode = AnyNode>(nodeId: string | null | undefined): T | null => {
  if (!nodeId) return null
  return (getNodes()[nodeId as AnyNodeId] as T | undefined) ?? null
}

const requireNode = <T extends AnyNode = AnyNode>(nodeId: string) => {
  const node = getNode<T>(nodeId)
  if (!node) throw new Error(`Node "${nodeId}" was not found.`)
  return node
}

const getSiteNode = () =>
  useScene
    .getState()
    .rootNodeIds.map((id) => getNode(id))
    .find((node): node is AnyNode => node != null && node.type === 'site') ?? null

const getSelectedNodeId = () => {
  const selection = useViewer.getState().selection
  if (selection.selectedIds.length === 1) return selection.selectedIds[0] ?? null
  if (selection.zoneId) return selection.zoneId
  return null
}

const resolveActionNode = (nodeId?: string) => {
  const resolvedId = nodeId ?? getSelectedNodeId()
  if (!resolvedId) throw new Error('No target node is selected.')
  return requireNode(resolvedId)
}

const getCurrentBuilding = () => {
  const selection = useViewer.getState().selection
  const selectedBuilding = getNode(selection.buildingId)
  if (selectedBuilding?.type === 'building') return selectedBuilding

  const site = getSiteNode()
  if (!site || site.type !== 'site') return null

  const child = site.children.find((entry) => {
    if (typeof entry !== 'string') return entry.type === 'building'
    return getNode(entry)?.type === 'building'
  })

  if (!child) return null
  return typeof child === 'string'
    ? ((getNodes()[child as AnyNodeId] as AnyNode | undefined) ?? null)
    : child
}

const getCurrentLevel = () => {
  const selection = useViewer.getState().selection
  const direct = getNode(selection.levelId)
  if (direct?.type === 'level') return direct

  const building = getCurrentBuilding()
  if (building?.type !== 'building') return null

  return (
    building.children
      .map((id) => getNode(id))
      .find((node): node is AnyNode => node != null && node.type === 'level') ?? null
  )
}

const resolveLevel = (levelId?: string) => {
  const direct = getNode(levelId)
  if (direct?.type === 'level') return direct
  return getCurrentLevel()
}

const resolveBuilding = (buildingId?: string) => {
  const direct = getNode(buildingId)
  if (direct?.type === 'building') return direct
  return getCurrentBuilding()
}

const getBuildingForLevel = (levelId: string) => {
  const level = getNode(levelId)
  if (level?.type !== 'level' || !level.parentId) return null
  const building = getNode(level.parentId)
  return building?.type === 'building' ? building : null
}

const ensurePolygon = (polygon: Array<[number, number]>) => {
  if (polygon.length < 3) {
    throw new Error('Polygon actions require at least three points.')
  }
}

const countByType = (type: AnyNode['type']) =>
  Object.values(getNodes()).filter((node) => node.type === type).length

const getDefaultName = (label: string, type: AnyNode['type']) => `${label} ${countByType(type) + 1}`

const polygonCentroid = (polygon: Array<[number, number]>): [number, number] => {
  let areaAccumulator = 0
  let centroidX = 0
  let centroidY = 0

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    if (!(current && next)) continue

    const cross = current[0] * next[1] - next[0] * current[1]
    areaAccumulator += cross
    centroidX += (current[0] + next[0]) * cross
    centroidY += (current[1] + next[1]) * cross
  }

  const area = areaAccumulator / 2
  if (Math.abs(area) < 1e-6) {
    return [
      polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
      polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
    ]
  }

  return [centroidX / (6 * area), centroidY / (6 * area)]
}

const shiftPolygon = (polygon: Array<[number, number]>) =>
  polygon.map(([x, z]) => [x + polygonOffset, z + polygonOffset] as [number, number])

const getWallLength = (wall: WallNode) => {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  return Math.sqrt(dx * dx + dz * dz)
}

const getWallRotationFromSide = (side: 'front' | 'back') =>
  calculateItemRotation(side === 'front' ? [0, 0, 1] : [0, 0, -1])

const applyDimensionToSketchEntities = (
  sketch: CadSketchNode,
  dimensionId: string,
  value: number,
): CadSketchNode['entities'] => {
  const dimension = sketch.dimensions.find((candidate) => candidate.id === dimensionId)
  if (!dimension) return sketch.entities

  return sketch.entities.map((entity) => {
    if (entity.id !== dimension.entityId) return entity

    if (dimension.kind === 'distance' && entity.kind === 'line') {
      const deltaX = entity.end[0] - entity.start[0]
      const deltaY = entity.end[1] - entity.start[1]
      const length = Math.hypot(deltaX, deltaY) || 1
      const directionX = deltaX / length
      const directionY = deltaY / length

      return {
        ...entity,
        end: [
          Number((entity.start[0] + directionX * value).toFixed(3)),
          Number((entity.start[1] + directionY * value).toFixed(3)),
        ],
      }
    }

    if (dimension.kind === 'radius' && (entity.kind === 'circle' || entity.kind === 'arc')) {
      return {
        ...entity,
        radius: value,
      }
    }

    if (dimension.kind === 'diameter' && entity.kind === 'circle') {
      return {
        ...entity,
        radius: value / 2,
      }
    }

    return entity
  })
}

const ensurePointInsidePolygon = (
  point: [number, number, number],
  polygon: Array<[number, number]>,
  message: string,
) => {
  if (!pointInPolygon(point[0], point[2], polygon)) {
    throw new Error(message)
  }
}

const selectCreatedNode = (nodeId: string, nodeType: AnyNode['type']) => {
  if (nodeType === 'zone') {
    useViewer.getState().setSelection({ zoneId: nodeId as `zone_${string}`, selectedIds: [] })
    return
  }

  useEditor.getState().setSelectedReferenceId(null)
  useViewer.getState().setSelection({ zoneId: null, selectedIds: [nodeId] })
}

export const resolveCadBody = (bodyId?: string): CadBodyNode => {
  const candidate = resolveActionNode(bodyId)
  if (candidate.type !== 'cad-body') {
    throw new Error('Select a CAD body before running this action.')
  }
  return candidate
}

const getCenterPlacement = (
  targetNodeId: string,
): { position: [number, number, number]; parentId: string; levelId: string | null; side?: 'front' | 'back' } => {
  const node = requireNode(targetNodeId)

  if (node.type === 'zone' || node.type === 'slab' || node.type === 'ceiling') {
    const [x, z] = polygonCentroid(node.polygon)
    return {
      position: [x, node.type === 'ceiling' ? -1 : 0, z],
      parentId: node.type === 'ceiling' ? node.id : (node.parentId ?? node.id),
      levelId: node.parentId ?? null,
    }
  }

  if (node.type === 'level') {
    return {
      position: [0, 0, 0],
      parentId: node.id,
      levelId: node.id,
    }
  }

  if (node.type === 'wall') {
    const length = getWallLength(node)
    return {
      position: [length / 2, 1.2, 0],
      parentId: node.id,
      levelId: node.parentId ?? null,
      side: 'front',
    }
  }

  if (node.type === 'site') {
    const [x, z] = polygonCentroid(node.polygon.points)
    return {
      position: [x, 0, z],
      parentId: node.id,
      levelId: null,
    }
  }

  throw new Error(`Node "${targetNodeId}" does not expose a center placement target.`)
}

export const selectLevel = (levelId: string) => {
  const level = requireNode(levelId)
  if (level.type !== 'level') throw new Error(`Node "${levelId}" is not a level.`)
  const building = getBuildingForLevel(level.id)
  useViewer.getState().setSelection({
    buildingId: building?.id ?? null,
    levelId: level.id,
    zoneId: null,
    selectedIds: [],
  })
  return level.id
}

export const selectBuilding = (buildingId: string) => {
  const building = requireNode(buildingId)
  if (building.type !== 'building') throw new Error(`Node "${buildingId}" is not a building.`)
  useViewer.getState().setSelection({ buildingId: building.id })
  return building.id
}

export const resetWorkspaceSelection = () => {
  useViewer.getState().resetSelection()
  useEditor.getState().setSelectedReferenceId(null)
  return null
}

export const selectNodes = (action: Extract<AssistantAction, { type: 'select_nodes' }>) => {
  if (action.zoneId) {
    const zone = requireNode(action.zoneId)
    if (zone.type !== 'zone') throw new Error(`Node "${action.zoneId}" is not a zone.`)
    useViewer.getState().setSelection({
      zoneId: zone.id,
      selectedIds: [],
      levelId: (zone.parentId ?? useViewer.getState().selection.levelId) as `level_${string}` | null | undefined,
    })
    return zone.id
  }

  action.nodeIds.forEach((nodeId) => {
    requireNode(nodeId)
  })
  useViewer.getState().setSelection({ selectedIds: action.nodeIds, zoneId: null })
  return action.nodeIds[0] ?? null
}

export const focusCameraOnNodes = (
  action: Extract<AssistantAction, { type: 'focus_camera_on_nodes' }>,
) => {
  action.nodeIds.forEach((nodeId) => {
    requireNode(nodeId)
  })
  useViewer.getState().setSelection({ selectedIds: action.nodeIds, zoneId: null })
  const firstTarget = action.nodeIds[0] ? getNode(action.nodeIds[0]) : null
  if (firstTarget?.camera) {
    emitter.emit('camera-controls:view', { nodeId: firstTarget.id as AnyNodeId })
  }
  return action.nodeIds[0] ?? null
}

export const createSite = (action: Extract<AssistantAction, { type: 'create_site' }>) => {
  const site = SiteNode.parse({
    name: action.name,
    children: [],
  })
  useScene.getState().createNode(site)
  useViewer.getState().setSelection({
    buildingId: null,
    levelId: null,
    selectedIds: [site.id],
    zoneId: null,
  })
  return site.id
}

export const createBuilding = (action: Extract<AssistantAction, { type: 'create_building' }>) => {
  let site = action.siteId ? getNode(action.siteId) : getSiteNode()
  if (!site || site.type !== 'site') {
    const newSite = SiteNode.parse({ name: 'Site', children: [] })
    useScene.getState().createNode(newSite)
    site = newSite
  }

  const building = BuildingNode.parse({
    name: action.name,
    children: [],
  })

  useScene.getState().createNode(building, site.id as AnyNodeId)
  useViewer.getState().setSelection({
    buildingId: building.id,
    levelId: null,
    selectedIds: [],
    zoneId: null,
  })
  return building.id
}

export const createLevel = (action: Extract<AssistantAction, { type: 'create_level' }>) => {
  const building = resolveBuilding(action.buildingId)
  if (!building || building.type !== 'building') {
    throw new Error('A building must exist before creating a level.')
  }

  const siblingLevels = building.children
    .map((id) => getNode(id))
    .filter((node): node is AnyNode => node != null && node.type === 'level')

  const nextLevelIndex =
    typeof action.level === 'number'
      ? action.level
      : siblingLevels.length === 0
        ? 0
        : Math.max(...siblingLevels.map((node) => (node as LevelNode).level)) + 1

  const level = LevelNode.parse({
    name: action.name,
    level: nextLevelIndex,
    children: [],
  })

  useScene.getState().createNode(level, building.id)
  useViewer.getState().setSelection({
    buildingId: building.id,
    levelId: level.id,
    zoneId: null,
    selectedIds: [],
  })
  return level.id
}

export const renameLevel = (action: Extract<AssistantAction, { type: 'rename_level' }>) => {
  const level = requireNode(action.levelId)
  if (level.type !== 'level') throw new Error(`Node "${action.levelId}" is not a level.`)
  useScene.getState().updateNode(level.id, { name: action.name })
  return level.id
}

export const renameNode = (action: Extract<AssistantAction, { type: 'rename_node' }>) => {
  const node = requireNode(action.nodeId)
  useScene.getState().updateNode(node.id, { name: action.name })
  return node.id
}

export const setNodeVisibility = (
  action: Extract<AssistantAction, { type: 'set_node_visibility' }>,
) => {
  action.nodeIds.forEach((nodeId) => {
    const node = requireNode(nodeId)
    useScene.getState().updateNode(node.id, { visible: action.visible } as Partial<AnyNode>)
  })
  return action.nodeIds[0] ?? null
}

export const updateZoneColor = (
  action: Extract<AssistantAction, { type: 'update_zone_color' }>,
) => {
  const zone = requireNode(action.nodeId)
  if (zone.type !== 'zone') throw new Error(`Node "${action.nodeId}" is not a zone.`)
  useScene.getState().updateNode(zone.id, { color: action.color })
  selectCreatedNode(zone.id, 'zone')
  return zone.id
}

export const updatePolygonNode = (
  action: Extract<AssistantAction, { type: 'update_polygon_node' }>,
) => {
  const node = requireNode(action.nodeId)
  if (node.type === 'site') {
    useScene.getState().updateNode(node.id, {
      polygon: { type: 'polygon', points: action.polygon },
    } as Partial<AnyNode>)
    return node.id
  }
  if (node.type !== 'zone' && node.type !== 'slab' && node.type !== 'ceiling') {
    throw new Error(`Node "${action.nodeId}" does not support polygon updates.`)
  }
  useScene.getState().updateNode(node.id, { polygon: action.polygon } as Partial<AnyNode>)
  return node.id
}

export const updatePolygonHoles = (
  action: Extract<AssistantAction, { type: 'update_polygon_holes' }>,
) => {
  const node = requireNode(action.nodeId)
  if (node.type !== 'slab' && node.type !== 'ceiling') {
    throw new Error(`Node "${action.nodeId}" does not support polygon hole updates.`)
  }
  useScene.getState().updateNode(node.id, { holes: action.holes } as Partial<AnyNode>)
  return node.id
}

export const createWall = (action: Extract<AssistantAction, { type: 'create_wall' }>) => {
  const level = resolveLevel(action.levelId)
  if (!level || level.type !== 'level') throw new Error('A level must be selected before creating a wall.')
  if (action.start[0] === action.end[0] && action.start[1] === action.end[1]) {
    throw new Error('Wall start and end points must be different.')
  }

  const wall = WallNode.parse({
    name: action.name ?? getDefaultName('Wall', 'wall'),
    start: action.start,
    end: action.end,
    ...(typeof action.height === 'number' ? { height: action.height } : {}),
    ...(typeof action.thickness === 'number' ? { thickness: action.thickness } : {}),
  })

  useScene.getState().createNode(wall, level.id)
  selectCreatedNode(wall.id, 'wall')
  return wall.id
}

export const createZone = (action: Extract<AssistantAction, { type: 'create_zone' }>) => {
  const level = resolveLevel(action.levelId)
  if (!level || level.type !== 'level') throw new Error('A level must be selected before creating a zone.')
  ensurePolygon(action.polygon)

  const zone = ZoneNode.parse({
    name: action.name ?? getDefaultName('Zone', 'zone'),
    polygon: action.polygon,
    ...(action.color ? { color: action.color } : {}),
  })

  useScene.getState().createNode(zone, level.id)
  selectCreatedNode(zone.id, 'zone')
  return zone.id
}

export const createSlab = (action: Extract<AssistantAction, { type: 'create_slab' }>) => {
  const level = resolveLevel(action.levelId)
  if (!level || level.type !== 'level') throw new Error('A level must be selected before creating a slab.')
  ensurePolygon(action.polygon)

  const slab = SlabNode.parse({
    name: action.name ?? getDefaultName('Slab', 'slab'),
    polygon: action.polygon,
    holes: action.holes ?? [],
    ...(typeof action.elevation === 'number' ? { elevation: action.elevation } : {}),
  })

  useScene.getState().createNode(slab, level.id)
  selectCreatedNode(slab.id, 'slab')
  return slab.id
}

export const createCeiling = (action: Extract<AssistantAction, { type: 'create_ceiling' }>) => {
  const level = resolveLevel(action.levelId)
  if (!level || level.type !== 'level') throw new Error('A level must be selected before creating a ceiling.')
  ensurePolygon(action.polygon)

  const ceiling = CeilingNode.parse({
    name: action.name ?? getDefaultName('Ceiling', 'ceiling'),
    polygon: action.polygon,
    holes: action.holes ?? [],
    ...(typeof action.height === 'number' ? { height: action.height } : {}),
  })

  useScene.getState().createNode(ceiling, level.id)
  selectCreatedNode(ceiling.id, 'ceiling')
  return ceiling.id
}

export const createRoof = (action: Extract<AssistantAction, { type: 'create_roof' }>) => {
  const level = resolveLevel(action.levelId)
  if (!level || level.type !== 'level') throw new Error('A level must be selected before creating a roof.')

  const minX = Math.min(action.corner1[0], action.corner2[0])
  const maxX = Math.max(action.corner1[0], action.corner2[0])
  const minZ = Math.min(action.corner1[1], action.corner2[1])
  const maxZ = Math.max(action.corner1[1], action.corner2[1])
  const length = maxX - minX
  const width = maxZ - minZ
  if (length <= 0 || width <= 0) throw new Error('Roof corners must define a positive area.')

  const roof = RoofNode.parse({
    name: action.name ?? getDefaultName('Roof', 'roof'),
    position: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
    rotation: 0,
    length,
    height: action.height ?? roofDefaultHeight,
    leftWidth: Math.max(width / 2, 0.5),
    rightWidth: Math.max(width / 2, 0.5),
  })

  useScene.getState().createNode(roof, level.id)
  selectCreatedNode(roof.id, 'roof')
  return roof.id
}

const resolveItemPlacement = (
  asset: AssetInput,
  action: Extract<AssistantAction, { type: 'place_item' }>,
) => {
  const targetNodeId = action.targetNodeId ?? action.parentId
  const explicitTarget = targetNodeId ? requireNode(targetNodeId) : null
  const level = resolveLevel(action.levelId)

  if (action.placement === 'center') {
    const fallbackTargetId = explicitTarget?.id ?? useViewer.getState().selection.zoneId ?? getSelectedNodeId()
    if (!fallbackTargetId) {
      throw new Error('Center placement needs a selected or explicit target node.')
    }
    return getCenterPlacement(fallbackTargetId)
  }

  if (asset.attachTo === 'wall' || asset.attachTo === 'wall-side') {
    if (!(explicitTarget?.type === 'wall')) {
      throw new Error(`Asset "${asset.name}" must target a wall.`)
    }
    const wallLength = getWallLength(explicitTarget)
    return {
      position: action.position ?? [wallLength / 2, 1.2, 0],
      parentId: explicitTarget.id,
      levelId: explicitTarget.parentId ?? null,
      side: action.side ?? 'front',
    }
  }

  if (asset.attachTo === 'ceiling') {
    if (!(explicitTarget?.type === 'ceiling')) {
      throw new Error(`Asset "${asset.name}" must target a ceiling.`)
    }
    const [x, z] = polygonCentroid(explicitTarget.polygon)
    const [, assetHeight] = asset.dimensions ?? [1, 1, 1]
    return {
      position: action.position ?? [x, -assetHeight, z],
      parentId: explicitTarget.id,
      levelId: explicitTarget.parentId ?? null,
      side: action.side,
    }
  }

  const resolvedLevel = level?.type === 'level' ? level : getCurrentLevel()
  if (!resolvedLevel || resolvedLevel.type !== 'level') {
    throw new Error('A level must be selected before placing an item.')
  }

  if (explicitTarget?.type === 'zone') {
    const [centerX, centerZ] = polygonCentroid(explicitTarget.polygon)
    const position = action.position ?? [centerX, 0, centerZ]
    ensurePointInsidePolygon(
      position,
      explicitTarget.polygon,
      `Item "${asset.name}" must stay inside zone "${explicitTarget.name}".`,
    )
    return {
      position,
      parentId: resolvedLevel.id,
      levelId: resolvedLevel.id,
      side: action.side,
    }
  }

  if (explicitTarget?.type === 'slab') {
    const [centerX, centerZ] = polygonCentroid(explicitTarget.polygon)
    const position = action.position ?? [centerX, 0, centerZ]
    ensurePointInsidePolygon(
      position,
      explicitTarget.polygon,
      `Item "${asset.name}" must stay inside slab "${explicitTarget.name ?? explicitTarget.id}".`,
    )
    return {
      position,
      parentId: resolvedLevel.id,
      levelId: resolvedLevel.id,
      side: action.side,
    }
  }

  return {
    position: action.position ?? [0, 0, 0],
    parentId: resolvedLevel.id,
    levelId: resolvedLevel.id,
    side: action.side,
  }
}

export const placeItem = (action: Extract<AssistantAction, { type: 'place_item' }>) => {
  const asset = findCatalogItem(action.assetId)
  if (!asset) {
    console.warn(`[assistant] Skipping place_item: asset "${action.assetId}" was not found in the catalog.`)
    return null
  }

  const placement = resolveItemPlacement(asset, action)
  if (!placement.levelId) throw new Error(`Unable to resolve a level for asset "${asset.name}".`)

  const rotation = action.rotation ?? [0, 0, 0]
  const scale = action.scale ?? [1, 1, 1]
  const assetDimensions = asset.dimensions ?? [1, 1, 1]
  const dimensions: [number, number, number] = [
    assetDimensions[0] * scale[0],
    assetDimensions[1] * scale[1],
    assetDimensions[2] * scale[2],
  ]

  if (asset.attachTo === 'wall' || asset.attachTo === 'wall-side') {
    const wall = requireNode(placement.parentId)
    if (wall.type !== 'wall') throw new Error(`Asset "${asset.name}" requires a wall target.`)

    const validation = spatialGridManager.canPlaceOnWall(
      placement.levelId,
      wall.id,
      placement.position[0],
      placement.position[1],
      dimensions,
      asset.attachTo,
      placement.side,
      [],
    )

    if (!validation.valid) {
      throw new Error(`Asset "${asset.name}" cannot be placed on wall "${wall.name ?? wall.id}" at the requested location.`)
    }

    const wallLength = getWallLength(wall)
    const item = ItemNode.parse({
      name: action.name ?? asset.name,
      asset,
      position: [
        placement.position[0],
        'adjustedY' in validation ? (validation.adjustedY ?? placement.position[1]) : placement.position[1],
        0,
      ],
      rotation: [0, getWallRotationFromSide(placement.side ?? 'front'), 0],
      scale,
      parentId: wall.id,
      side: placement.side,
      wallId: wall.id,
      wallT: wallLength > 0 ? placement.position[0] / wallLength : undefined,
    })

    useScene.getState().createNode(item, wall.id)
    selectCreatedNode(item.id, 'item')
    return item.id
  }

  if (asset.attachTo === 'ceiling') {
    const ceiling = requireNode(placement.parentId)
    if (ceiling.type !== 'ceiling') throw new Error(`Asset "${asset.name}" requires a ceiling target.`)

    const validation = spatialGridManager.canPlaceOnCeiling(
      ceiling.id,
      placement.position,
      dimensions,
      rotation,
      [],
    )

    if (!validation.valid) {
      throw new Error(`Asset "${asset.name}" cannot be placed on ceiling "${ceiling.name ?? ceiling.id}" at the requested location.`)
    }

    const item = ItemNode.parse({
      name: action.name ?? asset.name,
      asset,
      position: placement.position,
      rotation,
      scale,
      parentId: ceiling.id,
    })

    useScene.getState().createNode(item, ceiling.id)
    selectCreatedNode(item.id, 'item')
    return item.id
  }

  const validation = spatialGridManager.canPlaceOnFloor(
    placement.levelId,
    [placement.position[0], 0, placement.position[2]],
    dimensions,
    rotation,
    [],
  )

  if (!validation.valid) {
    throw new Error(`Asset "${asset.name}" cannot be placed at the requested floor position.`)
  }

  const item = ItemNode.parse({
    name: action.name ?? asset.name,
    asset,
    position: placement.position,
    rotation,
    scale,
    parentId: placement.parentId,
  })

  useScene.getState().createNode(item, placement.parentId as AnyNodeId)
  selectCreatedNode(item.id, 'item')
  return item.id
}

export const placeDoor = (action: Extract<AssistantAction, { type: 'place_door' }>) => {
  const wall = requireNode(action.wallId)
  if (wall.type !== 'wall') throw new Error(`Node "${action.wallId}" is not a wall.`)
  if (!wall.parentId) throw new Error(`Wall "${wall.id}" is missing a level parent.`)

  const width = action.width ?? 0.9
  const height = action.height ?? 2.1
  const wallLength = getWallLength(wall)
  const requestedX = action.localX ?? wallLength / 2
  const { clampedX, clampedY } = clampDoorToWall(wall, requestedX, width, height)

  if (doorOverlap(wall.id, clampedX, clampedY, width, height)) {
    throw new Error(`Door placement overlaps an existing wall opening on "${wall.name ?? wall.id}".`)
  }

  const side = action.side ?? 'front'
  const door = DoorNode.parse({
    name: action.name ?? getDefaultName('Door', 'door'),
    position: [clampedX, clampedY, 0],
    rotation: [0, getWallRotationFromSide(side), 0],
    side,
    wallId: wall.id,
    width,
    height,
  })

  useScene.getState().createNode(door, wall.id)
  selectCreatedNode(door.id, 'door')
  return door.id
}

export const placeWindow = (action: Extract<AssistantAction, { type: 'place_window' }>) => {
  const wall = requireNode(action.wallId)
  if (wall.type !== 'wall') throw new Error(`Node "${action.wallId}" is not a wall.`)
  if (!wall.parentId) throw new Error(`Wall "${wall.id}" is missing a level parent.`)

  const width = action.width ?? 1.5
  const height = action.height ?? 1.5
  const wallLength = getWallLength(wall)
  const requestedX = action.localX ?? wallLength / 2
  const requestedY = action.localY ?? Math.max(height / 2, 1.5)
  const { clampedX, clampedY } = clampWindowToWall(wall, requestedX, requestedY, width, height)

  if (windowOverlap(wall.id, clampedX, clampedY, width, height)) {
    throw new Error(`Window placement overlaps an existing wall opening on "${wall.name ?? wall.id}".`)
  }

  const side = action.side ?? 'front'
  const windowNode = WindowNode.parse({
    name: action.name ?? getDefaultName('Window', 'window'),
    position: [clampedX, clampedY, 0],
    rotation: [0, getWallRotationFromSide(side), 0],
    side,
    wallId: wall.id,
    width,
    height,
  })

  useScene.getState().createNode(windowNode, wall.id)
  selectCreatedNode(windowNode.id, 'window')
  return windowNode.id
}

export const updateItemProperties = (
  action: Extract<AssistantAction, { type: 'update_item_properties' }>,
) => {
  const item = requireNode(action.nodeId)
  if (item.type !== 'item') throw new Error(`Node "${action.nodeId}" is not an item.`)

  const updates: Partial<ItemNode> = {}
  if (action.position) updates.position = action.position
  if (action.rotation) updates.rotation = action.rotation
  if (action.scale) updates.scale = action.scale

  useScene.getState().updateNode(item.id, updates)
  if (item.asset.attachTo === 'wall' && item.parentId) {
    requestAnimationFrame(() => {
      useScene.getState().dirtyNodes.add(item.parentId as AnyNode['id'])
    })
  }
  selectCreatedNode(item.id, 'item')
  return item.id
}

export const updateDoorProperties = (
  action: Extract<AssistantAction, { type: 'update_door_properties' }>,
) => {
  const door = requireNode(action.nodeId)
  if (door.type !== 'door') throw new Error(`Node "${action.nodeId}" is not a door.`)

  const updates: Partial<DoorNode> = {}
  if (action.position) updates.position = action.position
  if (action.rotation) updates.rotation = action.rotation
  if (action.side) updates.side = action.side
  if (typeof action.width === 'number') updates.width = action.width
  if (typeof action.height === 'number') {
    updates.height = action.height
    if (!action.position) {
      updates.position = [door.position[0], action.height / 2, door.position[2]]
    }
  }
  if (typeof action.frameThickness === 'number') updates.frameThickness = action.frameThickness
  if (typeof action.frameDepth === 'number') updates.frameDepth = action.frameDepth
  if (typeof action.threshold === 'boolean') updates.threshold = action.threshold
  if (typeof action.thresholdHeight === 'number') updates.thresholdHeight = action.thresholdHeight
  if (action.hingesSide) updates.hingesSide = action.hingesSide
  if (action.swingDirection) updates.swingDirection = action.swingDirection
  if (action.segments) updates.segments = action.segments
  if (typeof action.handle === 'boolean') updates.handle = action.handle
  if (typeof action.handleHeight === 'number') updates.handleHeight = action.handleHeight
  if (action.handleSide) updates.handleSide = action.handleSide
  if (action.contentPadding) updates.contentPadding = action.contentPadding
  if (typeof action.doorCloser === 'boolean') updates.doorCloser = action.doorCloser
  if (typeof action.panicBar === 'boolean') updates.panicBar = action.panicBar
  if (typeof action.panicBarHeight === 'number') updates.panicBarHeight = action.panicBarHeight

  useScene.getState().updateNode(door.id, updates)
  useScene.getState().dirtyNodes.add(door.id as AnyNodeId)
  selectCreatedNode(door.id, 'door')
  return door.id
}

export const updateWindowProperties = (
  action: Extract<AssistantAction, { type: 'update_window_properties' }>,
) => {
  const windowNode = requireNode(action.nodeId)
  if (windowNode.type !== 'window') throw new Error(`Node "${action.nodeId}" is not a window.`)

  const updates: Partial<WindowNode> = {}
  if (action.position) updates.position = action.position
  if (action.rotation) updates.rotation = action.rotation
  if (action.side) updates.side = action.side
  if (typeof action.width === 'number') updates.width = action.width
  if (typeof action.height === 'number') {
    const sillBottom = windowNode.position[1] - windowNode.height / 2
    updates.height = action.height
    if (!action.position) {
      updates.position = [windowNode.position[0], sillBottom + action.height / 2, windowNode.position[2]]
    }
  }
  if (typeof action.frameThickness === 'number') updates.frameThickness = action.frameThickness
  if (typeof action.frameDepth === 'number') updates.frameDepth = action.frameDepth
  if (action.columnRatios) updates.columnRatios = action.columnRatios
  if (action.rowRatios) updates.rowRatios = action.rowRatios
  if (typeof action.columnDividerThickness === 'number') {
    updates.columnDividerThickness = action.columnDividerThickness
  }
  if (typeof action.rowDividerThickness === 'number') {
    updates.rowDividerThickness = action.rowDividerThickness
  }
  if (typeof action.sill === 'boolean') updates.sill = action.sill
  if (typeof action.sillDepth === 'number') updates.sillDepth = action.sillDepth
  if (typeof action.sillThickness === 'number') updates.sillThickness = action.sillThickness

  useScene.getState().updateNode(windowNode.id, updates)
  useScene.getState().dirtyNodes.add(windowNode.id as AnyNodeId)
  selectCreatedNode(windowNode.id, 'window')
  return windowNode.id
}

export const updateWallProperties = (
  action: Extract<AssistantAction, { type: 'update_wall_properties' }>,
) => {
  const wall = requireNode(action.nodeId)
  if (wall.type !== 'wall') throw new Error(`Node "${action.nodeId}" is not a wall.`)

  const updates: Partial<WallNode> = {}
  if (typeof action.height === 'number') updates.height = action.height
  if (typeof action.thickness === 'number') updates.thickness = action.thickness

  useScene.getState().updateNode(wall.id, updates)
  useScene.getState().dirtyNodes.add(wall.id as AnyNodeId)
  selectCreatedNode(wall.id, 'wall')
  return wall.id
}

export const updateSlabProperties = (
  action: Extract<AssistantAction, { type: 'update_slab_properties' }>,
) => {
  const slab = requireNode(action.nodeId)
  if (slab.type !== 'slab') throw new Error(`Node "${action.nodeId}" is not a slab.`)

  const updates: Partial<SlabNode> = {}
  if (typeof action.elevation === 'number') updates.elevation = action.elevation
  if (action.holes) updates.holes = action.holes

  useScene.getState().updateNode(slab.id, updates)
  selectCreatedNode(slab.id, 'slab')
  return slab.id
}

export const updateCeilingProperties = (
  action: Extract<AssistantAction, { type: 'update_ceiling_properties' }>,
) => {
  const ceiling = requireNode(action.nodeId)
  if (ceiling.type !== 'ceiling') throw new Error(`Node "${action.nodeId}" is not a ceiling.`)

  const updates: Partial<CeilingNode> = {}
  if (typeof action.height === 'number') updates.height = action.height
  if (action.holes) updates.holes = action.holes

  useScene.getState().updateNode(ceiling.id, updates)
  selectCreatedNode(ceiling.id, 'ceiling')
  return ceiling.id
}

export const updateRoofProperties = (
  action: Extract<AssistantAction, { type: 'update_roof_properties' }>,
) => {
  const roof = requireNode(action.nodeId)
  if (roof.type !== 'roof') throw new Error(`Node "${action.nodeId}" is not a roof.`)

  const updates: Partial<RoofNode> = {}
  if (action.position) updates.position = action.position
  if (typeof action.rotation === 'number') updates.rotation = action.rotation
  if (typeof action.length === 'number') updates.length = action.length
  if (typeof action.height === 'number') updates.height = action.height
  if (typeof action.leftWidth === 'number') updates.leftWidth = action.leftWidth
  if (typeof action.rightWidth === 'number') updates.rightWidth = action.rightWidth

  useScene.getState().updateNode(roof.id, updates)
  selectCreatedNode(roof.id, 'roof')
  return roof.id
}

export const updateReferenceProperties = (
  action: Extract<AssistantAction, { type: 'update_reference_properties' }>,
) => {
  const node = requireNode(action.nodeId)
  if (!(node.type === 'guide' || node.type === 'scan')) {
    throw new Error(`Node "${action.nodeId}" is not a guide or scan.`)
  }

  const updates: Partial<GuideNode> & Partial<ScanNode> = {}
  if (action.position) updates.position = action.position
  if (action.rotation) updates.rotation = action.rotation
  if (typeof action.scale === 'number') updates.scale = action.scale
  if (typeof action.opacity === 'number') updates.opacity = action.opacity

  useScene.getState().updateNode(node.id, updates)
  useEditor.getState().setSelectedReferenceId(node.id)
  return node.id
}

export const updateSiteProperties = (
  action: Extract<AssistantAction, { type: 'update_site_properties' }>,
) => {
  const site = requireNode(action.nodeId)
  if (site.type !== 'site') throw new Error(`Node "${action.nodeId}" is not a site.`)

  useScene.getState().updateNode(site.id, {
    polygon: {
      type: 'polygon',
      points: action.polygon ?? site.polygon.points,
    },
  } as Partial<AnyNode>)
  return site.id
}

export const deleteCadSketchConstraint = (
  action: Extract<AssistantAction, { type: 'delete_cad_sketch_constraint' }>,
) => {
  const sketch = action.sketchId ? requireNode(action.sketchId) : getNode(useEditor.getState().activeSketchId)
  if (sketch?.type !== 'cad-sketch') {
    throw new Error('Select or open a CAD sketch before deleting a constraint.')
  }

  const nextConstraints = sketch.constraints.filter((constraint) => constraint.id !== action.constraintId)
  if (nextConstraints.length === sketch.constraints.length) {
    throw new Error(`Constraint "${action.constraintId}" was not found on the CAD sketch.`)
  }

  useScene.getState().updateNode(sketch.id, { constraints: nextConstraints } as Partial<AnyNode>)
  useViewer.getState().setSelection({ selectedIds: [sketch.id], zoneId: null })
  useEditor.getState().setActiveSketchId(sketch.id)
  return sketch.id
}

export const updateCadSketchDimension = (
  action: Extract<AssistantAction, { type: 'update_cad_sketch_dimension' }>,
) => {
  const sketch = action.sketchId ? requireNode(action.sketchId) : getNode(useEditor.getState().activeSketchId)
  if (sketch?.type !== 'cad-sketch') {
    throw new Error('Select or open a CAD sketch before updating a dimension.')
  }

  const dimension = sketch.dimensions.find((candidate) => candidate.id === action.dimensionId)
  if (!dimension) {
    throw new Error(`Dimension "${action.dimensionId}" was not found on the CAD sketch.`)
  }

  useScene.getState().updateNode(sketch.id, {
    entities: applyDimensionToSketchEntities(sketch, action.dimensionId, action.value),
    dimensions: sketch.dimensions.map((entry) =>
      entry.id === action.dimensionId ? { ...entry, value: action.value } : entry,
    ),
  } as Partial<AnyNode>)
  useViewer.getState().setSelection({ selectedIds: [sketch.id], zoneId: null })
  useEditor.getState().setActiveSketchId(sketch.id)
  return sketch.id
}

const resolveNodeWithPosition = (nodeId?: string) => {
  const node = resolveActionNode(nodeId)
  if (
    node.type !== 'item' &&
    node.type !== 'cad-body' &&
    node.type !== 'guide' &&
    node.type !== 'scan' &&
    node.type !== 'door' &&
    node.type !== 'window' &&
    node.type !== 'roof'
  ) {
    throw new Error(`Node "${node.id}" does not support transform actions.`)
  }
  return node
}

export const moveTarget = (action: Extract<AssistantAction, { type: 'move_target' }>) => {
  const node = resolveNodeWithPosition(action.nodeId)
  const current = node.type === 'cad-body' ? getCadBodyTransform(node).position : node.position
  const next = action.position
    ? action.position
    : action.delta
      ? [current[0] + action.delta[0], current[1] + action.delta[1], current[2] + action.delta[2]]
      : current

  if (node.type === 'cad-body') {
    const transform = getCadBodyTransform(node)
    useScene.getState().updateNode(node.id, {
      position: next,
      transform: { ...transform, position: next },
    } as Partial<AnyNode>)
  } else {
    useScene.getState().updateNode(node.id, { position: next } as Partial<AnyNode>)
  }

  selectCreatedNode(node.id, node.type)
  return node.id
}

export const rotateTarget = (action: Extract<AssistantAction, { type: 'rotate_target' }>) => {
  const node = resolveNodeWithPosition(action.nodeId)

  if (node.type === 'roof') {
    const nextRotation =
      typeof action.rotationY === 'number' ? action.rotationY : (action.rotation?.[1] ?? node.rotation)
    useScene.getState().updateNode(node.id, { rotation: nextRotation } as Partial<AnyNode>)
    selectCreatedNode(node.id, 'roof')
    return node.id
  }

  const current = node.type === 'cad-body' ? getCadBodyTransform(node).rotation : node.rotation
  const next = action.rotation ?? [current[0], action.rotationY ?? current[1], current[2]]

  if (node.type === 'cad-body') {
    const transform = getCadBodyTransform(node)
    useScene.getState().updateNode(node.id, {
      rotation: next,
      transform: { ...transform, rotation: next },
    } as Partial<AnyNode>)
  } else {
    useScene.getState().updateNode(node.id, { rotation: next } as Partial<AnyNode>)
  }

  selectCreatedNode(node.id, node.type)
  return node.id
}

export const scaleTarget = (action: Extract<AssistantAction, { type: 'scale_target' }>) => {
  const node = resolveNodeWithPosition(action.nodeId)

  if (!(node.type === 'item' || node.type === 'cad-body' || node.type === 'guide' || node.type === 'scan')) {
    throw new Error(`Node "${node.id}" does not support scaling.`)
  }

  if (node.type === 'cad-body') {
    const transform = getCadBodyTransform(node)
    useScene.getState().updateNode(node.id, {
      scale: action.scale,
      transform: { ...transform, scale: action.scale },
    } as Partial<AnyNode>)
  } else {
    useScene.getState().updateNode(node.id, { scale: action.scale } as Partial<AnyNode>)
  }

  selectCreatedNode(node.id, node.type)
  return node.id
}

const duplicatePolygonLikeNode = (node: AnyNode) => {
  if (!node.parentId) throw new Error(`Node "${node.id}" cannot be duplicated without a parent.`)

  if (node.type === 'wall') {
    const duplicate = WallNode.parse({
      name: node.name ? `${node.name} Copy` : getDefaultName('Wall', 'wall'),
      start: [node.start[0] + polygonOffset, node.start[1] + polygonOffset],
      end: [node.end[0] + polygonOffset, node.end[1] + polygonOffset],
      height: node.height,
      thickness: node.thickness,
    })
    useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
    selectCreatedNode(duplicate.id, 'wall')
    return duplicate.id
  }

  if (node.type === 'zone') {
    const duplicate = ZoneNode.parse({
      name: node.name ? `${node.name} Copy` : getDefaultName('Zone', 'zone'),
      polygon: shiftPolygon(node.polygon),
      color: node.color,
    })
    useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
    selectCreatedNode(duplicate.id, 'zone')
    return duplicate.id
  }

  if (node.type === 'slab') {
    const duplicate = SlabNode.parse({
      name: node.name ? `${node.name} Copy` : getDefaultName('Slab', 'slab'),
      polygon: shiftPolygon(node.polygon),
      holes: node.holes.map(shiftPolygon),
      elevation: node.elevation,
    })
    useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
    selectCreatedNode(duplicate.id, 'slab')
    return duplicate.id
  }

  if (node.type === 'ceiling') {
    const duplicate = CeilingNode.parse({
      name: node.name ? `${node.name} Copy` : getDefaultName('Ceiling', 'ceiling'),
      polygon: shiftPolygon(node.polygon),
      holes: node.holes.map(shiftPolygon),
      height: node.height,
    })
    useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
    selectCreatedNode(duplicate.id, 'ceiling')
    return duplicate.id
  }

  if (node.type === 'roof') {
    const duplicate = RoofNode.parse({
      name: node.name ? `${node.name} Copy` : getDefaultName('Roof', 'roof'),
      position: [node.position[0] + polygonOffset, node.position[1], node.position[2] + polygonOffset],
      rotation: node.rotation,
      length: node.length,
      height: node.height,
      leftWidth: node.leftWidth,
      rightWidth: node.rightWidth,
    })
    useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
    selectCreatedNode(duplicate.id, 'roof')
    return duplicate.id
  }

  throw new Error(`Node "${node.id}" does not support assistant duplication.`)
}

export const duplicateTarget = (action: Extract<AssistantAction, { type: 'duplicate_target' }>) => {
  const node = resolveActionNode(action.nodeId)
  const target =
    node.type === 'guide' || node.type === 'scan'
      ? { kind: 'reference' as const, nodeId: node.id as GuideNode['id'] | ScanNode['id'] }
      : { kind: 'node' as const, nodeId: node.id as ItemNode['id'] | DoorNode['id'] | WindowNode['id'] | CadBodyNode['id'] }

  const transformNode = getTransformTargetNode(getNodes(), target)
  if (transformNode) {
    const capabilities = getTransformCapabilities(transformNode)
    if (!capabilities.duplicate) throw new Error(`Node "${node.id}" cannot be duplicated.`)
    duplicateTransformTarget(target)
    return getSelectedNodeId()
  }

  return duplicatePolygonLikeNode(node)
}

const resolveRepositionTarget = (
  nodeId?: string,
): ItemNode | DoorNode | WindowNode => {
  const node = resolveActionNode(nodeId)
  if (node.type === 'item' || node.type === 'door' || node.type === 'window') {
    return node
  }
  throw new Error(`Node "${node.id}" does not support reposition mode.`)
}

export const repositionTarget = (
  action: Extract<AssistantAction, { type: 'reposition_target' }>,
) => {
  const node = resolveRepositionTarget(action.nodeId)
  useEditor.getState().setMovingNode(node)
  useViewer.getState().setSelection({ selectedIds: [] })
  return node.id
}

export const duplicateRepositionTarget = (
  action: Extract<AssistantAction, { type: 'duplicate_reposition_target' }>,
) => {
  const node = resolveRepositionTarget(action.nodeId)

  if (node.type === 'item') {
    const proto = ItemNode.parse({
      position: [...node.position] as [number, number, number],
      rotation: [...node.rotation] as [number, number, number],
      name: node.name,
      asset: node.asset,
      parentId: node.parentId,
      side: node.side,
      metadata: { isNew: true },
    })
    useEditor.getState().setMovingNode(proto)
    useViewer.getState().setSelection({ selectedIds: [] })
    return proto.id
  }

  if (!node.parentId) {
    throw new Error(`Node "${node.id}" must have a parent before it can be duplicated for repositioning.`)
  }

  useScene.temporal.getState().pause()

  if (node.type === 'door') {
    const cloned = structuredClone(node) as Record<string, unknown>
    delete cloned.id
    cloned.metadata = { ...(cloned.metadata as Record<string, unknown> | undefined), isNew: true }
    const duplicate = DoorNode.parse(cloned)
    useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
    useEditor.getState().setMovingNode(duplicate)
    useViewer.getState().setSelection({ selectedIds: [] })
    return duplicate.id
  }

  const duplicate = WindowNode.parse({
    position: [...node.position] as [number, number, number],
    rotation: [...node.rotation] as [number, number, number],
    side: node.side,
    wallId: node.wallId,
    parentId: node.parentId,
    width: node.width,
    height: node.height,
    frameThickness: node.frameThickness,
    frameDepth: node.frameDepth,
    columnRatios: [...node.columnRatios],
    rowRatios: [...node.rowRatios],
    columnDividerThickness: node.columnDividerThickness,
    rowDividerThickness: node.rowDividerThickness,
    sill: node.sill,
    sillDepth: node.sillDepth,
    sillThickness: node.sillThickness,
    metadata: { isNew: true },
  })
  useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
  useEditor.getState().setMovingNode(duplicate)
  useViewer.getState().setSelection({ selectedIds: [] })
  return duplicate.id
}

const collectNodeDescendants = (
  nodeIds: string[],
  nodes: ReturnType<typeof useScene.getState>['nodes'],
  visited = new Set<string>(),
) => {
  for (const nodeId of nodeIds) {
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes[nodeId as AnyNodeId]
    if (!node || !('children' in node) || !Array.isArray(node.children)) continue
    collectNodeDescendants(node.children.map((child) => String(child)), nodes, visited)
  }

  return visited
}

export const clearLevelContents = (action: Extract<AssistantAction, { type: 'clear_level_contents' }>) => {
  const level = resolveLevel(action.levelId)
  if (!level || level.type !== 'level') {
    throw new Error('Select a level before clearing its contents.')
  }

  const directChildIds = level.children.map((childId) => String(childId))
  if (directChildIds.length === 0) {
    useViewer.getState().setSelection({ levelId: level.id })
    return level.id
  }

  const descendantIds = Array.from(collectNodeDescendants(directChildIds, getNodes()))
  deleteNodes({ type: 'delete_nodes', nodeIds: descendantIds })
  useViewer.getState().setSelection({ levelId: level.id, selectedIds: [], zoneId: null })
  return level.id
}

export const deleteTarget = (action: Extract<AssistantAction, { type: 'delete_target' }>) => {
  const node = resolveActionNode(action.nodeId)
  useScene.getState().deleteNode(node.id as AnyNodeId)

  const selection = useViewer.getState().selection
  if (selection.zoneId === node.id) useViewer.getState().setSelection({ zoneId: null })
  if (selection.selectedIds.includes(node.id)) useViewer.getState().setSelection({ selectedIds: [] })
  if (useEditor.getState().selectedReferenceId === node.id) {
    useEditor.getState().setSelectedReferenceId(null)
  }
  if (node.type === 'cad-sketch' && useEditor.getState().activeSketchId === node.id) {
    useEditor.getState().setActiveSketchId(null)
  }

  return node.id
}

export const deleteNodes = (action: Extract<AssistantAction, { type: 'delete_nodes' }>) => {
  action.nodeIds.forEach((nodeId) => {
    requireNode(nodeId)
  })

  const deletedNodeIds = new Set(action.nodeIds)
  useScene.getState().deleteNodes(action.nodeIds as AnyNodeId[])

  const selection = useViewer.getState().selection
  const nextSelectedIds = selection.selectedIds.filter((nodeId) => !deletedNodeIds.has(nodeId))
  const nextSelection: Partial<typeof selection> = {}

  if (selection.selectedIds.length !== nextSelectedIds.length) {
    nextSelection.selectedIds = nextSelectedIds
  }
  if (selection.zoneId && deletedNodeIds.has(selection.zoneId)) {
    nextSelection.zoneId = null
  }
  if (selection.levelId && deletedNodeIds.has(selection.levelId)) {
    nextSelection.levelId = null
  }
  if (selection.buildingId && deletedNodeIds.has(selection.buildingId)) {
    nextSelection.buildingId = null
  }

  if (Object.keys(nextSelection).length > 0) {
    useViewer.getState().setSelection(nextSelection)
  }

  const selectedReferenceId = useEditor.getState().selectedReferenceId
  if (selectedReferenceId && deletedNodeIds.has(selectedReferenceId)) {
    useEditor.getState().setSelectedReferenceId(null)
  }
  const activeSketchId = useEditor.getState().activeSketchId
  if (activeSketchId && deletedNodeIds.has(activeSketchId)) {
    useEditor.getState().setActiveSketchId(null)
  }

  return action.nodeIds[0] ?? null
}

export const reparentNode = (action: Extract<AssistantAction, { type: 'reparent_node' }>) => {
  const node = requireNode(action.nodeId)
  const newParent = requireNode(action.newParentId)

  if (node.id === newParent.id) {
    throw new Error('A node cannot be reparented to itself.')
  }

  let checkParent: AnyNode | null = newParent
  while (checkParent?.parentId) {
    if (checkParent.parentId === node.id) {
      throw new Error('Cannot reparent a node into one of its descendants.')
    }
    checkParent = getNode(checkParent.parentId)
  }

  if (node.parentId) {
    const oldParent = getNode(node.parentId)
    if (oldParent && 'children' in oldParent && Array.isArray(oldParent.children)) {
      useScene.getState().updateNode(oldParent.id as AnyNodeId, {
        children: oldParent.children.filter((id) => id !== node.id),
      } as any)
    }
  }

  const existingChildren = 'children' in newParent && Array.isArray(newParent.children) ? newParent.children : []
  const nextChildren = Array.from(new Set([...existingChildren, node.id]))
  useScene.getState().updateNode(newParent.id as AnyNodeId, { children: nextChildren as any })
  useScene.getState().updateNode(node.id as AnyNodeId, { parentId: newParent.id })
  return node.id
}

export const setNodeMetadata = (action: Extract<AssistantAction, { type: 'set_node_metadata' }>) => {
  const node = requireNode(action.nodeId)
  const existingMetadata = node.metadata && typeof node.metadata === 'object' ? node.metadata : {}
  const updatedMetadata = {
    ...existingMetadata,
    [action.key]: action.value,
  }
  useScene.getState().updateNode(node.id as AnyNodeId, { metadata: updatedMetadata })
  return node.id
}

export const getCadSketchById = (sketchId: string | undefined): CadSketchNode | null => {
  if (sketchId) {
    const node = getNode(sketchId)
    return node?.type === 'cad-sketch' ? (node as CadSketchNode) : null
  }

  const activeSketchId = useEditor.getState().activeSketchId
  if (activeSketchId) {
    const activeNode = getNode(activeSketchId)
    if (activeNode?.type === 'cad-sketch') return activeNode as CadSketchNode
  }

  const selectedNodeId = getSelectedNodeId()
  const node = getNode(selectedNodeId)
  return node?.type === 'cad-sketch' ? (node as CadSketchNode) : null
}

export const addCadSketchEntities = (
  action: Extract<AssistantAction, { type: 'add_cad_sketch_entities' }>,
) => {
  const sketch = getCadSketchById(action.sketchId)
  if (!sketch) throw new Error('Select or open a CAD sketch before adding entities.')

  const parsedEntities = action.entities.map((raw) => {
    const entityWithId = {
      id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : generateId('ske'),
      ...raw,
    }
    return CadSketchEntity.parse(entityWithId)
  })

  const updatedEntities = [...sketch.entities, ...parsedEntities]
  useScene.getState().updateNode(sketch.id as AnyNodeId, { entities: updatedEntities })
  return sketch.id
}

export const setCadSketchPlane = (action: Extract<AssistantAction, { type: 'set_cad_sketch_plane' }>) => {
  const sketch = getCadSketchById(action.sketchId)
  if (!sketch) throw new Error('Select or open a CAD sketch before changing its plane.')
  useScene.getState().updateNode(sketch.id as AnyNodeId, { plane: action.plane })
  useEditor.getState().setActiveWorkplane(action.plane)
  return sketch.id
}
