import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { StructurePart } from './scene-geometry'

export const boxesOverlap = (a: StructurePart['box'], b: StructurePart['box'], tol: number) =>
  a.min[0] <= b.max[0] + tol &&
  a.max[0] >= b.min[0] - tol &&
  a.min[1] <= b.max[1] + tol &&
  a.max[1] >= b.min[1] - tol &&
  a.min[2] <= b.max[2] + tol &&
  a.max[2] >= b.min[2] - tol

export const boxDistance = (a: StructurePart['box'], b: StructurePart['box']) => {
  const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0])
  const dy = Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1])
  const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2])
  return Math.hypot(dx, dy, dz)
}

const identity = new THREE.Matrix4()

const toGeometry = (part: StructurePart) => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.mesh.positions, 3))
  if (part.mesh.indices.length > 0) geometry.setIndex(part.mesh.indices)
  geometry.computeBoundingBox()
  return geometry
}

const meshDistance = (a: StructurePart, b: StructurePart, tol: number) => {
  const fallback = boxDistance(a.box, b.box)
  try {
    const ga = toGeometry(a)
    const gb = toGeometry(b)
    const tree = new MeshBVH(ga)
    gb.boundsTree = new MeshBVH(gb)
    const hit = tree.closestPointToGeometry(
      gb,
      identity,
      { point: new THREE.Vector3(), distance: Infinity, faceIndex: 0 },
      { point: new THREE.Vector3(), distance: Infinity, faceIndex: 0 },
      1e-4,
      tol + 1e-4,
    )
    ga.dispose()
    gb.dispose()
    if (!hit || !Number.isFinite(hit.distance)) return tol + 1
    return hit.distance
  } catch {
    return fallback
  }
}

export const buildContactGraph = (parts: StructurePart[], tol: number) => {
  const edges: Array<[string, string, number]> = []
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const left = parts[i]
      const right = parts[j]
      if (!left || !right) continue
      if (!boxesOverlap(left.box, right.box, tol)) continue
      const distance = meshDistance(left, right, tol)
      if (distance <= tol) edges.push([left.id, right.id, distance])
    }
  }
  return edges
}

export const supportedFromFloor = (
  parts: StructurePart[],
  edges: Array<[string, string, number]>,
  floorY = 0,
  tol = 0.002,
) => {
  const grounded = new Set(parts.filter((part) => part.box.min[1] <= floorY + tol).map((part) => part.id))
  const neighbors = new Map(parts.map((part) => [part.id, [] as string[]]))
  for (const [a, b] of edges) {
    neighbors.get(a)?.push(b)
    neighbors.get(b)?.push(a)
  }
  const supported = new Set(grounded)
  const queue = [...grounded]
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    for (const next of neighbors.get(id) ?? []) {
      if (!supported.has(next)) {
        supported.add(next)
        queue.push(next)
      }
    }
  }
  return { grounded, supported }
}
