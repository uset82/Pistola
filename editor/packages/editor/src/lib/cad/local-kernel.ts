import * as THREE from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'
import { CadSolidSpecSchema, type CadSolidSpec } from './solid-spec'

export type KernelMesh = {
  positions: number[]
  indices: number[]
  normals?: number[]
  volume: number
  bbox: [[number, number, number], [number, number, number]]
}

export const KERNEL_TRIANGLE_BUDGET = 50_000
export const DEFAULT_CREASE_DEG = 30

export const triangleCount = (mesh: Pick<KernelMesh, 'indices'>) => Math.floor(mesh.indices.length / 3)

export class CadSpecError extends Error {
  path: string
  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'CadSpecError'
    this.path = path
  }
}

const meshCache = new Map<string, KernelMesh>()

export const hashCadSolidSpec = (spec: CadSolidSpec) => JSON.stringify(spec)

export const clearCadSolidSpecCache = () => meshCache.clear()

type Vec3 = [number, number, number]
type Vec2 = [number, number]

const num = (value: number | undefined) => value ?? 0
const vec2 = (value: Vec2 | undefined): Vec2 => [num(value?.[0]), num(value?.[1])]
const vec3 = (x: number | undefined, y: number | undefined, z: number | undefined): Vec3 => [num(x), num(y), num(z)]
const vertexAt = (positions: number[], index: number | undefined): Vec3 => {
  const start = num(index) * 3
  return vec3(positions[start], positions[start + 1], positions[start + 2])
}
const cornerAt = (corners: Vec3[], index: number | undefined): Vec3 => corners[num(index)] ?? [0, 0, 0]
const indexAt = (values: number[], index: number | undefined) => num(values[num(index)])

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const rotateVec = (point: Vec3, radians: Vec3): Vec3 => {
  let [x, y, z] = point
  if (radians[0]) {
    const c = Math.cos(radians[0])
    const s = Math.sin(radians[0])
    ;[y, z] = [y * c - z * s, y * s + z * c]
  }
  if (radians[1]) {
    const c = Math.cos(radians[1])
    const s = Math.sin(radians[1])
    ;[x, z] = [x * c + z * s, -x * s + z * c]
  }
  if (radians[2]) {
    const c = Math.cos(radians[2])
    const s = Math.sin(radians[2])
    ;[x, y] = [x * c - y * s, x * s + y * c]
  }
  return [x, y, z]
}

const applyTransforms = (mesh: KernelMesh, spec: CadSolidSpec): KernelMesh => {
  const scaled = spec.scale ?? [1, 1, 1]
  const rotated = spec.rotate ?? [0, 0, 0]
  const translated = spec.translate ?? [0, 0, 0]
  if (scaled[0] === 1 && scaled[1] === 1 && scaled[2] === 1 && !rotated[0] && !rotated[1] && !rotated[2] && !translated[0] && !translated[1] && !translated[2]) {
    return mesh
  }
  const positions: number[] = []
  for (let i = 0; i < mesh.positions.length; i += 3) {
    let point: Vec3 = [
      num(mesh.positions[i]) * scaled[0],
      num(mesh.positions[i + 1]) * scaled[1],
      num(mesh.positions[i + 2]) * scaled[2],
    ]
    point = rotateVec(point, rotated)
    point = add(point, translated)
    positions.push(point[0], point[1], point[2])
  }
  return finishMesh(positions, mesh.indices)
}

const length3 = (value: Vec3) => Math.hypot(value[0], value[1], value[2])

const normalize3 = (value: Vec3): Vec3 => {
  const len = length3(value)
  return len < 1e-12 ? [0, 1, 0] : scale(value, 1 / len)
}

const quantizeKey = (point: Vec3, eps = 1e-6) => {
  const quantize = (value: number) => Math.round(value / eps)
  return `${quantize(point[0])},${quantize(point[1])},${quantize(point[2])}`
}

export const computeAngleNormals = (
  positions: number[],
  indices: number[],
  creaseDeg = DEFAULT_CREASE_DEG,
): number[] => {
  const creaseCos = Math.cos((creaseDeg * Math.PI) / 180)
  const vertexCount = Math.floor(positions.length / 3)
  const triCount = Math.floor(indices.length / 3)
  const faceNormals: Vec3[] = []
  const vertexFace = new Array<number>(vertexCount).fill(-1)
  const facesAtPosition = new Map<string, number[]>()
  const fallbackNormal: Vec3 = [0, 1, 0]

  for (let t = 0; t < triCount; t += 1) {
    const ia = num(indices[t * 3])
    const ib = num(indices[t * 3 + 1])
    const ic = num(indices[t * 3 + 2])
    const a = vertexAt(positions, ia)
    const b = vertexAt(positions, ib)
    const c = vertexAt(positions, ic)
    const normal = normalize3(cross(sub(b, a), sub(c, a)))
    faceNormals.push(normal)
    for (const index of [ia, ib, ic]) {
      vertexFace[index] = t
      const key = quantizeKey(vertexAt(positions, index))
      const list = facesAtPosition.get(key) ?? []
      list.push(t)
      facesAtPosition.set(key, list)
    }
  }

  const normals = new Array<number>(vertexCount * 3).fill(0)
  for (let i = 0; i < vertexCount; i += 1) {
    const ownFace = vertexFace[i] ?? -1
    const ownNormal: Vec3 = ownFace >= 0 ? (faceNormals[ownFace] ?? fallbackNormal) : fallbackNormal
    const faces = facesAtPosition.get(quantizeKey(vertexAt(positions, i))) ?? []
    let accumulated: Vec3 = [0, 0, 0]
    for (const face of faces) {
      const candidate: Vec3 = faceNormals[face] ?? fallbackNormal
      if (dot(ownNormal, candidate) >= creaseCos - 1e-8) {
        accumulated = add(accumulated, candidate)
      }
    }
    const normal = normalize3(accumulated)
    normals[i * 3] = normal[0]
    normals[i * 3 + 1] = normal[1]
    normals[i * 3 + 2] = normal[2]
  }
  return normals
}

