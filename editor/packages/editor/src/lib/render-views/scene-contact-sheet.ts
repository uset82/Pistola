import {
  CANONICAL_CONTACT_SHEET_LAYOUT,
  createCanonicalCameraPose,
  getCanonicalViewCamera,
  type CanonicalCameraPose,
  type CanonicalProjection,
  type CanonicalViewId,
  type Vec3,
} from './canonical-views'

/** The renderer deliberately caps input so an IDE cannot create an unbounded SVG payload. */
export const MAX_RENDERABLE_AABB_PARTS = 128
export const MAX_AABB_COORDINATE = 1_000_000

export const SCENE_CONTACT_SHEET_DIMENSIONS = {
  width: 1220,
  height: 484,
  columns: 4,
  rows: 2,
} as const

export const STABLE_PART_COLOR_PALETTE = [
  '#2563eb',
  '#0891b2',
  '#059669',
  '#65a30d',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#4f46e5',
] as const

export type RenderableAabbBounds = Readonly<{
  min: Vec3
  max: Vec3
}>

/** A minimal, renderer-independent scene part that can be represented by an AABB. */
export type RenderableAabbPart = Readonly<{
  id: string
  name?: string
  bounds: RenderableAabbBounds
  color?: string
}>

export type SceneContactSheetCell = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type SceneContactSheetFloorLine = Readonly<{
  x1: number
  y1: number
  x2: number
  y2: number
}>

/** Metadata lets hosts associate every rendered cell with the canonical camera contract. */
export type SceneContactSheetView = Readonly<{
  id: CanonicalViewId
  label: string
  projection: CanonicalProjection
  index: number
  row: number
  column: number
  cell: SceneContactSheetCell
  camera: CanonicalCameraPose
  floorLine: SceneContactSheetFloorLine
}>

export type SceneContactSheet = Readonly<{
  svg: string
  width: number
  height: number
  columns: 4
  rows: 2
  views: readonly SceneContactSheetView[]
  partColors: Readonly<Record<string, string>>
}>

type NormalizedPart = Readonly<{
  id: string
  name: string
  bounds: RenderableAabbBounds
  color: string
}>

type Point2 = Readonly<{
  x: number
  y: number
}>

type ProjectedPoint = Point2 &
  Readonly<{
    depth: number
  }>

type Viewport = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

type ProjectedPart = Readonly<{
  part: NormalizedPart
  points: readonly ProjectedPoint[]
  depth: number
}>

const SHEET_MARGIN = 16
const CELL_GAP = 12
const CELL_WIDTH = 288
const CELL_HEIGHT = 220
const LABEL_HEIGHT = 26
const CELL_PADDING = 14
const FIT_RATIO = 0.88
const EPSILON = 1e-9
const MAX_PART_TEXT_LENGTH = 160
const SAFE_SVG_COLOR = /^(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|[a-zA-Z]{1,32})$/

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&apos;'
    }
  })

const formatNumber = (value: number) => {
  const rounded = Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(2))
  return String(rounded)
}

const add = (left: Vec3, right: Vec3): Vec3 => [
  left[0] + right[0],
  left[1] + right[1],
  left[2] + right[2],
]

const subtract = (left: Vec3, right: Vec3): Vec3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
]

const scale = (vector: Vec3, scalar: number): Vec3 => [
  vector[0] * scalar,
  vector[1] * scalar,
  vector[2] * scalar,
]

const dot = (left: Vec3, right: Vec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2]

const cross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
]

const normalize = (vector: Vec3): Vec3 => {
  const length = Math.hypot(vector[0], vector[1], vector[2])
  if (!Number.isFinite(length) || length <= EPSILON) {
    throw new Error('Canonical view has an invalid screen axis.')
  }
  return scale(vector, 1 / length)
}

const isFiniteCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AABB_COORDINATE

function assertVector(
  value: unknown,
  partId: string,
  position: 'min' | 'max',
): asserts value is Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteCoordinate)) {
    throw new Error(
      `Part "${partId}" bounds.${position} must be three finite coordinates within ±${MAX_AABB_COORDINATE}.`,
    )
  }
}

