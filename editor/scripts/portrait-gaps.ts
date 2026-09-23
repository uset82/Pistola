import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from '../packages/editor/node_modules/three/build/three.core.js'
import { MeshBVH } from '../packages/editor/node_modules/three-mesh-bvh/src/index.js'
import { createPistolaAgentApi } from '../packages/editor/src/lib/agent-api/index.ts'
import { checkStructure } from '../packages/editor/src/lib/structure/checks.ts'
import { boxDistance } from '../packages/editor/src/lib/structure/contact-graph.ts'
import { assemblyTolerance, collectStructureParts } from '../packages/editor/src/lib/structure/scene-geometry.ts'
import { buildContactGraph, supportedFromFloor } from '../packages/editor/src/lib/structure/contact-graph.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const raw = JSON.parse(await readFile(path.join(repoRoot, '.pistola/studio/claude-self-portrait/actions.json'), 'utf8'))
const actions = raw.order.flatMap((name: string) => raw.groups[name] ?? [])
const api = createPistolaAgentApi()
const replayed = await api.replay(actions)
const report = checkStructure()
const parts = collectStructureParts()

const separation = (left: (typeof parts)[number], right: (typeof parts)[number]) => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(right.mesh.positions, 3))
  if (right.mesh.indices.length > 0) geometry.setIndex(right.mesh.indices)
  const tree = new MeshBVH(geometry)
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 }
  let min = Infinity
  const step = Math.max(1, Math.floor(left.mesh.positions.length / 3 / 80))
  for (let index = 0; index < left.mesh.positions.length; index += step * 3) {
    const point = new THREE.Vector3(left.mesh.positions[index], left.mesh.positions[index + 1], left.mesh.positions[index + 2])
    const hit = tree.closestPointToPoint(point, target)
    if (hit) min = Math.min(min, hit.distance)
  }
  geometry.dispose()
  return min
}

const tolerance = assemblyTolerance(parts)
const edges = buildContactGraph(parts, tolerance)
const { supported } = supportedFromFloor(parts, edges, 0, tolerance)
const floating = report.issues.filter((issue) => issue.code === 'FLOATING_PART')
const rows = floating.map((issue) => {
  const part = parts.find((candidate) => candidate.id === issue.partId)
  if (!part) return { name: issue.partId, missing: true }
  let nearest = ''
  let mesh = Infinity
  let box = Infinity
  for (const other of parts) {
    if (other.id === part.id || !supported.has(other.id)) continue
    const gap = boxDistance(part.box, other.box)
    const sampled = Math.min(separation(part, other), separation(other, part))
    if (sampled < mesh) {
      mesh = sampled
      box = gap
      nearest = other.name
    }
  }
  return {
    name: part.name,
    opacity: part.opacity ?? 1,
    nearestSupported: nearest,
    meshMm: Number.isFinite(mesh) ? Math.round(mesh * 1000) : null,
    boxMm: Number.isFinite(box) ? Math.round(box * 1000) : null,
    withinTolerance: mesh <= tolerance,
  }
})

console.log(JSON.stringify({
  replayOk: replayed.ok,
  partCount: report.partCount,
  errorCount: report.errorCount,
  supported: supported.size,
  toleranceMm: Math.round(tolerance * 1000),
  rows,
}, null, 2))
