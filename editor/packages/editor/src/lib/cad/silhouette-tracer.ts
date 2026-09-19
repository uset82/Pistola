/**
 * Pure TypeScript Silhouette Tracer
 * Extracts 2D closed polygon contours from raster pixel grids (Canvas ImageData or raw RGB/RGBA buffers)
 * using Moore-Neighbor boundary tracing and Ramer-Douglas-Peucker polygon simplification.
 */

export type PixelGrid = {
  width: number
  height: number
  data: Uint8ClampedArray | number[]
}

export type TraceProfileOptions = {
  widthM?: number
  heightM?: number
  epsilon?: number
  threshold?: number
  origin?: 'center' | 'bottom-center'
}

export type TracedProfile = {
  points: [number, number][]
  widthM: number
  heightM: number
  pointCount: number
  pixelBbox: [number, number, number, number]
}

const DIRS: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
]

export const getPixelAt = (grid: PixelGrid, x: number, y: number): [number, number, number, number] => {
  const index = (y * grid.width + x) * 4
  return [
    grid.data[index] ?? 0,
    grid.data[index + 1] ?? 0,
    grid.data[index + 2] ?? 0,
    grid.data[index + 3] ?? 255,
  ]
}

export const createForegroundMask = (grid: PixelGrid, threshold = 40): boolean[][] => {
  const { width, height } = grid
  const corners: [number, number, number, number][] = [
    getPixelAt(grid, 0, 0),
    getPixelAt(grid, width - 1, 0),
    getPixelAt(grid, 0, height - 1),
    getPixelAt(grid, width - 1, height - 1),
  ]

  const transparentCorners = corners.filter((c) => c[3] < 128).length
  if (transparentCorners >= 2) {
    const mask: boolean[][] = []
    for (let y = 0; y < height; y++) {
      const row: boolean[] = []
      for (let x = 0; x < width; x++) {
        row.push(getPixelAt(grid, x, y)[3] >= 128)
      }
      mask.push(row)
    }
    return mask
  }

  const bgR = corners.reduce((acc, c) => acc + c[0], 0) / corners.length
  const bgG = corners.reduce((acc, c) => acc + c[1], 0) / corners.length
  const bgB = corners.reduce((acc, c) => acc + c[2], 0) / corners.length
  const threshSq = threshold * threshold

  const mask: boolean[][] = []
  for (let y = 0; y < height; y++) {
    const row: boolean[] = []
    for (let x = 0; x < width; x++) {
      const px = getPixelAt(grid, x, y)
      if (px[3] < 128) {
        row.push(false)
        continue
      }
      const distSq = (px[0] - bgR) ** 2 + (px[1] - bgG) ** 2 + (px[2] - bgB) ** 2
      row.push(distSq > threshSq)
    }
    mask.push(row)
  }
  return mask
}

export const findConnectedComponents = (mask: boolean[][], minSize = 16): [number, number][][] => {
  const height = mask.length
  const width = mask[0]?.length ?? 0
  const seen: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false))
  const components: [number, number][][] = []

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      if (!mask[sy]?.[sx] || seen[sy]?.[sx]) continue
      const comp: [number, number][] = []
      const queue: [number, number][] = [[sx, sy]]
      seen[sy]![sx] = true

      while (queue.length > 0) {
        const [x, y] = queue.shift()!
        comp.push([x, y])
        const neighbors: [number, number][] = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
        for (const [dx, dy] of neighbors) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny]?.[nx] && !seen[ny]?.[nx]) {
            seen[ny]![nx] = true
            queue.push([nx, ny])
          }
        }
      }

      if (comp.length >= minSize) {
        components.push(comp)
      }
    }
  }

  components.sort((a, b) => b.length - a.length)
  return components
}

export const mooreTraceContour = (points: [number, number][]): [number, number][] => {
  if (points.length === 0) return []
  const pointSet = new Set(points.map(([x, y]) => `${x},${y}`))
  // Start at topmost, then leftmost
  let start = points[0]!
  for (const pt of points) {
    if (pt[1] < start[1] || (pt[1] === start[1] && pt[0] < start[0])) {
      start = pt
    }
  }

  const contour: [number, number][] = [start]
  let cur = start
  let back: [number, number] = [start[0] - 1, start[1]]
  let firstMove: [number, number] | null = null

  const findDirIndex = (dx: number, dy: number) => {
    for (let i = 0; i < 8; i++) {
      if (DIRS[i]![0] === dx && DIRS[i]![1] === dy) return i
    }
    return 0
  }

  for (let step = 0; step < 8 * points.length + 8; step++) {
    const k = findDirIndex(back[0] - cur[0], back[1] - cur[1])
    let nxt: [number, number] | null = null

    for (let i = 1; i <= 8; i++) {
      const d = (k + i) % 8
      const cand: [number, number] = [cur[0] + DIRS[d]![0], cur[1] + DIRS[d]![1]]
      if (pointSet.has(`${cand[0]},${cand[1]}`)) {
        nxt = cand
        const pd = (k + i - 1) % 8
        back = [cur[0] + DIRS[pd]![0], cur[1] + DIRS[pd]![1]]
        break
      }
    }

    if (!nxt) return contour
    if (cur[0] === start[0] && cur[1] === start[1] && firstMove && nxt[0] === firstMove[0] && nxt[1] === firstMove[1]) {
      break
    }
    if (!firstMove) firstMove = nxt
    cur = nxt
    contour.push(cur)
  }

  if (contour.length > 1 && contour[contour.length - 1]![0] === start[0] && contour[contour.length - 1]![1] === start[1]) {
    contour.pop()
  }
  return contour
}

