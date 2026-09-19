import { collectStructureParts, type StructurePart } from '../structure'
import { finalizeReport, type StructureIssue } from '../structure/report'
import {
  faceValue,
  normalizeBlueprint,
  partBox,
  partsInParentFirstOrder,
  type BlueprintPart,
  type BlueprintRelation,
  type BlueprintV2,
} from './schema'

const unionBox = (parts: BlueprintPart[]) => {
  const boxes = parts.map(partBox)
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const box of boxes) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i] ?? Infinity, box.min[i] ?? Infinity)
      max[i] = Math.max(max[i] ?? -Infinity, box.max[i] ?? -Infinity)
    }
  }
  return {
    min,
    max,
    size: [
      (max[0] ?? 0) - (min[0] ?? 0),
      (max[1] ?? 0) - (min[1] ?? 0),
      (max[2] ?? 0) - (min[2] ?? 0),
    ],
  }
}

export const relationHolds = (rel: BlueprintRelation, a: BlueprintPart, b: BlueprintPart) => {
  const left = partBox(a)
  const right = partBox(b)
  const tol = rel.tol_m ?? 0.02
  if (rel.rel === 'gap_ok' || rel.rel === 'mirror_of') return true
  if (rel.rel === 'on_top_of') return Math.abs(left.min[1] - right.max[1]) <= tol
  if (rel.rel === 'inside') {
    return left.min.every((value, index) => value >= (right.min[index] ?? 0) - tol)
      && left.max.every((value, index) => value <= (right.max[index] ?? 0) + tol)
  }
  if (rel.rel === 'centered_on') {
    return left.center.every((value, index) => Math.abs(value - (right.center[index] ?? 0)) <= Math.max(tol, 0.05))
  }
  const aFace = rel.aFace ?? 'ny'
  const bFace = rel.bFace ?? 'py'
  return Math.abs(faceValue(left, aFace) - faceValue(right, bFace)) <= tol
}