const enforceBudget = (mesh: KernelMesh, budget: number) => {
  const triangles = triangleCount(mesh)
  if (triangles > budget) {
    throw new CadSpecError(
      'spec',
      `mesh exceeds complexity budget (${triangles} > ${budget} triangles)`,
    )
  }
}

const finishMesh = (positions: number[], indices: number[]): KernelMesh => {
  let min: Vec3 = [Infinity, Infinity, Infinity]
  let max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    min = [
      Math.min(min[0], num(positions[i])),
      Math.min(min[1], num(positions[i + 1])),
      Math.min(min[2], num(positions[i + 2])),
    ]
    max = [
      Math.max(max[0], num(positions[i])),
      Math.max(max[1], num(positions[i + 1])),
      Math.max(max[2], num(positions[i + 2])),
    ]
  }
  return {
    positions,
    indices,
    normals: computeAngleNormals(positions, indices),
    volume: signedVolume(positions, indices),
    bbox: [min, max],
  }
}

export const rawSignedVolume = (positions: number[], indices: number[]) => {
  let volume = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertexAt(positions, indices[i])
    const b = vertexAt(positions, indices[i + 1])
    const c = vertexAt(positions, indices[i + 2])
    volume += dot(a, cross(b, c)) / 6
  }
  return volume
}

const signedVolume = (positions: number[], indices: number[]) => Math.abs(rawSignedVolume(positions, indices))

const pushTriangle = (positions: number[], indices: number[], a: Vec3, b: Vec3, c: Vec3) => {
  const start = positions.length / 3
  positions.push(...a, ...b, ...c)
  indices.push(start, start + 1, start + 2)
}

const boxMesh = (size: Vec3): KernelMesh => {
  const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2]
  const corners: Vec3[] = [
    [-sx, 0, -sz],
    [sx, 0, -sz],
    [sx, 0, sz],
    [-sx, 0, sz],
    [-sx, size[1], -sz],
    [sx, size[1], -sz],
    [sx, size[1], sz],
    [-sx, size[1], sz],
  ]
  const faces = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [3, 2, 6, 7],
    [0, 3, 7, 4],
    [1, 5, 6, 2],
  ]
  const positions: number[] = []
  const indices: number[] = []
  for (const face of faces) {
    pushTriangle(positions, indices, cornerAt(corners, face[0]), cornerAt(corners, face[1]), cornerAt(corners, face[2]))
    pushTriangle(positions, indices, cornerAt(corners, face[0]), cornerAt(corners, face[2]), cornerAt(corners, face[3]))
  }
  return finishMesh(positions, indices)
}

const cylinderMesh = (r: number, h: number, r2 = r, segments = 32): KernelMesh => {
  const positions: number[] = []
  const indices: number[] = []
  const top: Vec3 = [0, h, 0]
  const bottom: Vec3 = [0, 0, 0]
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    const b0: Vec3 = [Math.cos(a0) * r, 0, Math.sin(a0) * r]
    const b1: Vec3 = [Math.cos(a1) * r, 0, Math.sin(a1) * r]
    const t0: Vec3 = [Math.cos(a0) * r2, h, Math.sin(a0) * r2]
    const t1: Vec3 = [Math.cos(a1) * r2, h, Math.sin(a1) * r2]
    pushTriangle(positions, indices, b0, t1, b1)
    pushTriangle(positions, indices, b0, t0, t1)
    pushTriangle(positions, indices, bottom, b0, b1)
    pushTriangle(positions, indices, top, t1, t0)
  }
  return finishMesh(positions, indices)
}