const hashText = (value: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Produces the same fallback color for a part id regardless of input order or host. */
export const stableColorForPart = (partId: string) =>
  STABLE_PART_COLOR_PALETTE[hashText(partId) % STABLE_PART_COLOR_PALETTE.length] ??
  STABLE_PART_COLOR_PALETTE[0]

const resolveColor = (part: RenderableAabbPart) =>
  typeof part.color === 'string' && SAFE_SVG_COLOR.test(part.color)
    ? part.color
    : stableColorForPart(part.id)

const normalizeParts = (input: readonly RenderableAabbPart[]) => {
  if (!Array.isArray(input)) {
    throw new Error('Scene contact-sheet input must be an array of renderable AABB parts.')
  }
  if (input.length > MAX_RENDERABLE_AABB_PARTS) {
    throw new Error(
      `Scene contact-sheet accepts at most ${MAX_RENDERABLE_AABB_PARTS} renderable parts.`,
    )
  }

  const ids = new Set<string>()
  const parts = input.map((part) => {
    if (!part || typeof part !== 'object' || typeof part.id !== 'string' || part.id.length === 0) {
      throw new Error('Each renderable part needs a non-empty string id.')
    }
    if (part.id.length > MAX_PART_TEXT_LENGTH) {
      throw new Error(
        `Part id "${part.id.slice(0, 32)}…" exceeds the ${MAX_PART_TEXT_LENGTH}-character limit.`,
      )
    }
    if (ids.has(part.id)) {
      throw new Error(`Duplicate renderable part id "${part.id}".`)
    }
    ids.add(part.id)

    if (!part.bounds || typeof part.bounds !== 'object') {
      throw new Error(`Part "${part.id}" needs bounds with min and max coordinates.`)
    }
    assertVector(part.bounds.min, part.id, 'min')
    assertVector(part.bounds.max, part.id, 'max')
    const min = part.bounds.min
    const max = part.bounds.max
    if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) {
      throw new Error(`Part "${part.id}" bounds.min must not exceed bounds.max.`)
    }
    if (
      part.name !== undefined &&
      (typeof part.name !== 'string' || part.name.length > MAX_PART_TEXT_LENGTH)
    ) {
      throw new Error(
        `Part "${part.id}" name must be a string no longer than ${MAX_PART_TEXT_LENGTH} characters.`,
      )
    }
    if (part.color !== undefined && (typeof part.color !== 'string' || part.color.length > 32)) {
      throw new Error(`Part "${part.id}" color must be a short SVG color string when supplied.`)
    }

    return {
      id: part.id,
      name: part.name || part.id,
      bounds: {
        min: [min[0], min[1], min[2]],
        max: [max[0], max[1], max[2]],
      },
      color: resolveColor(part),
    } satisfies NormalizedPart
  })

  return parts.sort((left, right) => compareText(left.id, right.id))
}

const aabbCorners = (bounds: RenderableAabbBounds): Vec3[] => {
  const corners: Vec3[] = []
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        corners.push([x, y, z])
      }
    }
  }
  return corners
}

const sceneBounds = (parts: readonly NormalizedPart[]): RenderableAabbBounds => {
  if (parts.length === 0) {
    return { min: [-1, -1, -1], max: [1, 1, 1] }
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    min[0] = Math.min(min[0], part.bounds.min[0])
    min[1] = Math.min(min[1], part.bounds.min[1])
    min[2] = Math.min(min[2], part.bounds.min[2])
    max[0] = Math.max(max[0], part.bounds.max[0])
    max[1] = Math.max(max[1], part.bounds.max[1])
    max[2] = Math.max(max[2], part.bounds.max[2])
  }
  return { min, max }
}

const boundsCenter = (bounds: RenderableAabbBounds): Vec3 => [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
  (bounds.min[2] + bounds.max[2]) / 2,
]

const boundsDiagonal = (bounds: RenderableAabbBounds) =>
  Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  )

const cross2d = (origin: Point2, left: Point2, right: Point2) =>
  (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x)