export const checkBlueprint = (input: unknown) => {
  const blueprint = normalizeBlueprint(input)
  const issues: StructureIssue[] = []
  const ids = new Set(blueprint.parts.map((part) => part.id))
  const parents = new Map(blueprint.parts.map((part) => [part.id, part.parent ?? null]))

  for (const part of blueprint.parts) {
    if (part.parent && !ids.has(part.parent)) {
      issues.push({
        code: 'PART_MISSING',
        severity: 'error',
        partId: part.id,
        otherPartId: part.parent,
        measured: {},
        fix: { hint: `Parent "${part.parent}" is not in the blueprint.` },
      })
    }
    if (part.mirrorOf && !ids.has(part.mirrorOf)) {
      issues.push({
        code: 'PART_MISSING',
        severity: 'error',
        partId: part.id,
        otherPartId: part.mirrorOf,
        measured: {},
      })
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const walk = (id: string): boolean => {
    if (visited.has(id)) return false
    if (visiting.has(id)) return true
    visiting.add(id)
    const parent = parents.get(id)
    if (parent && walk(parent)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  for (const part of blueprint.parts) {
    if (walk(part.id)) {
      issues.push({
        code: 'RELATION_VIOLATED',
        severity: 'error',
        partId: part.id,
        measured: {},
        specPath: 'parts.parent',
        fix: { hint: 'Parent chain is cyclic.' },
      })
    }
  }

  for (const relation of blueprint.relations) {
    const a = blueprint.parts.find((part) => part.id === relation.a)
    const b = blueprint.parts.find((part) => part.id === relation.b)
    if (!a || !b) {
      issues.push({
        code: 'PART_MISSING',
        severity: 'error',
        partId: relation.a,
        otherPartId: relation.b,
        measured: {},
      })
      continue
    }
    if (!relationHolds(relation, a, b)) {
      issues.push({
        code: 'RELATION_VIOLATED',
        severity: 'error',
        partId: a.id,
        otherPartId: b.id,
        measured: { rel: relation.rel },
        fix: { hint: `Declared boxes do not satisfy ${relation.rel}.` },
      })
    }
  }

  const assembled = unionBox(blueprint.parts)
  for (let axis = 0; axis < 3; axis += 1) {
    const expected = blueprint.overall_m[axis] ?? 0
    const actual = assembled.size[axis] ?? 0
    if (expected <= 0) continue
    const error = Math.abs(actual - expected) / expected
    if (error > 0.15) {
      issues.push({
        code: 'ACCEPTANCE_FAILED',
        severity: 'error',
        partId: 'overall',
        measured: { axis, expected, actual, error },
        fix: { hint: 'Part boxes do not add up to overall_m.' },
      })
    }
  }

  return { blueprint, ...finalizeReport(issues, blueprint.parts.length, 0.02) }
}

const matchPart = (part: BlueprintPart, scene: StructurePart[]) =>
  scene.find((entry) => entry.name === part.name || entry.name === part.id || entry.id.includes(part.id))

export const checkSceneAgainstPlan = (input: unknown) => {
  const { blueprint } = checkBlueprint(input)
  const scene = collectStructureParts()
  const issues: StructureIssue[] = []
  const limit = blueprint.acceptance.partError

  for (const part of blueprint.parts) {
    const found = matchPart(part, scene)
    if (!found) {
      issues.push({
        code: 'PART_MISSING',
        severity: 'error',
        partId: part.id,
        measured: {},
        fix: { hint: `Build "${part.name}" next.` },
      })
      continue
    }
    const expected = part.dims_m
    const actual = found.box.size
    const dimError = expected.map((value, index) => (value > 0 ? Math.abs((actual[index] ?? 0) - value) / value : 0))
    const worst = Math.max(...dimError)
    if (worst > Math.max(limit, 0.1)) {
      issues.push({
        code: 'DIM_MISMATCH',
        severity: 'error',
        partId: part.id,
        measured: { error: worst, expectedX: expected[0], actualX: actual[0] ?? 0 },
        fix: { hint: `Resize "${part.name}" toward ${expected.join(' × ')} m.` },
      })
    } else if (worst > 0.05) {
      issues.push({
        code: 'DIM_MISMATCH',
        severity: 'warning',
        partId: part.id,
        measured: { error: worst },
      })
    }
    const expectedBox = partBox(part)
    const posError = Math.hypot(
      (found.box.min[0] ?? 0) - expectedBox.min[0],
      (found.box.min[1] ?? 0) - expectedBox.min[1],
      (found.box.min[2] ?? 0) - expectedBox.min[2],
    )
    if (posError > 0.1) {
      issues.push({
        code: 'POSITION_MISMATCH',
        severity: 'error',
        partId: part.id,
        measured: { error: posError },
        fix: {
          hint: `Move "${part.name}" to the planned position.`,
          patch: {
            type: 'move_target',
            nodeId: found.id,
            position: part.position_m,
          },
        },
      })
    }
  }

  const asPart = (part: BlueprintPart, found: StructurePart): BlueprintPart => ({
    ...part,
    dims_m: [found.box.size[0] ?? 0, found.box.size[1] ?? 0, found.box.size[2] ?? 0],
    position_m: [
      (found.box.min[0] ?? 0) + (found.box.size[0] ?? 0) / 2,
      found.box.min[1] ?? 0,
      (found.box.min[2] ?? 0) + (found.box.size[2] ?? 0) / 2,
    ],
  })

  for (const relation of blueprint.relations) {
    const plannedA = blueprint.parts.find((part) => part.id === relation.a)
    const plannedB = blueprint.parts.find((part) => part.id === relation.b)
    if (!plannedA || !plannedB) continue
    const foundA = matchPart(plannedA, scene)
    const foundB = matchPart(plannedB, scene)
    if (!foundA || !foundB) continue
    if (!relationHolds(relation, asPart(plannedA, foundA), asPart(plannedB, foundB))) {
      issues.push({
        code: 'RELATION_VIOLATED',
        severity: 'error',
        partId: plannedA.id,
        otherPartId: plannedB.id,
        measured: { rel: relation.rel },
        fix: { hint: `Scene boxes do not satisfy ${relation.rel}.` },
      })
    }
  }

  const axisIndex = { x: 0, y: 1, z: 2 } as const
  if (scene.length > 0) {
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (const part of scene) {
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i] ?? Infinity, part.box.min[i] ?? Infinity)
        max[i] = Math.max(max[i] ?? -Infinity, part.box.max[i] ?? -Infinity)
      }
    }
    const actual = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
    for (let axis = 0; axis < 3; axis += 1) {
      const expected = blueprint.overall_m[axis] ?? 0
      if (expected <= 0) continue
      const error = Math.abs((actual[axis] ?? 0) - expected) / expected
      if (error > Math.max(blueprint.acceptance.overallError, 0.15)) {
        issues.push({
          code: 'ACCEPTANCE_FAILED',
          severity: 'error',
          partId: 'overall',
          measured: { axis, expected, actual: actual[axis] ?? 0, error },
          fix: { hint: 'Scene bounds do not add up to overall_m.' },
        })
      }
    }
  }

  for (const ratio of blueprint.acceptance.ratios) {
    const left = matchPart({ id: ratio.id, name: ratio.id } as BlueprintPart, scene)
    const right = matchPart({ id: ratio.to, name: ratio.to } as BlueprintPart, scene)
    if (!left || !right) continue
    const leftSize = left.box.size[axisIndex[ratio.of]] ?? 0
    const rightSize = right.box.size[axisIndex[ratio.axis]] ?? 0
    if (rightSize <= 0) continue
    const actual = leftSize / rightSize
    const error = Math.abs(actual - ratio.value) / ratio.value
    if (error > blueprint.acceptance.overallError) {
      issues.push({
        code: 'ACCEPTANCE_FAILED',
        severity: 'error',
        partId: ratio.id,
        otherPartId: ratio.to,
        measured: { expected: ratio.value, actual, error },
        fix: { hint: `Ratio ${ratio.id}.${ratio.of} / ${ratio.to}.${ratio.axis} is off.` },
      })
    }
  }

  return { blueprint, ...finalizeReport(issues, blueprint.parts.length, 0.02) }
}

export const stepsFromBlueprint = (blueprint: BlueprintV2) => {
  const ordered = partsInParentFirstOrder(blueprint.parts)
  return {
    title: blueprint.title ?? blueprint.slug ?? 'Build from blueprint',
    phases: [
      {
        id: 'build',
        title: 'Build',
        steps: [
          ...ordered.map((part) => ({
            id: part.id,
            title: `Build ${part.name}`,
            kind: 'execution' as const,
          })),
          { id: 'check', title: 'Check scene against plan', kind: 'validation' as const },
          { id: 'render', title: 'Render views', kind: 'observation' as const },
        ],
      },
    ],
  }
}