const sphereMesh = (r: number, segments = 24): KernelMesh => {
  const positions: number[] = []
  const indices: number[] = []
  const pole = (y: number) => {
    const index = positions.length / 3
    positions.push(0, y, 0)
    return index
  }
  const north = pole(r + r)
  const rings: number[][] = []
  for (let y = 1; y < segments; y += 1) {
    const v = y / segments
    const ringY = Math.cos(v * Math.PI) * r + r
    const ringR = Math.sin(v * Math.PI) * r
    const ring: number[] = []
    for (let x = 0; x < segments; x += 1) {
      const angle = (x / segments) * Math.PI * 2
      ring.push(positions.length / 3)
      positions.push(Math.cos(angle) * ringR, ringY, Math.sin(angle) * ringR)
    }
    rings.push(ring)
  }
  const south = pole(0)
  const link = (a: number, b: number, c: number) => {
    indices.push(a, b, c)
  }
  const first = rings[0]
  const last = rings[rings.length - 1]
  if (first) {
    for (let x = 0; x < segments; x += 1) {
      link(north, first[x] ?? 0, first[(x + 1) % segments] ?? 0)
    }
  }
  for (let y = 0; y < rings.length - 1; y += 1) {
    const lower = rings[y] ?? []
    const upper = rings[y + 1] ?? []
    for (let x = 0; x < segments; x += 1) {
      const next = (x + 1) % segments
      link(lower[x] ?? 0, lower[next] ?? 0, upper[next] ?? 0)
      link(lower[x] ?? 0, upper[next] ?? 0, upper[x] ?? 0)
    }
  }
  if (last) {
    for (let x = 0; x < segments; x += 1) {
      link(last[x] ?? 0, south, last[(x + 1) % segments] ?? 0)
    }
  }
  return finishMesh(positions, indices)
}

const polygonArea = (points: Vec2[]) =>
  0.5 *
  points.reduce((sum, point, index) => {
    const next = vec2(points[(index + 1) % points.length])
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0)

const ensureCcw = (points: Vec2[]) => (polygonArea(points) < 0 ? [...points].reverse() : points)

const nearlyEqual = (a: Vec2, b: Vec2, eps = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps

const segmentsIntersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
  const cross2 = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = cross2(c, d, a)
  const d2 = cross2(c, d, b)
  const d3 = cross2(a, b, c)
  const d4 = cross2(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return false
}

const hasSelfIntersection = (points: Vec2[]) => {
  const count = points.length
  for (let i = 0; i < count; i += 1) {
    const a = vec2(points[i])
    const b = vec2(points[(i + 1) % count])
    for (let j = i + 1; j < count; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === count - 1) || (j === 0 && i === count - 1)) continue
      if (i === 0 && j === count - 1) continue
      const adjacent = (j + 1) % count === i || (i + 1) % count === j
      if (adjacent) continue
      const c = vec2(points[j])
      const d = vec2(points[(j + 1) % count])
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}

export const cleanPolygon = (points: Vec2[], path = 'spec.polygon'): Vec2[] => {
  if (!Array.isArray(points) || points.length < 3) {
    throw new CadSpecError(path, 'polygon needs at least 3 points')
  }
  const deduped: Vec2[] = []
  for (const raw of points) {
    const point = vec2(raw)
    const prev = deduped[deduped.length - 1]
    if (prev && nearlyEqual(prev, point)) continue
    deduped.push(point)
  }
  if (deduped.length >= 2 && nearlyEqual(deduped[0] ?? [0, 0], deduped[deduped.length - 1] ?? [0, 0])) {
    deduped.pop()
  }
  if (deduped.length < 3) {
    throw new CadSpecError(path, 'polygon collapsed below 3 unique points')
  }
  if (hasSelfIntersection(deduped)) {
    throw new CadSpecError(path, 'polygon is self-intersecting')
  }
  return ensureCcw(deduped)
}

const triangulate = (points: Vec2[], path = 'spec.polygon') => {
  const verts = cleanPolygon(points, path)
  const contour = verts.map((point) => new THREE.Vector2(point[0], point[1]))
  const tris = THREE.ShapeUtils.triangulateShape(contour, [])
  if (!Array.isArray(tris) || tris.length === 0) {
    throw new CadSpecError(path, 'polygon could not be triangulated')
  }
  return { verts, tris }
}

const pointInTriangle = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) => {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  if (Math.abs(area) < 1e-10) return false
  const s = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / area
  const t = ((c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0])) / area
  return s >= 0 && t >= 0 && s + t <= 1
}

const pointInPolygon = (point: Vec2, polygon: Vec2[]) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = vec2(polygon[i])
    const b = vec2(polygon[j])
    const intersects = a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1] + Number.EPSILON) + a[0]
    if (intersects) inside = !inside
  }
  return inside
}

const extrudeSolid = (polygon: Vec2[], height: number, path = 'spec.polygon'): KernelMesh => {
  const outer = cleanPolygon(polygon, path)
  const { verts, tris } = triangulate(outer, path)
  const positions: number[] = []
  const indices: number[] = []
  for (const [i0, i1, i2] of tris) {
    const a = vec2(verts[num(i0)])
    const b = vec2(verts[num(i1)])
    const c = vec2(verts[num(i2)])
    pushTriangle(positions, indices, [a[0], 0, a[1]], [b[0], 0, b[1]], [c[0], 0, c[1]])
    pushTriangle(positions, indices, [a[0], height, a[1]], [c[0], height, c[1]], [b[0], height, b[1]])
  }
  for (let i = 0; i < outer.length; i += 1) {
    const a = vec2(outer[i])
    const b = vec2(outer[(i + 1) % outer.length])
    pushTriangle(positions, indices, [a[0], 0, a[1]], [b[0], height, b[1]], [b[0], 0, b[1]])
    pushTriangle(positions, indices, [a[0], 0, a[1]], [a[0], height, a[1]], [b[0], height, b[1]])
  }
  return finishMesh(positions, indices)
}

