import * as THREE from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'
import { CadSolidSpecSchema, type CadSolidSpec } from './solid-spec'

export type KernelMesh = {
  positions: number[]
  indices: number[]
  volume: number
  bbox: [[number, number, number], [number, number, number]]
}

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
    volume: signedVolume(positions, indices),
    bbox: [min, max],
  }
}

const signedVolume = (positions: number[], indices: number[]) => {
  let volume = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertexAt(positions, indices[i])
    const b = vertexAt(positions, indices[i + 1])
    const c = vertexAt(positions, indices[i + 2])
    volume += dot(a, cross(b, c)) / 6
  }
  return Math.abs(volume)
}

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
    pushTriangle(positions, indices, b0, b1, t1)
    pushTriangle(positions, indices, b0, t1, t0)
    pushTriangle(positions, indices, bottom, b1, b0)
    pushTriangle(positions, indices, top, t0, t1)
  }
  return finishMesh(positions, indices)
}

const sphereMesh = (r: number, segments = 24): KernelMesh => {
  const positions: number[] = []
  const indices: number[] = []
  for (let y = 0; y < segments; y += 1) {
    const v0 = y / segments
    const v1 = (y + 1) / segments
    const y0 = Math.cos(v0 * Math.PI) * r + r
    const y1 = Math.cos(v1 * Math.PI) * r + r
    const r0 = Math.sin(v0 * Math.PI) * r
    const r1 = Math.sin(v1 * Math.PI) * r
    for (let x = 0; x < segments; x += 1) {
      const a0 = (x / segments) * Math.PI * 2
      const a1 = ((x + 1) / segments) * Math.PI * 2
      const p00: Vec3 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0]
      const p10: Vec3 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0]
      const p01: Vec3 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1]
      const p11: Vec3 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1]
      if (r0 > 1e-8) pushTriangle(positions, indices, p00, p10, p11)
      if (r1 > 1e-8) pushTriangle(positions, indices, p00, p11, p01)
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

