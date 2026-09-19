import { countOpenEdges, evaluateCadSolidSpecCached } from '../cad/local-kernel'
import { buildContactGraph, supportedFromFloor } from './contact-graph'
import { finalizeReport, type StructureIssue } from './report'
import { assemblyTolerance, collectStructureParts, type StructurePart } from './scene-geometry'

const ARRAY_OPS = new Set(['linearArray', 'polarArray', 'mirror'])

const overlapVolume = (a: StructurePart['box'], b: StructurePart['box']) => {
  const x = Math.max(0, Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]))
  const y = Math.max(0, Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]))
  const z = Math.max(0, Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]))
  return x * y * z
}

const almostEqualBox = (a: StructurePart['box'], b: StructurePart['box'], tol: number) =>
  a.size.every((value, index) => Math.abs(value - (b.size[index] ?? 0)) <= tol) &&
  a.min.every((value, index) => Math.abs(value - (b.min[index] ?? 0)) <= tol)

const vertexKey = (positions: number[], index: number) => {
  const start = index * 3
  return `${(positions[start] ?? 0).toFixed(5)},${(positions[start + 1] ?? 0).toFixed(5)},${(positions[start + 2] ?? 0).toFixed(5)}`
}

export const countConnectedShells = (mesh: { positions: number[]; indices: number[] }) => {
  const triangleCount = Math.floor(mesh.indices.length / 3)
  if (triangleCount <= 0) return 0
  const parent = Array.from({ length: triangleCount }, (_, index) => index)
  const find = (index: number): number => {
    const current = parent[index] ?? index
    if (current === index) return index
    const root = find(current)
    parent[index] = root
    return root
  }
  const unite = (a: number, b: number) => {
    const left = find(a)
    const right = find(b)
    if (left !== right) parent[right] = left
  }
  const edges = new Map<string, number>()
  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3] ?? 0
    const i1 = mesh.indices[t * 3 + 1] ?? 0
    const i2 = mesh.indices[t * 3 + 2] ?? 0
    const keys: Array<[string, string]> = [
      [vertexKey(mesh.positions, i0), vertexKey(mesh.positions, i1)],
      [vertexKey(mesh.positions, i1), vertexKey(mesh.positions, i2)],
      [vertexKey(mesh.positions, i2), vertexKey(mesh.positions, i0)],
    ]
    for (const [left, right] of keys) {
      const key = left < right ? `${left}|${right}` : `${right}|${left}`
      const other = edges.get(key)
      if (other === undefined) edges.set(key, t)
      else unite(t, other)
    }
  }
  return new Set(parent.map((_, index) => find(index))).size
}

const visitDifference = (spec: unknown, path: string, partId: string, issues: StructureIssue[]) => {
  if (!spec || typeof spec !== 'object') return
  const node = spec as { op?: string; children?: unknown[] }
  if (node.op === 'difference' && Array.isArray(node.children) && node.children.length >= 2) {
    try {
      const base = evaluateCadSolidSpecCached(node.children[0])
      const result = evaluateCadSolidSpecCached(node)
      const drop = base.volume - result.volume
      if (drop <= Math.max(1e-6, 0.02 * base.volume)) {
        issues.push({
          code: 'NOOP_DIFFERENCE',
          severity: 'error',
          partId,
          specPath: path,
          measured: { baseVolume: base.volume, resultVolume: result.volume, drop },
          fix: { hint: 'Move the cutting solid so it overlaps the base, or delete the no-op cut.' },
        })
      }
    } catch {
      issues.push({
        code: 'NOOP_DIFFERENCE',
        severity: 'error',
        partId,
        specPath: path,
        measured: { drop: 0 },
        fix: { hint: 'The cut failed or did not change the solid. Overlap the tool with the base.' },
      })
    }
  }
  node.children?.forEach((child, index) => visitDifference(child, `${path}.children[${index}]`, partId, issues))
  if ('child' in node) visitDifference((node as { child?: unknown }).child, `${path}.child`, partId, issues)
}