const extrudeProfileXy = (polygon: Vec2[], zMin: number, zMax: number, path = 'spec.profileXY'): KernelMesh => {
  const outer = cleanPolygon(polygon, path)
  const { verts, tris } = triangulate(outer, path)
  const positions: number[] = []
  const indices: number[] = []
  for (const [i0, i1, i2] of tris) {
    const a = vec2(verts[num(i0)])
    const b = vec2(verts[num(i1)])
    const c = vec2(verts[num(i2)])
    pushTriangle(positions, indices, [a[0], a[1], zMin], [b[0], b[1], zMin], [c[0], c[1], zMin])
    pushTriangle(positions, indices, [a[0], a[1], zMax], [c[0], c[1], zMax], [b[0], b[1], zMax])
  }
  for (let i = 0; i < outer.length; i += 1) {
    const a = vec2(outer[i])
    const b = vec2(outer[(i + 1) % outer.length])
    pushTriangle(positions, indices, [a[0], a[1], zMin], [b[0], b[1], zMax], [b[0], b[1], zMin])
    pushTriangle(positions, indices, [a[0], a[1], zMin], [a[0], a[1], zMax], [b[0], b[1], zMax])
  }
  return finishMesh(positions, indices)
}

const extrudeProfileXz = (polygon: Vec2[], yMin: number, yMax: number, path = 'spec.profileXZ'): KernelMesh => {
  const height = Math.max(1e-4, yMax - yMin)
  const solid = extrudeSolid(polygon, height, path)
  return applyTransforms(solid, {
    op: 'box',
    size: [1, 1, 1],
    translate: [0, yMin, 0],
  })
}

const extrudeProfileZy = (polygon: Vec2[], xMin: number, xMax: number, path = 'spec.profileZY'): KernelMesh => {
  const outer = cleanPolygon(polygon, path)
  const { verts, tris } = triangulate(outer, path)
  const positions: number[] = []
  const indices: number[] = []
  for (const [i0, i1, i2] of tris) {
    const a = vec2(verts[num(i0)])
    const b = vec2(verts[num(i1)])
    const c = vec2(verts[num(i2)])
    pushTriangle(positions, indices, [xMin, a[1], a[0]], [xMin, b[1], b[0]], [xMin, c[1], c[0]])
    pushTriangle(positions, indices, [xMax, a[1], a[0]], [xMax, c[1], c[0]], [xMax, b[1], b[0]])
  }
  for (let i = 0; i < outer.length; i += 1) {
    const a = vec2(outer[i])
    const b = vec2(outer[(i + 1) % outer.length])
    pushTriangle(positions, indices, [xMin, a[1], a[0]], [xMax, b[1], b[0]], [xMin, b[1], b[0]])
    pushTriangle(positions, indices, [xMin, a[1], a[0]], [xMax, a[1], a[0]], [xMax, b[1], b[0]])
  }
  return finishMesh(positions, indices)
}

const rangeOf = (points: Vec2[], axis: 0 | 1) => {
  let min = Infinity
  let max = -Infinity
  for (const point of points) {
    min = Math.min(min, point[axis])
    max = Math.max(max, point[axis])
  }
  return { min, max }
}

type ProfileSolidSpec = {
  profileXY?: [number, number][]
  profileZY?: [number, number][]
  profileXZ?: [number, number][]
  sideProfile?: [number, number][]
  topProfile?: [number, number][]
  depthMargin?: number
}

const intersectProfilesMesh = (spec: ProfileSolidSpec, path = 'spec'): KernelMesh => {
  const sourceXY = spec.profileXY ?? spec.sideProfile
  const sourceXZ = spec.profileXZ ?? spec.topProfile
  const sourceZY = spec.profileZY
  const profiles = {
    xy: sourceXY ? cleanPolygon(sourceXY, `${path}.profileXY`) : undefined,
    xz: sourceXZ ? cleanPolygon(sourceXZ, `${path}.profileXZ`) : undefined,
    zy: sourceZY ? cleanPolygon(sourceZY, `${path}.profileZY`) : undefined,
  }
  const margin = Math.max(0.05, spec.depthMargin ?? 0.1)
  const solids: KernelMesh[] = []
  if (profiles.xy) {
    const z = profiles.xz
      ? rangeOf(profiles.xz, 1)
      : profiles.zy
        ? rangeOf(profiles.zy, 0)
        : { min: -1, max: 1 }
    solids.push(extrudeProfileXy(profiles.xy, z.min - margin, z.max + margin, `${path}.profileXY`))
  }
  if (profiles.xz) {
    const y = profiles.xy
      ? rangeOf(profiles.xy, 1)
      : profiles.zy
        ? rangeOf(profiles.zy, 1)
        : { min: -1, max: 1 }
    solids.push(extrudeProfileXz(profiles.xz, y.min - margin, y.max + margin, `${path}.profileXZ`))
  }
  if (profiles.zy) {
    const x = profiles.xy
      ? rangeOf(profiles.xy, 0)
      : profiles.xz
        ? rangeOf(profiles.xz, 0)
        : { min: -1, max: 1 }
    solids.push(extrudeProfileZy(profiles.zy, x.min - margin, x.max + margin, `${path}.profileZY`))
  }
  const [first, ...rest] = solids
  if (!first) throw new CadSpecError(path, 'intersect_profiles needs at least two profiles')
  return rest.reduce((current, child) => evaluateBoolean(current, child, 'intersection'), first)
}

