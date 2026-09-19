import { applyParentTransform, boxFromSize } from './geometry.mjs'

const nextId = (prefix, index) => `${prefix}_${index}`

const asVec3 = (value, fallback) =>
  Array.isArray(value) && value.length === 3 ? value.map(Number) : fallback

export const replayActions = (actions) => {
  const nodes = new Map()
  const refs = new Map()
  let index = 0
  const errors = []

  const resolveId = (value) => {
    if (typeof value !== 'string') return value
    if (value.startsWith('$ref_')) return refs.get(value) ?? value
    return value
  }

  for (const action of actions) {
    index += 1
    if (!action || typeof action !== 'object') {
      errors.push({ index: index - 1, message: 'Action is not an object.' })
      continue
    }
    if (action.type === 'place_item') {
      const id = typeof action.refId === 'string' && action.refId.startsWith('$ref_')
        ? action.refId
        : nextId('item', index)
      const parentId = resolveId(action.parentId)
      const parent = parentId ? nodes.get(parentId) : null
      const localPos = asVec3(action.position, [0, 0, 0])
      const localScale = asVec3(action.scale, [1, 1, 1])
      const world = applyParentTransform(localPos, localScale, parent)
      const node = {
        id,
        type: 'item',
        name: action.name ?? id,
        role: action.role ?? null,
        assetId: action.assetId ?? null,
        color: action.color ?? null,
        parentId: parentId ?? null,
        position: world.position,
        scale: world.scale,
        localPosition: localPos,
        localScale,
        box: boxFromSize(world.position, world.scale),
      }
      nodes.set(id, node)
      if (typeof action.refId === 'string') refs.set(action.refId, id)
      continue
    }
    if (action.type === 'update_item_properties') {
      const id = resolveId(action.targetId ?? action.nodeId ?? action.id)
      const node = nodes.get(id)
      if (!node) {
        errors.push({ index: index - 1, type: action.type, message: `Unknown item ${id}` })
        continue
      }
      if (Array.isArray(action.position)) node.position = asVec3(action.position, node.position)
      if (Array.isArray(action.scale)) node.scale = asVec3(action.scale, node.scale)
      if (action.name) node.name = action.name
      if (action.color) node.color = action.color
      node.box = boxFromSize(node.position, node.scale)
      continue
    }
    if (action.type === 'delete_nodes') {
      for (const raw of action.nodeIds ?? []) nodes.delete(resolveId(raw))
      continue
    }
  }

  const parts = [...nodes.values()]
  return { ok: errors.length === 0, errors, parts, nodes: parts }
}