const triangulate = (points: Vec2[]) => {
  const verts = ensureCcw(points)
  const remaining = verts.map((_, index) => index)
  const tris: number[][] = []
  let guard = 0
  while (remaining.length > 3 && guard < verts.length * verts.length) {
    guard += 1
    let clipped = false
    for (let i = 0; i < remaining.length; i += 1) {
      const i0 = remaining[(i + remaining.length - 1) % remaining.length]
      const i1 = remaining[i]
      const i2 = remaining[(i + 1) % remaining.length]
      const a = vec2(verts[num(i0)])
      const b = vec2(verts[num(i1)])
      const c = vec2(verts[num(i2)])
      const cross2 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      if (cross2 <= 1e-8) continue
      const hasPoint = remaining.some((index) => {
        if (index === i0 || index === i1 || index === i2) return false
        return pointInTriangle(vec2(verts[index]), a, b, c)
      })
      if (hasPoint) continue
      tris.push([num(i0), num(i1), num(i2)])
      remaining.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (remaining.length === 3) tris.push([num(remaining[0]), num(remaining[1]), num(remaining[2])])
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

const extrudeSolid = (polygon: Vec2[], height: number): KernelMesh => {
  const outer = ensureCcw(polygon)
  const { verts, tris } = triangulate(outer)
  const positions: number[] = []
  const indices: number[] = []
  for (const [i0, i1, i2] of tris) {
    const a = vec2(verts[num(i0)])
    const b = vec2(verts[num(i1)])
    const c = vec2(verts[num(i2)])
    pushTriangle(positions, indices, [a[0], 0, a[1]], [c[0], 0, c[1]], [b[0], 0, b[1]])
    pushTriangle(positions, indices, [a[0], height, a[1]], [b[0], height, b[1]], [c[0], height, c[1]])
  }
  for (let i = 0; i < outer.length; i += 1) {
    const a = vec2(outer[i])
    const b = vec2(outer[(i + 1) % outer.length])
    pushTriangle(positions, indices, [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], height, b[1]])
    pushTriangle(positions, indices, [a[0], 0, a[1]], [b[0], height, b[1]], [a[0], height, a[1]])
  }
  return finishMesh(positions, indices)
}

const extrudeProfileXy = (polygon: Vec2[], zMin: number, zMax: number): KernelMesh => {
  const outer = ensureCcw(polygon)
  const { verts, tris } = triangulate(outer)
  const positions: number[] = []
  const indices: number[] = []
  for (const [i0, i1, i2] of tris) {
    const a = vec2(verts[num(i0)])
    const b = vec2(verts[num(i1)])
    const c = vec2(verts[num(i2)])
    pushTriangle(positions, indices, [a[0], a[1], zMin], [c[0], c[1], zMin], [b[0], b[1], zMin])
    pushTriangle(positions, indices, [a[0], a[1], zMax], [b[0], b[1], zMax], [c[0], c[1], zMax])
  }
  for (let i = 0; i < outer.length; i += 1) {
    const a = vec2(outer[i])
    const b = vec2(outer[(i + 1) % outer.length])
    pushTriangle(positions, indices, [a[0], a[1], zMin], [b[0], b[1], zMin], [b[0], b[1], zMax])
    pushTriangle(positions, indices, [a[0], a[1], zMin], [b[0], b[1], zMax], [a[0], a[1], zMax])
  }
  return finishMesh(positions, indices)
}

const extrudeProfileXz = (polygon: Vec2[], yMin: number, yMax: number): KernelMesh => {
  const height = Math.max(1e-4, yMax - yMin)
  const solid = extrudeSolid(polygon, height)
  return applyTransforms(solid, {
    op: 'box',
    size: [1, 1, 1],
    translate: [0, yMin, 0],
  })
}

const intersectProfilesMesh = (
  sideProfile: Vec2[],
  topProfile: Vec2[],
  depthMargin = 0.1,
): KernelMesh => {
  let sideMinY = Infinity
  let sideMaxY = -Infinity
  for (const pt of sideProfile) {
    sideMinY = Math.min(sideMinY, pt[1])
    sideMaxY = Math.max(sideMaxY, pt[1])
  }

  let topMinZ = Infinity
  let topMaxZ = -Infinity
  for (const pt of topProfile) {
    topMinZ = Math.min(topMinZ, pt[1])
    topMaxZ = Math.max(topMaxZ, pt[1])
  }

  const margin = Math.max(0.05, depthMargin)
  const zMin = topMinZ - margin
  const zMax = topMaxZ + margin
  const yMin = sideMinY - margin
  const yMax = sideMaxY + margin

  const sideSolid = extrudeProfileXy(sideProfile, zMin, zMax)
  const topSolid = extrudeProfileXz(topProfile, yMin, yMax)

  return evaluateBoolean(sideSolid, topSolid, 'intersection')
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

const revolveMesh = (profile: Vec2[], angleDeg = 360, segments = 32): KernelMesh => {
  const positions: number[] = []
  const indices: number[] = []
  const steps = Math.max(8, Math.round((segments * angleDeg) / 360))
  const angle = (angleDeg * Math.PI) / 180
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * angle
    const a1 = ((i + 1) / steps) * angle
    for (let p = 0; p < profile.length - 1; p += 1) {
      const [x0, y0] = vec2(profile[p])
      const [x1, y1] = vec2(profile[p + 1])
      const p00: Vec3 = [Math.cos(a0) * x0, y0, Math.sin(a0) * x0]
      const p10: Vec3 = [Math.cos(a1) * x0, y0, Math.sin(a1) * x0]
      const p01: Vec3 = [Math.cos(a0) * x1, y1, Math.sin(a0) * x1]
      const p11: Vec3 = [Math.cos(a1) * x1, y1, Math.sin(a1) * x1]
      pushTriangle(positions, indices, p00, p10, p11)
      pushTriangle(positions, indices, p00, p11, p01)
    }
  }
  return finishMesh(positions, indices)
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
    return mesh
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

const evaluateNode = (spec: CadSolidSpec): KernelMesh => {
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
      mesh = revolveMesh(spec.profile, spec.angle)
      break
    case 'union': {
      const [first, ...rest] = spec.children
      if (!first) throw new Error('union needs a base solid.')
      mesh = rest.reduce(
        (current: KernelMesh, child: CadSolidSpec) => evaluateBoolean(current, evaluateNode(child), 'union'),
        evaluateNode(first),
      )
      break
    }
    case 'difference': {
      const [first, ...rest] = spec.children
      if (!first) throw new Error('difference needs a base solid.')
      mesh = rest.reduce(
        (current: KernelMesh, child: CadSolidSpec) => evaluateBoolean(current, evaluateNode(child), 'difference'),
        evaluateNode(first),
      )
      break
    }
    case 'intersection': {
      const [first, ...rest] = spec.children
      if (!first) throw new Error('intersection needs a base solid.')
      mesh = rest.reduce(
        (current: KernelMesh, child: CadSolidSpec) => evaluateBoolean(current, evaluateNode(child), 'intersection'),
        evaluateNode(first),
      )
      break
    }
    case 'intersect_profiles':
      mesh = intersectProfilesMesh(spec.sideProfile, spec.topProfile, spec.depthMargin)
      break
    case 'mirror': {
      const child = evaluateNode(spec.child)
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
      const child = evaluateNode(spec.child)
      mesh = mergeMeshes(
        Array.from({ length: spec.count }, (_, index) =>
          applyTransforms(child, { op: 'box', size: [1, 1, 1], translate: scale(spec.offset, index) }),
        ),
      )
      break
    }
    case 'polarArray': {
      const child = evaluateNode(spec.child)
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
    default:
      throw new Error('Unsupported CAD solid operation.')
  }
  return applyTransforms(mesh, spec)
}

export const evaluateCadSolidSpec = (input: unknown): KernelMesh => {
  const spec = CadSolidSpecSchema.parse(input)
  const mesh = evaluateNode(spec)
  if (mesh.positions.length === 0) {
    throw new Error('CAD solid spec produced an empty mesh.')
  }
  return mesh
}

export const validateCadSolidSpec = (input: unknown) => CadSolidSpecSchema.safeParse(input)
