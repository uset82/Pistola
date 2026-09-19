import { meshBounds, type TriangleMesh } from '@pascal-app/core'
import type { BlueprintPart, BlueprintV2 } from '../blueprint'
import { relationHolds } from '../blueprint/check'
import { rasterizeParts, maskIou, type RasterFrame } from '../render/soft-raster'
import type { StructurePart } from '../structure'
import type { ReferenceFrames, ReferenceGoldMasks } from './types'

export type FitPartState = {
  id: string
  name: string
  mesh: TriangleMesh
  delta: [number, number, number]
  scale: [number, number, number]
}

export type FitPatch = {
  type: 'move_target' | 'scale_target'
  nodeId: string
  delta?: [number, number, number]
  scale?: [number, number, number]
}

export type FitResult = {
  applied: false
  evaluations: number
  beforeIou: number
  afterIou: number
  score: number
  relationPenalty: number
  patches: FitPatch[]
}

const MAX_PARTS = 10
const MAX_EVALS = 300
const SCALE_MIN = 0.4
const SCALE_MAX = 2.5

const cloneMesh = (mesh: TriangleMesh): TriangleMesh => ({
  positions: [...mesh.positions],
  indices: [...mesh.indices],
})

const applyXform = (mesh: TriangleMesh, origin: [number, number, number], delta: [number, number, number], scale: [number, number, number]) => {
  const positions: number[] = []
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = ((mesh.positions[i] ?? 0) - origin[0]) * scale[0] + origin[0] + delta[0]
    const y = ((mesh.positions[i + 1] ?? 0) - origin[1]) * scale[1] + origin[1] + delta[1]
    const z = ((mesh.positions[i + 2] ?? 0) - origin[2]) * scale[2] + origin[2] + delta[2]
    positions.push(x, y, z)
  }
  return { positions, indices: mesh.indices }
}

const originOf = (part: StructurePart): [number, number, number] => [
  ((part.box.min[0] ?? 0) + (part.box.max[0] ?? 0)) / 2,
  part.box.min[1] ?? 0,
  ((part.box.min[2] ?? 0) + (part.box.max[2] ?? 0)) / 2,
]

const asParts = (items: Array<{ id: string; name: string; mesh: TriangleMesh }>): StructurePart[] =>
  items.map((item) => {
    const box = meshBounds(item.mesh.positions)
    return {
      id: item.id,
      name: item.name,
      type: 'item',
      mesh: item.mesh,
      box,
      triangleCount: item.mesh.indices.length / 3,
      volumeHint: Math.abs((box.size[0] ?? 0) * (box.size[1] ?? 0) * (box.size[2] ?? 0)),
    }
  })

const meanIou = (
  parts: StructurePart[],
  gold: ReferenceGoldMasks,
  frames: ReferenceFrames,
) => {
  const views = ['front', 'side', 'top'] as const
  const scores = views.map((view) => {
    const raster = rasterizeParts(parts, view, gold.size, frames[view] as RasterFrame)
    return maskIou(raster.mask, gold[view])
  })
  return scores.reduce((sum, value) => sum + value, 0) / scores.length
}

const matchPart = (part: BlueprintPart, scene: StructurePart[]) =>
  scene.find((entry) => entry.name === part.name || entry.name === part.id || entry.id.includes(part.id))

const relationPenalty = (blueprint: BlueprintV2, scene: StructurePart[]) => {
  let violations = 0
  for (const relation of blueprint.relations) {
    const aScene = matchPart(
      blueprint.parts.find((part) => part.id === relation.a) ?? { id: relation.a, name: relation.a } as BlueprintPart,
      scene,
    )
    const bScene = matchPart(
      blueprint.parts.find((part) => part.id === relation.b) ?? { id: relation.b, name: relation.b } as BlueprintPart,
      scene,
    )
    const a = blueprint.parts.find((part) => part.id === relation.a)
    const b = blueprint.parts.find((part) => part.id === relation.b)
    if (!a || !b || !aScene || !bScene) continue
    const left: BlueprintPart = {
      ...a,
      dims_m: aScene.box.size,
      position_m: [aScene.box.min[0] + aScene.box.size[0] / 2, aScene.box.min[1], aScene.box.min[2] + aScene.box.size[2] / 2],
    }
    const right: BlueprintPart = {
      ...b,
      dims_m: bScene.box.size,
      position_m: [bScene.box.min[0] + bScene.box.size[0] / 2, bScene.box.min[1], bScene.box.min[2] + bScene.box.size[2] / 2],
    }
    if (!relationHolds(relation, left, right)) violations += 1
  }
  return 0.15 * violations
}

export const fitPartsToReference = (input: {
  parts: StructurePart[]
  goldMasks: ReferenceGoldMasks
  frames: ReferenceFrames
  blueprint: BlueprintV2
  maxEvaluations?: number
}): FitResult => {
  const selected = input.parts.slice(0, MAX_PARTS)
  const origins = selected.map(originOf)
  const params = selected.flatMap(() => [0, 0, 0, 1, 1, 1])
  const maxEvals = input.maxEvaluations ?? MAX_EVALS

  const realize = (values: number[]) =>
    asParts(
      selected.map((part, index) => {
        const offset = index * 6
        const delta: [number, number, number] = [values[offset] ?? 0, values[offset + 1] ?? 0, values[offset + 2] ?? 0]
        const scale: [number, number, number] = [values[offset + 3] ?? 1, values[offset + 4] ?? 1, values[offset + 5] ?? 1]
        return {
          id: part.id,
          name: part.name,
          mesh: applyXform(cloneMesh(part.mesh), origins[index] ?? [0, 0, 0], delta, scale),
        }
      }),
    )

  const evaluate = (values: number[]) => {
    const realized = realize(values)
    const iou = meanIou(realized, input.goldMasks, input.frames)
    const penalty = relationPenalty(input.blueprint, realized)
    return { iou, penalty, score: iou - penalty, realized }
  }

  let current = params.slice()
  let best = evaluate(current)
  let evaluations = 1
  let step = 0.08

  while (evaluations < maxEvals && step > 0.001) {
    let improved = false
    for (let index = 0; index < current.length && evaluations < maxEvals; index += 1) {
      const isScale = index % 6 >= 3
      for (const direction of [1, -1]) {
        if (evaluations >= maxEvals) break
        const trial = current.slice()
        trial[index] = (trial[index] ?? 0) + direction * step
        if (isScale) {
          trial[index] = Math.min(SCALE_MAX, Math.max(SCALE_MIN, trial[index] ?? 1))
        }
        const result = evaluate(trial)
        evaluations += 1
        if (result.score > best.score + 1e-6) {
          current = trial
          best = result
          improved = true
        }
      }
    }
    if (!improved) step *= 0.5
  }

  const before = evaluate(params)
  const patches: FitPatch[] = []
  selected.forEach((part, index) => {
    const offset = index * 6
    const delta: [number, number, number] = [current[offset] ?? 0, current[offset + 1] ?? 0, current[offset + 2] ?? 0]
    const scale: [number, number, number] = [current[offset + 3] ?? 1, current[offset + 4] ?? 1, current[offset + 5] ?? 1]
    if (delta.some((value) => Math.abs(value) > 0.002)) {
      patches.push({ type: 'move_target', nodeId: part.id, delta })
    }
    if (scale.some((value) => Math.abs(value - 1) > 0.01)) {
      patches.push({ type: 'scale_target', nodeId: part.id, scale })
    }
  })

  return {
    applied: false,
    evaluations,
    beforeIou: before.iou,
    afterIou: best.iou,
    score: best.score,
    relationPenalty: best.penalty,
    patches,
  }
}