const perpDist = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}

const dpOpen = (points: [number, number][], epsilon: number): [number, number][] => {
  const keep = Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!
    let idx = -1
    let dmax = 0
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(points[i]!, points[lo]!, points[hi]!)
      if (d > dmax) {
        idx = i
        dmax = d
      }
    }
    if (dmax > epsilon && idx > 0) {
      keep[idx] = true
      stack.push([lo, idx], [idx, hi])
    }
  }

  return points.filter((_, i) => keep[i])
}

export const simplifyClosedPolygon = (points: [number, number][], epsilon: number): [number, number][] => {
  if (points.length < 4) return points
  let farIdx = 0
  let maxD = 0
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]![0] - points[0]![0], points[i]![1] - points[0]![1])
    if (d > maxD) {
      farIdx = i
      maxD = d
    }
  }

  const first = dpOpen(points.slice(0, farIdx + 1), epsilon)
  const second = dpOpen([...points.slice(farIdx), points[0]!], epsilon)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

export const traceProfileFromComponent = (
  comp: [number, number][],
  options: TraceProfileOptions = {},
): TracedProfile => {
  const xs = comp.map((p) => p[0])
  const ys = comp.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const widthPx = Math.max(1, maxX - minX + 1)
  const heightPx = Math.max(1, maxY - minY + 1)

  const scaleX = options.widthM ? options.widthM / widthPx : 1.0
  const scaleY = options.heightM ? options.heightM / heightPx : options.widthM ? scaleX : 1.0

  const origin = options.origin ?? 'bottom-center'
  const cx = (minX + maxX) / 2
  const baseY = origin === 'bottom-center' ? maxY + 0.5 : (minY + maxY) / 2

  const rawContour = mooreTraceContour(comp)
  const simplified = simplifyClosedPolygon(rawContour, options.epsilon ?? 1.5)

  const points: [number, number][] = simplified.map(([x, y]) => [
    Number(((x - cx) * scaleX).toFixed(4)),
    Number(((baseY - y) * scaleY).toFixed(4)),
  ])

  return {
    points,
    widthM: Number((widthPx * scaleX).toFixed(4)),
    heightM: Number((heightPx * scaleY).toFixed(4)),
    pointCount: points.length,
    pixelBbox: [minX, minY, maxX, maxY],
  }
}

export const traceOrthoImageGrid = (
  grid: PixelGrid,
  dimensions: { lengthM: number; widthM: number; heightM: number },
  options: { epsilon?: number; threshold?: number } = {},
): {
  action: 'build_cad_solid'
  name: string
  spec: {
    op: 'intersect_profiles'
    sideProfile: [number, number][]
    topProfile: [number, number][]
  }
} => {
  const mask = createForegroundMask(grid, options.threshold ?? 40)
  const comps = findConnectedComponents(mask)
  if (comps.length < 2) {
    throw new Error('Expected at least 2 views in orthographic sheet (side and top).')
  }

  const [c1, c2] = [comps[0]!, comps[1]!]
  const c1AvgY = c1.reduce((acc, p) => acc + p[1], 0) / c1.length
  const c2AvgY = c2.reduce((acc, p) => acc + p[1], 0) / c2.length

  const [compSide, compTop] = c1AvgY < c2AvgY ? [c1, c2] : [c2, c1]

  const sideProfile = traceProfileFromComponent(compSide, {
    widthM: dimensions.lengthM,
    heightM: dimensions.heightM,
    origin: 'bottom-center',
    epsilon: options.epsilon ?? 1.5,
  })

  const topProfile = traceProfileFromComponent(compTop, {
    widthM: dimensions.lengthM,
    heightM: dimensions.widthM,
    origin: 'center',
    epsilon: options.epsilon ?? 1.5,
  })

  return {
    action: 'build_cad_solid',
    name: 'traced_solid',
    spec: {
      op: 'intersect_profiles',
      sideProfile: sideProfile.points,
      topProfile: topProfile.points,
    },
  }
}
