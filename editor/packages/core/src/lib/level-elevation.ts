import { sceneRegistry } from '../hooks/scene-registry/scene-registry'
import type { AnyNodeId, BuildingNode, CeilingNode, LevelNode, WallNode } from '../schema'
import type useScene from '../store/use-scene'

export const DEFAULT_LEVEL_HEIGHT = 2.5

const heightCache = new Map<string, number>()
const levelOwnerCache = new Map<string, string | null>()
let lastNodesRef: object | null = null

const resetCachesIfNeeded = (nodes: ReturnType<typeof useScene.getState>['nodes']) => {
  if (nodes !== lastNodesRef) {
    heightCache.clear()
    levelOwnerCache.clear()
    lastNodesRef = nodes
  }
}

const getLevelOwnerBuildingId = (
  levelId: string,
  nodes: ReturnType<typeof useScene.getState>['nodes'],
): string | null => {
  resetCachesIfNeeded(nodes)

  if (levelOwnerCache.has(levelId)) return levelOwnerCache.get(levelId) ?? null

  const level = nodes[levelId as LevelNode['id']] as LevelNode | undefined
  if (!level || level.type !== 'level') {
    levelOwnerCache.set(levelId, null)
    return null
  }

  if (level.parentId) {
    const parent = nodes[level.parentId as AnyNodeId]
    if (parent?.type === 'building') {
      levelOwnerCache.set(levelId, parent.id)
      return parent.id
    }
  }

  const owner =
    Object.values(nodes).find(
      (node): node is BuildingNode =>
        node.type === 'building' && node.children.includes(levelId as LevelNode['id']),
    )?.id ?? null

  levelOwnerCache.set(levelId, owner)
  return owner
}

export function getLevelHeight(
  levelId: string,
  nodes: ReturnType<typeof useScene.getState>['nodes'],
): number {
  resetCachesIfNeeded(nodes)

  if (heightCache.has(levelId)) return heightCache.get(levelId)!

  const level = nodes[levelId as LevelNode['id']] as LevelNode | undefined
  if (!level || level.type !== 'level') return DEFAULT_LEVEL_HEIGHT

  let maxTop = 0

  for (const childId of level.children) {
    const child = nodes[childId as keyof typeof nodes]
    if (!child) continue

    if (child.type === 'ceiling') {
      const ceilingHeight = (child as CeilingNode).height ?? DEFAULT_LEVEL_HEIGHT
      if (ceilingHeight > maxTop) maxTop = ceilingHeight
      continue
    }

    if (child.type === 'wall') {
      let meshY = sceneRegistry.nodes.get(childId as AnyNodeId)?.position.y ?? 0
      if (meshY < 0) meshY = 0
      const wallTop = meshY + ((child as WallNode).height ?? DEFAULT_LEVEL_HEIGHT)
      if (wallTop > maxTop) maxTop = wallTop
    }
  }

  const height = maxTop > 0 ? maxTop : DEFAULT_LEVEL_HEIGHT
  heightCache.set(levelId, height)
  return height
}

export function getLevelFloorElevation(
  levelId: string,
  nodes: ReturnType<typeof useScene.getState>['nodes'],
): number {
  resetCachesIfNeeded(nodes)

  const level = nodes[levelId as LevelNode['id']] as LevelNode | undefined
  if (!level || level.type !== 'level') return 0

  const ownerBuildingId = getLevelOwnerBuildingId(levelId, nodes)
  if (!ownerBuildingId) return 0

  const siblingLevels = Object.values(nodes)
    .filter(
      (node): node is LevelNode =>
        node.type === 'level' && getLevelOwnerBuildingId(node.id, nodes) === ownerBuildingId,
    )
    .sort((left, right) => left.level - right.level)

  let cumulativeHeight = 0
  for (const siblingLevel of siblingLevels) {
    if (siblingLevel.id === levelId) break
    cumulativeHeight += getLevelHeight(siblingLevel.id, nodes)
  }

  return cumulativeHeight
}