const extrudeMesh = (polygon: Vec2[], holes: Vec2[][] = [], height: number): KernelMesh => {
  const outer = extrudeSolid(polygon, height)
  let mesh = outer
  let holeVolume = 0
  for (const hole of holes) {
    const solidHole = extrudeSolid(hole, height)
    holeVolume += solidHole.volume
    const cutter = applyTransforms(extrudeSolid(hole, height + 0.04), {
      op: 'box',
      size: [1, 1, 1],
      translate: [0, -0.02, 0],
    })
    mesh = evaluateBoolean(mesh, cutter, 'difference')
  }
  return holes.length > 0 ? { ...mesh, volume: Math.max(0, outer.volume - holeVolume) } : mesh
}

const revolvePoint = (x: number, y: number, angle: number): Vec3 => [Math.cos(angle) * x, y, Math.sin(angle) * x]

const revolveMesh = (profile: Vec2[], angleDeg = 360, segments = 32, path = 'spec.profile'): KernelMesh => {
  const ring = cleanPolygon(profile, path)
  const positions: number[] = []
  const indices: number[] = []
  const closed = angleDeg >= 360 - 1e-3
  const steps = Math.max(8, Math.round((segments * Math.min(angleDeg, 360)) / 360))
  const angle = ((closed ? 360 : angleDeg) * Math.PI) / 180
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * angle
    const a1 = i === steps - 1 && closed ? 0 : ((i + 1) / steps) * angle
    for (let p = 0; p < ring.length; p += 1) {
      const [x0, y0] = vec2(ring[p])
      const [x1, y1] = vec2(ring[(p + 1) % ring.length])
      const p00 = revolvePoint(x0, y0, a0)
      const p10 = revolvePoint(x0, y0, a1)
      const p01 = revolvePoint(x1, y1, a0)
      const p11 = revolvePoint(x1, y1, a1)
      pushTriangle(positions, indices, p00, p11, p10)
      pushTriangle(positions, indices, p00, p01, p11)
    }
  }
  if (!closed) {
    const { verts, tris } = triangulate(ring, path)
    for (const [i0, i1, i2] of tris) {
      const a = vec2(verts[num(i0)])
      const b = vec2(verts[num(i1)])
      const c = vec2(verts[num(i2)])
      pushTriangle(positions, indices, revolvePoint(a[0], a[1], 0), revolvePoint(b[0], b[1], 0), revolvePoint(c[0], c[1], 0))
      pushTriangle(positions, indices, revolvePoint(a[0], a[1], angle), revolvePoint(c[0], c[1], angle), revolvePoint(b[0], b[1], angle))
    }
  }
  return finishMesh(positions, indices)
}

export const countOpenEdges = (mesh: KernelMesh) => {
  const counts = new Map<string, number>()
  const vertexKey = (index: number) => {
    const [x, y, z] = vertexAt(mesh.positions, index)
    return `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`
  }
  const edgeKey = (a: number, b: number) => {
    const left = vertexKey(a)
    const right = vertexKey(b)
    return left < right ? `${left}|${right}` : `${right}|${left}`
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = num(mesh.indices[i])
    const b = num(mesh.indices[i + 1])
    const c = num(mesh.indices[i + 2])
    for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.values()].filter((count) => count === 1).length
}

const csgEvaluator = new Evaluator()
csgEvaluator.attributes = ['position', 'normal']

const meshToBrush = (mesh: KernelMesh): Brush => {
  const geometry = new THREE.BufferGeometry()
  const vertexCount = mesh.positions.length / 3
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 2), 2))
  geometry.setIndex(mesh.indices)
  geometry.computeVertexNormals()
  const brush = new Brush(geometry)
  brush.updateMatrixWorld()
  return brush
}

const brushToMesh = (brush: Brush): KernelMesh => {
  const geometry = brush.geometry
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  if (!position) throw new Error('CSG result has no position attribute.')
  const positions = Array.from(position.array)
  const indices = index ? Array.from(index.array) : [...Array(positions.length / 3).keys()]
  geometry.dispose()
  return finishMesh(positions, indices)
}

const weldByPosition = (mesh: KernelMesh): KernelMesh => {
  const map = new Map<string, number>()
  const positions: number[] = []
  const remap = new Map<number, number>()
  const count = mesh.positions.length / 3
  for (let index = 0; index < count; index += 1) {
    const x = mesh.positions[index * 3] ?? 0
    const y = mesh.positions[index * 3 + 1] ?? 0
    const z = mesh.positions[index * 3 + 2] ?? 0
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
    let id = map.get(key)
    if (id === undefined) {
      id = positions.length / 3
      map.set(key, id)
      positions.push(x, y, z)
    }
    remap.set(index, id)
  }
  return finishMesh(
    positions,
    mesh.indices.map((index) => remap.get(index) ?? index),
  )
}

