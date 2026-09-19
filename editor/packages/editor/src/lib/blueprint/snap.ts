import { collectStructureParts } from '../structure'
import {
  faceAxis,
  faceValue,
  normalizeBlueprint,
  partBox,
  type BlueprintPart,
  type BlueprintRelation,
} from './schema'

const deltaForRelation = (rel: BlueprintRelation, a: BlueprintPart, b: BlueprintPart) => {
  const left = partBox(a)
  const right = partBox(b)
  const tol = rel.tol_m ?? 0.002
  if (rel.rel === 'on_top_of') {
    const dy = right.max[1] - left.min[1]
    if (Math.abs(dy) <= tol) return null
    return [0, dy, 0] as [number, number, number]
  }
  if (rel.rel === 'touches') {
    const aFace = rel.aFace ?? 'ny'
    const bFace = rel.bFace ?? 'py'
    const axis = faceAxis(aFace)
    const gap = faceValue(right, bFace) - faceValue(left, aFace)
    if (Math.abs(gap) <= tol) return null
    const delta: [number, number, number] = [0, 0, 0]
    delta[axis] = gap
    return delta
  }
  if (rel.rel === 'centered_on') {
    const dx = right.center[0] - left.center[0]
    const dz = right.center[2] - left.center[2]
    if (Math.hypot(dx, dz) <= tol) return null
    return [dx, 0, dz] as [number, number, number]
  }
  return null
}

export const proposeRelationSnaps = (input: unknown) => {
  const blueprint = normalizeBlueprint(input)
  const scene = collectStructureParts()
  const patches: Array<{ partId: string; nodeId?: string; relation: string; delta: [number, number, number]; patch: Record<string, unknown> }> = []
  for (const relation of blueprint.relations) {
    if (relation.rel === 'gap_ok' || relation.rel === 'mirror_of' || relation.rel === 'inside') continue
    const a = blueprint.parts.find((part) => part.id === relation.a)
    const b = blueprint.parts.find((part) => part.id === relation.b)
    if (!a || !b) continue
    const delta = deltaForRelation(relation, a, b)
    if (!delta) continue
    const node = scene.find((entry) => entry.name === a.name || entry.name === a.id)
    patches.push({
      partId: a.id,
      nodeId: node?.id,
      relation: relation.rel,
      delta,
      patch: {
        type: 'move_target',
        nodeId: node?.id,
        delta,
      },
    })
  }
  return { applied: false, patches }
}
