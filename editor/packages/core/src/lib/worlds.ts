import { CadSpaceNode } from '../schema/nodes/cad-space'
import type { AnyNode, AnyNodeId } from '../schema/types'

const cadDefinitionTypes = new Set<AnyNode['type']>(['cad-sketch', 'cad-body'])

export type WorldMigrationResult = {
  nodes: Record<AnyNodeId, AnyNode>
  rootNodeIds: AnyNodeId[]
  cadSpaceId: AnyNodeId
  changed: boolean
}

const childIdentity = (child: unknown) => {
  if (typeof child === 'string') return child
  if (child && typeof child === 'object' && 'id' in child && typeof child.id === 'string') {
    return child.id
  }
  return null
}

const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

export const ensureProjectWorlds = (
  inputNodes: Record<string, AnyNode>,
  inputRootIds: readonly string[],
): WorldMigrationResult => {
  const nodes = { ...inputNodes } as Record<AnyNodeId, AnyNode>
  let changed = false

  let cadSpace = Object.values(nodes).find((node) => node?.type === 'cad-space')
  if (!cadSpace) {
    cadSpace = CadSpaceNode.parse({ name: 'CAD Space', children: [] })
    nodes[cadSpace.id] = cadSpace
    changed = true
  }

  const cadSpaceId = cadSpace.id
  const moved = new Set<string>()

  for (const node of Object.values(nodes)) {
    if (!node || !cadDefinitionTypes.has(node.type) || node.parentId === cadSpaceId) continue
    nodes[node.id] = { ...node, parentId: cadSpaceId }
    moved.add(node.id)
    changed = true
  }

  if (moved.size > 0) {
    for (const [parentId, parent] of Object.entries(nodes)) {
      if (!parent || parentId === cadSpaceId || !('children' in parent) || !Array.isArray(parent.children)) {
        continue
      }
      const nextChildren = parent.children.filter((child) => {
        const childId = childIdentity(child)
        return !childId || !moved.has(childId)
      })
      if (nextChildren.length !== parent.children.length) {
        nodes[parentId as AnyNodeId] = { ...parent, children: nextChildren } as AnyNode
      }
    }
  }

  const space = nodes[cadSpaceId]
  if (space?.type === 'cad-space') {
    const nextChildren = [...space.children]
    const known = new Set<string>(nextChildren)
    for (const node of Object.values(nodes)) {
      if (!node || !cadDefinitionTypes.has(node.type) || node.parentId !== cadSpaceId || known.has(node.id)) {
        continue
      }
      nextChildren.push(node.id as (typeof nextChildren)[number])
      known.add(node.id)
      changed = true
    }
    if (nextChildren.length !== space.children.length) {
      nodes[cadSpaceId] = { ...space, children: nextChildren }
    }
  }

  const siteId =
    inputRootIds.find((id) => nodes[id as AnyNodeId]?.type === 'site') ??
    Object.values(nodes).find((node) => node?.type === 'site')?.id ??
    null

  const rootNodeIds: AnyNodeId[] = []
  if (siteId) rootNodeIds.push(siteId as AnyNodeId)
  rootNodeIds.push(cadSpaceId)
  for (const id of inputRootIds) {
    if (id === siteId || id === cadSpaceId || nodes[id as AnyNodeId]?.type === 'cad-space') continue
    rootNodeIds.push(id as AnyNodeId)
  }

  if (!sameIds(rootNodeIds, inputRootIds)) changed = true

  return {
    nodes,
    rootNodeIds,
    cadSpaceId,
    changed,
  }
}