const reverseWinding = (mesh: KernelMesh): KernelMesh => {
  const indices = [...mesh.indices]
  for (let index = 0; index < indices.length; index += 3) {
    const swap = indices[index + 1]
    indices[index + 1] = indices[index + 2] ?? 0
    indices[index + 2] = swap ?? 0
  }
  return finishMesh(mesh.positions, indices)
}

const evaluateBoolean = (left: KernelMesh, right: KernelMesh, op: 'union' | 'difference' | 'intersection') => {
  const operation = op === 'union' ? ADDITION : op === 'difference' ? SUBTRACTION : INTERSECTION
  const a = meshToBrush(left)
  const b = meshToBrush(right)
  try {
    const result = csgEvaluator.evaluate(a, b, operation)
    a.geometry.dispose()
    b.geometry.dispose()
    const mesh = brushToMesh(result)
    if (mesh.positions.length === 0) {
      throw new Error(`CAD ${op} produced an empty solid.`)
    }
    const oriented = rawSignedVolume(mesh.positions, mesh.indices) < 0 ? reverseWinding(mesh) : mesh
    if (countOpenEdges(oriented) === 0) return oriented
    const welded = weldByPosition(oriented)
    return countOpenEdges(welded) < countOpenEdges(oriented) ? welded : oriented
  } catch (error) {
    a.geometry.dispose()
    b.geometry.dispose()
    throw new Error(
      error instanceof Error
        ? `CAD ${op} failed: ${error.message}`
        : `CAD ${op} failed.`,
    )
  }
}

const mergeMeshes = (meshes: KernelMesh[]): KernelMesh => {
  const positions: number[] = []
  const indices: number[] = []
  for (const mesh of meshes) {
    const offset = positions.length / 3
    positions.push(...mesh.positions)
    indices.push(...mesh.indices.map((index) => index + offset))
  }
  return finishMesh(positions, indices)
}

const resampleClosed = (polygon: Vec2[], count: number): Vec2[] => {
  const n = polygon.length
  const segments: number[] = []
  let total = 0
  for (let i = 0; i < n; i += 1) {
    const a = vec2(polygon[i])
    const b = vec2(polygon[(i + 1) % n])
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1])
    segments.push(distance)
    total += distance
  }
  if (total < 1e-12) {
    return Array.from({ length: count }, () => vec2(polygon[0]))
  }
  const sampled: Vec2[] = []
  for (let i = 0; i < count; i += 1) {
    const target = (i / count) * total
    let accumulated = 0
    let segment = 0
    while (segment < n && accumulated + (segments[segment] ?? 0) < target - 1e-12) {
      accumulated += segments[segment] ?? 0
      segment += 1
    }
    const segmentLength = segments[segment % n] ?? 1
    const t = segmentLength < 1e-12 ? 0 : (target - accumulated) / segmentLength
    const a = vec2(polygon[segment % n])
    const b = vec2(polygon[(segment + 1) % n])
    sampled.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return sampled
}

const ringDistance = (left: Vec2[], right: Vec2[], shift: number) => {
  let distance = 0
  for (let i = 0; i < left.length; i += 1) {
    const a = vec2(left[i])
    const b = vec2(right[(i + shift) % right.length])
    distance += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  }
  return distance
}

const alignRing = (previous: Vec2[], next: Vec2[]): Vec2[] => {
  let bestShift = 0
  let best = Infinity
  for (let shift = 0; shift < next.length; shift += 1) {
    const distance = ringDistance(previous, next, shift)
    if (distance < best) {
      best = distance
      bestShift = shift
    }
  }
  const reversed = [...next].reverse()
  let bestReverseShift = 0
  let bestReverse = Infinity
  for (let shift = 0; shift < reversed.length; shift += 1) {
    const distance = ringDistance(previous, reversed, shift)
    if (distance < bestReverse) {
      bestReverse = distance
      bestReverseShift = shift
    }
  }
  const source = bestReverse < best ? reversed : next
  const shift = bestReverse < best ? bestReverseShift : bestShift
  return source.map((_, index) => vec2(source[(index + shift) % source.length]))
}

const sectionToWorld = (point: Vec2, along: number, axis: 'x' | 'y' | 'z'): Vec3 => {
  if (axis === 'x') return [along, point[1], point[0]]
  if (axis === 'z') return [point[0], point[1], along]
  return [point[0], along, point[1]]
}

