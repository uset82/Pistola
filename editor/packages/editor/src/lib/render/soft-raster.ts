import { projectPointToView, type OrthoViewName } from '../cad/views'
import type { StructurePart } from '../structure'

export const PART_HUES = [
  [37, 99, 235],
  [8, 145, 178],
  [5, 150, 105],
  [202, 138, 4],
  [220, 38, 38],
  [124, 58, 237],
  [234, 88, 12],
  [219, 39, 119],
] as const

export type RasterView = {
  name: OrthoViewName
  width: number
  height: number
  rgba: Uint8ClampedArray
  ids: Int32Array
  mask: Uint8Array
}

const fillBg = (rgba: Uint8ClampedArray) => {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 248
    rgba[i + 1] = 250
    rgba[i + 2] = 252
    rgba[i + 3] = 255
  }
}

const put = (rgba: Uint8ClampedArray, width: number, x: number, y: number, rgb: readonly [number, number, number]) => {
  if (x < 0 || y < 0 || x >= width) return
  const i = (y * width + x) * 4
  rgba[i] = rgb[0]
  rgba[i + 1] = rgb[1]
  rgba[i + 2] = rgb[2]
  rgba[i + 3] = 255
}

const barycentric = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  px: number,
  py: number,
) => {
  const v0x = bx - ax
  const v0y = by - ay
  const v1x = cx - ax
  const v1y = cy - ay
  const v2x = px - ax
  const v2y = py - ay
  const den = v0x * v1y - v1x * v0y
  if (Math.abs(den) < 1e-12) return null
  const v = (v2x * v1y - v1x * v2y) / den
  const w = (v0x * v2y - v2x * v0y) / den
  const u = 1 - v - w
  if (u < -1e-5 || v < -1e-5 || w < -1e-5) return null
  return { u, v, w }
}

export type RasterFrame = { minU: number; minV: number; maxU: number; maxV: number }

export const rasterizeParts = (
  parts: StructurePart[],
  view: OrthoViewName,
  size = 128,
  frame?: RasterFrame,
): RasterView => {
  const rgba = new Uint8ClampedArray(size * size * 4)
  const ids = new Int32Array(size * size).fill(-1)
  const depth = new Float32Array(size * size).fill(Number.POSITIVE_INFINITY)
  const mask = new Uint8Array(size * size)
  fillBg(rgba)

  const projected = parts.flatMap((part, partIndex) => {
    const points: Array<[number, number, number]> = []
    for (let i = 0; i < part.mesh.positions.length; i += 3) {
      const x = part.mesh.positions[i] ?? 0
      const y = part.mesh.positions[i + 1] ?? 0
      const z = part.mesh.positions[i + 2] ?? 0
      const [u, v] = projectPointToView([x, y, z], view)
      points.push([u, v, view === 'front' ? z : view === 'side' ? x : view === 'top' ? y : x + y + z])
    }
    return [{ part, partIndex, points }]
  })

  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (const entry of projected) {
    for (const point of entry.points) {
      minU = Math.min(minU, point[0])
      maxU = Math.max(maxU, point[0])
      minV = Math.min(minV, point[1])
      maxV = Math.max(maxV, point[1])
    }
  }
  if (frame) {
    minU = frame.minU
    minV = frame.minV
    maxU = frame.maxU
    maxV = frame.maxV
  } else if (!Number.isFinite(minU)) {
    return { name: view, width: size, height: size, rgba, ids, mask }
  } else {
    const pad = Math.max(0.1, 0.08 * Math.max(maxU - minU, maxV - minV, 0.2))
    minU -= pad
    minV -= pad
    maxU += pad
    maxV += pad
  }
  const spanU = Math.max(maxU - minU, 1e-6)
  const spanV = Math.max(maxV - minV, 1e-6)
  const toPixel = (u: number, v: number): [number, number] => [
    Math.round(((u - minU) / spanU) * (size - 1)),
    Math.round((1 - (v - minV) / spanV) * (size - 1)),
  ]

  for (const entry of projected) {
    const hue = PART_HUES[entry.partIndex % PART_HUES.length] ?? PART_HUES[0]
    const indices = entry.part.mesh.indices
    for (let i = 0; i < indices.length; i += 3) {
      const a = entry.points[indices[i] ?? 0]
      const b = entry.points[indices[i + 1] ?? 0]
      const c = entry.points[indices[i + 2] ?? 0]
      if (!a || !b || !c) continue
      const pa = toPixel(a[0], a[1])
      const pb = toPixel(b[0], b[1])
      const pc = toPixel(c[0], c[1])
      const minX = Math.max(0, Math.min(pa[0], pb[0], pc[0]))
      const maxX = Math.min(size - 1, Math.max(pa[0], pb[0], pc[0]))
      const minY = Math.max(0, Math.min(pa[1], pb[1], pc[1]))
      const maxY = Math.min(size - 1, Math.max(pa[1], pb[1], pc[1]))
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const hit = barycentric(pa[0], pa[1], pb[0], pb[1], pc[0], pc[1], x, y)
          if (!hit) continue
          const z = hit.u * a[2] + hit.v * b[2] + hit.w * c[2]
          const index = y * size + x
          if (z >= (depth[index] ?? Infinity)) continue
          depth[index] = z
          ids[index] = entry.partIndex
          mask[index] = 1
          put(rgba, size, x, y, hue)
        }
      }
    }
  }

  return { name: view, width: size, height: size, rgba, ids, mask }
}

export const drawGrid = (view: RasterView, meters = 0.1) => {
  void meters
  const { rgba, width, height, mask } = view
  const ink = (x: number, y: number, rgb: readonly [number, number, number]) => {
    if (mask[y * width + x]) return
    put(rgba, width, x, y, rgb)
  }
  for (let x = 0; x < width; x += 16) {
    for (let y = 0; y < height; y += 1) ink(x, y, [226, 232, 240])
  }
  for (let y = 0; y < height; y += 16) {
    for (let x = 0; x < width; x += 1) ink(x, y, [226, 232, 240])
  }
  for (let x = 0; x < width; x += 1) put(rgba, width, x, height - 2, [15, 23, 42])
}

export const fillPolygonMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  polygon: Array<[number, number]>,
  frame: RasterFrame,
) => {
  if (polygon.length < 3) return mask
  const spanU = Math.max(frame.maxU - frame.minU, 1e-6)
  const spanV = Math.max(frame.maxV - frame.minV, 1e-6)
  const toPixel = (u: number, v: number): [number, number] => [
    ((u - frame.minU) / spanU) * (width - 1),
    (1 - (v - frame.minV) / spanV) * (height - 1),
  ]
  const pts = polygon.map(([u, v]) => toPixel(u, v))
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((point) => point[1]))))
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...pts.map((point) => point[1]))))
  for (let y = minY; y <= maxY; y += 1) {
    const hits: number[] = []
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]!
      const b = pts[(i + 1) % pts.length]!
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1] || 1)
        hits.push(a[0] + t * (b[0] - a[0]))
      }
    }
    hits.sort((left, right) => left - right)
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const x0 = Math.max(0, Math.floor(hits[i] ?? 0))
      const x1 = Math.min(width - 1, Math.ceil(hits[i + 1] ?? 0))
      for (let x = x0; x <= x1; x += 1) mask[y * width + x] = 1
    }
  }
  return mask
}

export const maskIou = (a: Uint8Array, b: Uint8Array) => {
  let inter = 0
  let union = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 1) {
    const left = a[i] ? 1 : 0
    const right = b[i] ? 1 : 0
    inter += left & right
    union += left | right
  }
  return union === 0 ? 1 : inter / union
}