export const checkStructure = () => {
  const parts = collectStructureParts()
  const tolerance = assemblyTolerance(parts)
  const issues: StructureIssue[] = []

  for (const part of parts) {
    if (part.triangleCount <= 0 || part.mesh.positions.length === 0) {
      issues.push({
        code: 'EMPTY_RESULT',
        severity: 'error',
        partId: part.id,
        measured: { triangles: part.triangleCount },
        fix: { hint: 'Rebuild the part; the solid is empty.' },
      })
    }
    if (part.triangleCount > 50_000) {
      issues.push({
        code: 'BUDGET',
        severity: 'error',
        partId: part.id,
        measured: { triangles: part.triangleCount },
        fix: { hint: 'Simplify the spec; keep the mesh under 50k triangles.' },
      })
    }
    if (part.volumeHint <= 1e-6) {
      issues.push({
        code: 'DEGENERATE',
        severity: 'error',
        partId: part.id,
        measured: { volume: part.volumeHint },
        fix: { hint: 'Increase a dimension so the part has volume.' },
      })
    }
    if (part.type === 'cad-body' && part.mesh.indices.length > 0) {
      const open = countOpenEdges({
        positions: part.mesh.positions,
        indices: part.mesh.indices,
        volume: part.volumeHint,
        bbox: [part.box.min, part.box.max],
      })
      if (open > 0) {
        issues.push({
          code: 'OPEN_MESH',
          severity: 'error',
          partId: part.id,
          specPath: part.specOp === 'revolve' ? 'spec.profile' : 'spec',
          measured: { openEdges: open },
          fix: { hint: 'Close the profile or add caps so the solid is watertight.' },
        })
      }
      const shells = countConnectedShells(part.mesh)
      if (shells > 1 && !ARRAY_OPS.has(part.specOp ?? '')) {
        issues.push({
          code: 'DISJOINT_SHELLS',
          severity: 'error',
          partId: part.id,
          measured: { shells },
          fix: { hint: 'Split the solid into separate parts, or union pieces that should touch.' },
        })
      }
      if (part.spec) visitDifference(part.spec, 'spec', part.id, issues)
    }
    if (part.box.max[1] < -tolerance) {
      issues.push({
        code: 'BELOW_FLOOR',
        severity: 'error',
        partId: part.id,
        measured: { minY: part.box.min[1], maxY: part.box.max[1] },
        fix: {
          hint: 'Move the part up onto the floor.',
          patch: { type: 'move_target', nodeId: part.id, delta: [0, -part.box.min[1], 0] },
        },
      })
    } else if (part.box.min[1] < -tolerance) {
      issues.push({
        code: 'BELOW_FLOOR',
        severity: 'warning',
        partId: part.id,
        measured: { minY: part.box.min[1], maxY: part.box.max[1] },
        fix: {
          hint: 'The part crosses the floor. Lift it if that was not intended.',
          patch: { type: 'move_target', nodeId: part.id, delta: [0, -part.box.min[1], 0] },
        },
      })
    }
  }

  const edges = buildContactGraph(parts, tolerance)
  const { supported, grounded } = supportedFromFloor(parts, edges, 0, tolerance)

  if (parts.length > 0 && grounded.size === 0) {
    for (const part of parts) {
      issues.push({
        code: 'UNGROUNDED',
        severity: 'warning',
        partId: part.id,
        measured: { minY: part.box.min[1] },
      })
    }
  }

  for (const part of parts) {
    if (!supported.has(part.id)) {
      const lift = Math.min(0, part.box.min[1])
      issues.push({
        code: 'FLOATING_PART',
        severity: 'error',
        partId: part.id,
        measured: { minY: part.box.min[1] },
        fix: {
          hint: 'Lower the part until it touches a supported neighbor or the floor.',
          patch: { type: 'move_target', nodeId: part.id, delta: [0, -part.box.min[1], 0] },
        },
      })
      void lift
    }
  }

  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i]
      const b = parts[j]
      if (!a || !b) continue
      if (almostEqualBox(a.box, b.box, tolerance) && a.name === b.name) {
        issues.push({
          code: 'DUPLICATE_PART',
          severity: 'error',
          partId: a.id,
          otherPartId: b.id,
          measured: { sizeX: a.box.size[0] },
          fix: { hint: 'Delete one of the duplicate parts.' },
        })
      }
      const overlap = overlapVolume(a.box, b.box)
      const smaller = Math.min(a.volumeHint, b.volumeHint)
      if (smaller > 0 && overlap > 0.85 * smaller) {
        issues.push({
          code: 'BURIED_PART',
          severity: 'error',
          partId: a.volumeHint <= b.volumeHint ? a.id : b.id,
          otherPartId: a.volumeHint <= b.volumeHint ? b.id : a.id,
          measured: { overlap },
          fix: { hint: 'Move the buried part so it is only touching, not inside, the other part.' },
        })
      } else if (smaller > 0 && overlap > 0.35 * smaller) {
        issues.push({
          code: 'EXCESSIVE_OVERLAP',
          severity: 'warning',
          partId: a.id,
          otherPartId: b.id,
          measured: { overlap },
        })
      }
    }
  }

  return finalizeReport(issues, parts.length, tolerance)
}