const loftMesh = (
  spec: Extract<CadSolidSpec, { op: 'loft' }>,
  path = 'spec',
): KernelMesh => {
  const cleaned = spec.sections.map((section, index) => cleanPolygon(section, `${path}.sections[${index}]`))
  if (cleaned.length < 2) {
    throw new CadSpecError(`${path}.sections`, 'loft needs at least two sections')
  }
  const first = cleaned[0] ?? []
  const defaultSpan = Math.max(0.2, rangeOf(first, 0).max - rangeOf(first, 0).min, rangeOf(first, 1).max - rangeOf(first, 1).min)
  const span = spec.span ?? defaultSpan
  const heights =
    spec.heights ??
    cleaned.map((_, index) => (cleaned.length === 1 ? 0 : (index / (cleaned.length - 1)) * span))
  const sampleCount = Math.max(8, ...cleaned.map((section) => section.length))
  const rings = cleaned.map((section) => resampleClosed(section, sampleCount))
  for (let i = 1; i < rings.length; i += 1) {
    rings[i] = alignRing(rings[i - 1] ?? [], rings[i] ?? [])
  }
  const axis = spec.axis ?? 'y'
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < rings.length - 1; i += 1) {
    const lower = rings[i] ?? []
    const upper = rings[i + 1] ?? []
    const along0 = heights[i] ?? i
    const along1 = heights[i + 1] ?? i + 1
    for (let p = 0; p < sampleCount; p += 1) {
      const p0 = sectionToWorld(vec2(lower[p]), along0, axis)
      const p1 = sectionToWorld(vec2(lower[(p + 1) % sampleCount]), along0, axis)
      const p2 = sectionToWorld(vec2(upper[(p + 1) % sampleCount]), along1, axis)
      const p3 = sectionToWorld(vec2(upper[p]), along1, axis)
      pushTriangle(positions, indices, p0, p2, p1)
      pushTriangle(positions, indices, p0, p3, p2)
    }
  }
  const capRing = (ring: Vec2[], along: number, flip: boolean) => {
    const { verts, tris } = triangulate(ring, `${path}.sections`)
    for (const [i0, i1, i2] of tris) {
      const a = sectionToWorld(vec2(verts[num(i0)]), along, axis)
      const b = sectionToWorld(vec2(verts[num(i1)]), along, axis)
      const c = sectionToWorld(vec2(verts[num(i2)]), along, axis)
      if (flip) pushTriangle(positions, indices, a, c, b)
      else pushTriangle(positions, indices, a, b, c)
    }
  }
  const start = rings[0]
  const end = rings[rings.length - 1]
  if (start) capRing(start, heights[0] ?? 0, false)
  if (end) capRing(end, heights[heights.length - 1] ?? span, true)
  return finishMesh(positions, indices)
}

const torusMesh = (major: number, minor: number, radial = 32, tubular = 24): KernelMesh => {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < radial; i += 1) {
    const u = (i / radial) * Math.PI * 2
    for (let j = 0; j < tubular; j += 1) {
      const v = (j / tubular) * Math.PI * 2
      positions.push(
        (major + minor * Math.cos(v)) * Math.cos(u),
        minor * Math.sin(v) + minor,
        (major + minor * Math.cos(v)) * Math.sin(u),
      )
    }
  }
  for (let i = 0; i < radial; i += 1) {
    const i1 = (i + 1) % radial
    for (let j = 0; j < tubular; j += 1) {
      const j1 = (j + 1) % tubular
      const a = i * tubular + j
      const b = i1 * tubular + j
      const c = i1 * tubular + j1
      const d = i * tubular + j1
      indices.push(a, c, b, a, d, c)
    }
  }
  return finishMesh(positions, indices)
}

const capsuleMesh = (radius: number, height: number, segments = 32): KernelMesh => {
  const hemi = 12
  const profile: Vec2[] = []
  for (let i = 0; i <= hemi; i += 1) {
    const t = (i / hemi) * (Math.PI / 2)
    profile.push([Math.sin(t) * radius, radius - Math.cos(t) * radius])
  }
  for (let i = 0; i <= hemi; i += 1) {
    const t = (i / hemi) * (Math.PI / 2)
    profile.push([Math.cos(t) * radius, radius + height + Math.sin(t) * radius])
  }
  profile.push([0, 2 * radius + height], [0, 0])
  return revolveMesh(profile, 360, segments, 'spec')
}

const ellipsoidMesh = (radii: Vec3, segments = 32): KernelMesh => {
  const profile: Vec2[] = []
  for (let i = 0; i <= 24; i += 1) {
    const t = (i / 24) * Math.PI
    profile.push([Math.sin(t), 1 - Math.cos(t)])
  }
  const unit = revolveMesh(profile, 360, segments, 'spec')
  const positions: number[] = []
  for (let i = 0; i < unit.positions.length; i += 3) {
    positions.push(num(unit.positions[i]) * radii[0], num(unit.positions[i + 1]) * radii[1], num(unit.positions[i + 2]) * radii[2])
  }
  return finishMesh(positions, unit.indices)
}

