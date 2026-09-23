import {
  createCanonicalCameraPose,
  getCanonicalViewCamera,
  type CanonicalViewId,
  type Vec3,
} from '../render-views/canonical-views'

export const RENDER_MAX_EDGE = 1568

export const RENDER_VIEW_IDS = [
  'top',
  'bottom',
  'front',
  'back',
  'left',
  'right',
  'left-45',
  'right-45',
  'iso',
] as const

export type RenderViewId = (typeof RENDER_VIEW_IDS)[number]

export type CaptureBounds = {
  min: Vec3
  max: Vec3
  center: Vec3
  radius: number
}

export type CapturePose = {
  live?: boolean
  projection: 'perspective' | 'orthographic'
  position: Vec3
  target: Vec3
  up: Vec3
  fov: number
  orthoHalfHeight?: number
}

const add = (a: Vec3, b: Vec3, scale = 1): Vec3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale]

const normalize = (vector: Vec3): Vec3 => {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

export const clampCaptureSize = (width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const edge = Math.max(safeWidth, safeHeight)
  if (edge <= RENDER_MAX_EDGE) return { width: safeWidth, height: safeHeight }
  const scale = RENDER_MAX_EDGE / edge
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  }
}

export const boundsFromBoxes = (
  parts: readonly { id: string; box: { min: Vec3; max: Vec3 } }[],
  nodeIds?: readonly string[],
): CaptureBounds | null => {
  const selected = nodeIds?.length ? parts.filter((part) => nodeIds.includes(part.id)) : parts
  if (selected.length === 0) return null
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const part of selected) {
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], part.box.min[axis])
      max[axis] = Math.max(max[axis], part.box.max[axis])
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const radius = Math.max(Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2, 0.05)
  return { min, max, center, radius }
}

const perspectiveDistance = (radius: number, fov: number) =>
  (radius / Math.tan((fov * Math.PI) / 360)) * 1.35

export const poseForView = (view: RenderViewId, bounds: CaptureBounds | null): CapturePose => {
  const center = bounds?.center ?? ([0, 0.5, 0] as Vec3)
  const radius = bounds?.radius ?? 1

  if (view === 'iso') {
    const fov = 32
    const direction = normalize([1, 0.8, 1])
    return {
      projection: 'perspective',
      position: add(center, direction, perspectiveDistance(radius, fov)),
      target: center,
      up: [0, 1, 0],
      fov,
    }
  }

  const spec = getCanonicalViewCamera(view as CanonicalViewId)
  const fov = 35
  const distance =
    spec.projection === 'perspective' ? perspectiveDistance(radius, fov) : Math.max(radius * 4, 1)
  const pose = createCanonicalCameraPose(view, center, distance)
  return {
    projection: spec.projection,
    position: pose.position,
    target: pose.target,
    up: pose.up,
    fov,
    orthoHalfHeight: spec.projection === 'orthographic' ? radius * 1.35 : undefined,
  }
}

export const poseFromCamera = (camera: {
  position: Vec3
  target: Vec3
  up?: Vec3
  fov?: number
}): CapturePose => ({
  projection: 'perspective',
  position: camera.position,
  target: camera.target,
  up: camera.up ?? [0, 1, 0],
  fov: camera.fov ?? 35,
})

export const livePose = (): CapturePose => ({
  live: true,
  projection: 'perspective',
  position: [0, 0, 0],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fov: 35,
})