const convexHull = (points: readonly ProjectedPoint[]) => {
  const sorted = [...points].sort((left, right) => {
    if (left.x !== right.x) return left.x - right.x
    return left.y - right.y
  })
  const unique = sorted.filter(
    (point, index) =>
      index === 0 ||
      Math.abs(point.x - (sorted[index - 1]?.x ?? point.x)) > EPSILON ||
      Math.abs(point.y - (sorted[index - 1]?.y ?? point.y)) > EPSILON,
  )
  if (unique.length <= 2) return unique

  const lower: ProjectedPoint[] = []
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross2d(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= EPSILON
    ) {
      lower.pop()
    }
    lower.push(point)
  }
  const upper: ProjectedPoint[] = []
  for (const point of [...unique].reverse()) {
    while (
      upper.length >= 2 &&
      cross2d(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= EPSILON
    ) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

const createProjector = (viewId: CanonicalViewId, target: Vec3, distance: number) => {
  const canonical = getCanonicalViewCamera(viewId)
  const camera = createCanonicalCameraPose(viewId, target, distance)
  const forward = scale(canonical.directionFromTarget, -1)
  const right = normalize(cross(forward, camera.up))

  return {
    camera,
    project: (point: Vec3): ProjectedPoint => {
      const relativeToCamera = subtract(point, camera.position)
      const depth = dot(relativeToCamera, forward)
      if (depth <= EPSILON) {
        throw new Error(`Part lies behind the ${canonical.label} camera.`)
      }
      const projectionScale = camera.projection === 'perspective' ? distance / depth : 1
      const relativeToTarget = subtract(point, target)
      const planar = camera.projection === 'perspective' ? relativeToCamera : relativeToTarget
      return {
        x: dot(planar, right) * projectionScale,
        y: dot(planar, camera.up) * projectionScale,
        depth,
      }
    },
  }
}

const createViewport = (column: number, row: number): Viewport => ({
  x: SHEET_MARGIN + column * (CELL_WIDTH + CELL_GAP) + CELL_PADDING,
  y: SHEET_MARGIN + row * (CELL_HEIGHT + CELL_GAP) + LABEL_HEIGHT + CELL_PADDING,
  width: CELL_WIDTH - CELL_PADDING * 2,
  height: CELL_HEIGHT - LABEL_HEIGHT - CELL_PADDING * 2,
})

const createCell = (column: number, row: number): SceneContactSheetCell => ({
  x: SHEET_MARGIN + column * (CELL_WIDTH + CELL_GAP),
  y: SHEET_MARGIN + row * (CELL_HEIGHT + CELL_GAP),
  width: CELL_WIDTH,
  height: CELL_HEIGHT,
})

const gridPath = (viewport: Viewport) => {
  const commands: string[] = []
  for (let index = 1; index < 5; index += 1) {
    const x = viewport.x + (viewport.width * index) / 5
    commands.push(
      `M ${formatNumber(x)} ${formatNumber(viewport.y)} V ${formatNumber(viewport.y + viewport.height)}`,
    )
  }
  for (let index = 1; index < 4; index += 1) {
    const y = viewport.y + (viewport.height * index) / 4
    commands.push(
      `M ${formatNumber(viewport.x)} ${formatNumber(y)} H ${formatNumber(viewport.x + viewport.width)}`,
    )
  }
  return commands.join(' ')
}

const pointString = (points: readonly Point2[]) =>
  points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(' ')

const partSvg = (part: NormalizedPart, points: readonly Point2[]) => {
  const attributes = `data-role="part" data-part-id="${escapeXml(part.id)}" fill="${escapeXml(part.color)}" stroke="#172033" stroke-width="1" fill-opacity="0.88"`
  const title = `<title>${escapeXml(part.name)}</title>`
  if (points.length >= 3) {
    return `<polygon ${attributes} points="${pointString(points)}">${title}</polygon>`
  }
  if (points.length === 2) {
    return `<polyline ${attributes} fill="none" points="${pointString(points)}">${title}</polyline>`
  }
  const point = points[0] ?? { x: 0, y: 0 }
  return `<circle ${attributes} cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="2">${title}</circle>`
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const renderView = (
  viewId: CanonicalViewId,
  index: number,
  row: number,
  column: number,
  parts: readonly NormalizedPart[],
  target: Vec3,
  distance: number,
): { markup: string; metadata: SceneContactSheetView } => {
  const canonical = getCanonicalViewCamera(viewId)
  const cell = createCell(column, row)
  const viewport = createViewport(column, row)
  const projector = createProjector(viewId, target, distance)
  const projectedParts = parts.map((part) => {
    const points = aabbCorners(part.bounds).map(projector.project)
    return {
      part,
      points,
      depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length,
    } satisfies ProjectedPart
  })
  const allPoints = projectedParts.flatMap((part) => part.points)
  const projectedMinX = allPoints.length === 0 ? -1 : Math.min(...allPoints.map((point) => point.x))
  const projectedMaxX = allPoints.length === 0 ? 1 : Math.max(...allPoints.map((point) => point.x))
  const projectedMinY = allPoints.length === 0 ? -1 : Math.min(...allPoints.map((point) => point.y))
  const projectedMaxY = allPoints.length === 0 ? 1 : Math.max(...allPoints.map((point) => point.y))
  const spanX = Math.max(projectedMaxX - projectedMinX, EPSILON)
  const spanY = Math.max(projectedMaxY - projectedMinY, EPSILON)
  const scaleToFit = Math.min(viewport.width / spanX, viewport.height / spanY) * FIT_RATIO
  const center: Point2 = {
    x: (projectedMinX + projectedMaxX) / 2,
    y: (projectedMinY + projectedMaxY) / 2,
  }
  const toSvgPoint = (point: Point2): Point2 => ({
    x: viewport.x + viewport.width / 2 + (point.x - center.x) * scaleToFit,
    y: viewport.y + viewport.height / 2 - (point.y - center.y) * scaleToFit,
  })

  const projectedFloor = projector.project([target[0], 0, target[2]])
  const floorY =
    viewId === 'top' || viewId === 'bottom'
      ? viewport.y + viewport.height * 0.85
      : clamp(toSvgPoint(projectedFloor).y, viewport.y + 4, viewport.y + viewport.height - 4)
  const floorLine = {
    x1: viewport.x,
    y1: floorY,
    x2: viewport.x + viewport.width,
    y2: floorY,
  }

  const partsMarkup = projectedParts
    .sort((left, right) => right.depth - left.depth || compareText(left.part.id, right.part.id))
    .map((part) => partSvg(part.part, convexHull(part.points).map(toSvgPoint)))
    .join('')
  const metadata: SceneContactSheetView = {
    id: canonical.id,
    label: canonical.label,
    projection: canonical.projection,
    index,
    row,
    column,
    cell,
    camera: projector.camera,
    floorLine,
  }
  const markup = `<g data-view-id="${canonical.id}" data-cell-index="${index}" data-projection="${canonical.projection}" aria-label="${canonical.label}"><rect data-role="cell" x="${formatNumber(cell.x)}" y="${formatNumber(cell.y)}" width="${formatNumber(cell.width)}" height="${formatNumber(cell.height)}" rx="8" fill="#f8fafc" stroke="#94a3b8"/><text data-role="view-label" x="${formatNumber(cell.x + CELL_PADDING)}" y="${formatNumber(cell.y + 18)}" fill="#0f172a" font-family="system-ui, sans-serif" font-size="12" font-weight="700">${canonical.label}</text><path data-role="grid" d="${gridPath(viewport)}" fill="none" stroke="#dbe4ee" stroke-width="1"/><line data-role="floor-line" x1="${formatNumber(floorLine.x1)}" y1="${formatNumber(floorLine.y1)}" x2="${formatNumber(floorLine.x2)}" y2="${formatNumber(floorLine.y2)}" stroke="#64748b" stroke-width="1.25" stroke-dasharray="4 3"/>${partsMarkup}</g>`

  return { markup, metadata }
}

/**
 * Renders validated AABB scene parts into a deterministic, dependency-free SVG
 * contact sheet. It approximates each part with its true projected AABB hull;
 * it intentionally does not inspect meshes, a DOM, React state, or Three.js.
 */
export const renderSceneContactSheet = (
  input: readonly RenderableAabbPart[],
): SceneContactSheet => {
  const parts = normalizeParts(input)
  const bounds = sceneBounds(parts)
  const target = boundsCenter(bounds)
  const distance = Math.max(1, boundsDiagonal(bounds) * 3)
  const renderedViews = CANONICAL_CONTACT_SHEET_LAYOUT.cells.map((cell) =>
    renderView(cell.viewId, cell.index, cell.row, cell.column, parts, target, distance),
  )
  const partColors = Object.freeze(Object.fromEntries(parts.map((part) => [part.id, part.color])))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE_CONTACT_SHEET_DIMENSIONS.width}" height="${SCENE_CONTACT_SHEET_DIMENSIONS.height}" viewBox="0 0 ${SCENE_CONTACT_SHEET_DIMENSIONS.width} ${SCENE_CONTACT_SHEET_DIMENSIONS.height}" role="img" aria-label="Deterministic eight-view scene contact sheet"><title>Deterministic scene contact sheet</title><rect width="100%" height="100%" fill="#e2e8f0"/>${renderedViews.map((view) => view.markup).join('')}</svg>`

  return {
    svg,
    width: SCENE_CONTACT_SHEET_DIMENSIONS.width,
    height: SCENE_CONTACT_SHEET_DIMENSIONS.height,
    columns: SCENE_CONTACT_SHEET_DIMENSIONS.columns,
    rows: SCENE_CONTACT_SHEET_DIMENSIONS.rows,
    views: renderedViews.map((view) => view.metadata),
    partColors,
  }
}

/** A short alias for hosts that treat the contact sheet as a creation result. */
export const createSceneContactSheet = renderSceneContactSheet