const evaluateNode = (spec: CadSolidSpec, path = 'spec'): KernelMesh => {
  let mesh: KernelMesh
  switch (spec.op) {
    case 'box':
      mesh = boxMesh(spec.size)
      break
    case 'cylinder':
      mesh = cylinderMesh(spec.r, spec.h, spec.r2)
      break
    case 'sphere':
      mesh = sphereMesh(spec.r)
      break
    case 'extrude':
      mesh = extrudeMesh(spec.polygon, spec.holes, spec.height)
      break
    case 'revolve':
      mesh = revolveMesh(spec.profile, spec.angle, 32, `${path}.profile`)
      break
    case 'union': {
      const [first, ...rest] = spec.children
      if (!first) throw new CadSpecError(`${path}.children`, 'union needs a base solid.')
      mesh = rest.reduce(
        (current: KernelMesh, child: CadSolidSpec, index) =>
          evaluateBoolean(current, evaluateNode(child, `${path}.children[${index + 1}]`), 'union'),
        evaluateNode(first, `${path}.children[0]`),
      )
      break
    }
    case 'group': {
      if (spec.children.length === 0) throw new CadSpecError(`${path}.children`, 'group needs at least one solid.')
      mesh = mergeMeshes(spec.children.map((child, index) => evaluateNode(child, `${path}.children[${index}]`)))
      break
    }
    case 'difference': {
      const [first, ...rest] = spec.children
      if (!first) throw new CadSpecError(`${path}.children`, 'difference needs a base solid.')
      mesh = rest.reduce(
        (current: KernelMesh, child: CadSolidSpec, index) =>
          evaluateBoolean(current, evaluateNode(child, `${path}.children[${index + 1}]`), 'difference'),
        evaluateNode(first, `${path}.children[0]`),
      )
      break
    }
    case 'intersection': {
      const [first, ...rest] = spec.children
      if (!first) throw new CadSpecError(`${path}.children`, 'intersection needs a base solid.')
      mesh = rest.reduce(
        (current: KernelMesh, child: CadSolidSpec, index) =>
          evaluateBoolean(current, evaluateNode(child, `${path}.children[${index + 1}]`), 'intersection'),
        evaluateNode(first, `${path}.children[0]`),
      )
      break
    }
    case 'intersect_profiles':
      mesh = intersectProfilesMesh(spec, path)
      break
    case 'mirror': {
      const child = evaluateNode(spec.child, `${path}.child`)
      const axis = spec.axis === 'x' ? 0 : spec.axis === 'y' ? 1 : 2
      const positions = child.positions.map((value, index) => (index % 3 === axis ? -value : value))
      const indices = [...child.indices]
      for (let i = 0; i < indices.length; i += 3) {
        const tmp = indexAt(indices, i + 1)
        indices[i + 1] = indexAt(indices, i + 2)
        indices[i + 2] = tmp
      }
      mesh = mergeMeshes([child, finishMesh(positions, indices)])
      break
    }
    case 'linearArray': {
      const child = evaluateNode(spec.child, `${path}.child`)
      mesh = mergeMeshes(
        Array.from({ length: spec.count }, (_, index) =>
          applyTransforms(child, { op: 'box', size: [1, 1, 1], translate: scale(spec.offset, index) }),
        ),
      )
      break
    }
    case 'polarArray': {
      const child = evaluateNode(spec.child, `${path}.child`)
      mesh = mergeMeshes(
        Array.from({ length: spec.count }, (_, index) => {
          const angle = (index / spec.count) * Math.PI * 2
          const rotate: Vec3 =
            spec.axis === 'x' ? [angle, 0, 0] : spec.axis === 'z' ? [0, 0, angle] : [0, angle, 0]
          return applyTransforms(child, { op: 'box', size: [1, 1, 1], rotate })
        }),
      )
      break
    }
    case 'loft':
      mesh = loftMesh(spec, path)
      break
    case 'hull':
      mesh = intersectProfilesMesh(spec, path)
      break
    case 'torus':
      mesh = torusMesh(spec.R, spec.r)
      break
    case 'capsule':
      mesh = capsuleMesh(spec.r, spec.h)
      break
    case 'ellipsoid':
      mesh = ellipsoidMesh(spec.radii)
      break
    default:
      throw new Error('Unsupported CAD solid operation.')
  }
  return applyTransforms(mesh, spec)
}

export const evaluateCadSolidSpec = (input: unknown, options?: { budget?: number }): KernelMesh => {
  const parsed = CadSolidSpecSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue ? ['spec', ...issue.path].join('.') : 'spec'
    throw new CadSpecError(path, issue?.message ?? 'invalid solid spec')
  }
  const mesh = evaluateNode(parsed.data, 'spec')
  if (mesh.positions.length === 0) {
    throw new CadSpecError('spec', 'CAD solid spec produced an empty mesh.')
  }
  enforceBudget(mesh, options?.budget ?? KERNEL_TRIANGLE_BUDGET)
  return mesh
}

export const evaluateCadSolidSpecCached = (input: unknown, options?: { budget?: number }): KernelMesh => {
  const parsed = CadSolidSpecSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue ? ['spec', ...issue.path].join('.') : 'spec'
    throw new CadSpecError(path, issue?.message ?? 'invalid solid spec')
  }
  const key = hashCadSolidSpec(parsed.data)
  const cached = meshCache.get(key)
  if (cached) {
    enforceBudget(cached, options?.budget ?? KERNEL_TRIANGLE_BUDGET)
    return cached
  }
  const mesh = evaluateNode(parsed.data, 'spec')
  if (mesh.positions.length === 0) {
    throw new CadSpecError('spec', 'CAD solid spec produced an empty mesh.')
  }
  enforceBudget(mesh, options?.budget ?? KERNEL_TRIANGLE_BUDGET)
  meshCache.set(key, mesh)
  return mesh
}

export const validateCadSolidSpec = (input: unknown) => CadSolidSpecSchema.safeParse(input)
