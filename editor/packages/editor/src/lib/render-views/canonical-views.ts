/**
 * The shared coordinate frame used by reference packs, scene blueprints, and
 * deterministic render reviews. These values intentionally do not depend on
 * Three.js so every host can agree on the same view contract.
 */
export const PISTOLA_CANONICAL_FRAME = {
  up: '+Y',
  front: '+Z',
  right: '+X',
  units: 'meters',
  origin: 'bottom-center',
} as const

export type Vec3 = readonly [number, number, number]

export type CanonicalProjection = 'orthographic' | 'perspective'

export type CanonicalViewId =
  | 'top'
  | 'left-45'
  | 'front'
  | 'right-45'
  | 'left'
  | 'right'
  | 'back'
  | 'bottom'

export type CanonicalCameraPose = Readonly<{
  id: CanonicalViewId
  projection: CanonicalProjection
  /** Camera position in Pistola's +Y-up, +Z-front, +X-right frame. */
  position: Vec3
  /** Point the camera looks at. */
  target: Vec3
  /** Camera's screen-up vector; always perpendicular to its look direction. */
  up: Vec3
}>

export type CanonicalViewCamera = CanonicalCameraPose &
  Readonly<{
    label: string
    /** Unit vector from the target toward the camera. */
    directionFromTarget: Vec3
  }>

export type ContactSheetCell = Readonly<{
  viewId: CanonicalViewId
  index: number
  row: number
  column: number
}>

export type ContactSheetLayout = Readonly<{
  columns: 4
  rows: 2
  cells: readonly ContactSheetCell[]
}>

/**
 * A fixed distance makes the static definitions easy to inspect. Renderers
 * fitting real scene bounds should call createCanonicalCameraPose instead.
 */
export const CANONICAL_VIEW_DISTANCE = 8
export const CANONICAL_VIEW_TARGET: Vec3 = [0, 0, 0]
const DIAGONAL_OFFSET = CANONICAL_VIEW_DISTANCE * Math.SQRT1_2

/**
 * Stable presentation order for both generated reference packs and rendered
 * contact sheets. It mirrors the eight-view authoring flow: overview first,
 * then the front-facing evidence, then the remaining cardinal evidence.
 */
export const CANONICAL_VIEW_ORDER = [
  'top',
  'left-45',
  'front',
  'right-45',
  'left',
  'right',
  'back',
  'bottom',
] as const satisfies readonly CanonicalViewId[]

/**
 * The six cardinal views are orthographic geometry sources. The two 45-degree
 * views are perspective presentation and placement-review sources.
 */
export const CANONICAL_VIEW_CAMERAS = [
  {
    id: 'top',
    label: 'Top View',
    projection: 'orthographic',
    position: [0, CANONICAL_VIEW_DISTANCE, 0],
    target: CANONICAL_VIEW_TARGET,
    // +X is screen-right and +Z (front) is screen-down.
    up: [0, 0, -1],
    directionFromTarget: [0, 1, 0],
  },
  {
    id: 'left-45',
    label: 'Left 45° View',
    projection: 'perspective',
    position: [-DIAGONAL_OFFSET, 0, DIAGONAL_OFFSET],
    target: CANONICAL_VIEW_TARGET,
    up: [0, 1, 0],
    directionFromTarget: [-Math.SQRT1_2, 0, Math.SQRT1_2],
  },
  {
    id: 'front',
    label: 'Front View',
    projection: 'orthographic',
    position: [0, 0, CANONICAL_VIEW_DISTANCE],
    target: CANONICAL_VIEW_TARGET,
    up: [0, 1, 0],
    directionFromTarget: [0, 0, 1],
  },
  {
    id: 'right-45',
    label: 'Right 45° View',
    projection: 'perspective',
    position: [DIAGONAL_OFFSET, 0, DIAGONAL_OFFSET],
    target: CANONICAL_VIEW_TARGET,
    up: [0, 1, 0],
    directionFromTarget: [Math.SQRT1_2, 0, Math.SQRT1_2],
  },
  {
    id: 'left',
    label: 'Left View',
    projection: 'orthographic',
    position: [-CANONICAL_VIEW_DISTANCE, 0, 0],
    target: CANONICAL_VIEW_TARGET,
    up: [0, 1, 0],
    directionFromTarget: [-1, 0, 0],
  },
  {
    id: 'right',
    label: 'Right View',
    projection: 'orthographic',
    position: [CANONICAL_VIEW_DISTANCE, 0, 0],
    target: CANONICAL_VIEW_TARGET,
    up: [0, 1, 0],
    directionFromTarget: [1, 0, 0],
  },
  {
    id: 'back',
    label: 'Back View',
    projection: 'orthographic',
    position: [0, 0, -CANONICAL_VIEW_DISTANCE],
    target: CANONICAL_VIEW_TARGET,
    up: [0, 1, 0],
    directionFromTarget: [0, 0, -1],
  },
  {
    id: 'bottom',
    label: 'Bottom View',
    projection: 'orthographic',
    position: [0, -CANONICAL_VIEW_DISTANCE, 0],
    target: CANONICAL_VIEW_TARGET,
    // +X is screen-right and +Z (front) is screen-up.
    up: [0, 0, 1],
    directionFromTarget: [0, -1, 0],
  },
] as const satisfies readonly CanonicalViewCamera[]

/** A deterministic row-major 4 × 2 layout for the eight rendered views. */
export const CANONICAL_CONTACT_SHEET_LAYOUT = {
  columns: 4,
  rows: 2,
  cells: [
    { viewId: 'top', index: 0, row: 0, column: 0 },
    { viewId: 'left-45', index: 1, row: 0, column: 1 },
    { viewId: 'front', index: 2, row: 0, column: 2 },
    { viewId: 'right-45', index: 3, row: 0, column: 3 },
    { viewId: 'left', index: 4, row: 1, column: 0 },
    { viewId: 'right', index: 5, row: 1, column: 1 },
    { viewId: 'back', index: 6, row: 1, column: 2 },
    { viewId: 'bottom', index: 7, row: 1, column: 3 },
  ],
} as const satisfies ContactSheetLayout

const copyVector = (vector: Vec3): Vec3 => [vector[0], vector[1], vector[2]]

export const getCanonicalViewCamera = (id: CanonicalViewId): CanonicalViewCamera => {
  const camera = CANONICAL_VIEW_CAMERAS.find((candidate) => candidate.id === id)
  if (!camera) {
    throw new Error(`Unknown canonical view: ${id}`)
  }
  return camera
}

/**
 * Re-centres and re-scales a canonical camera without changing its axis
 * orientation or projection. This is intentionally renderer-agnostic.
 */
export const createCanonicalCameraPose = (
  id: CanonicalViewId,
  target: Vec3 = CANONICAL_VIEW_TARGET,
  distance = CANONICAL_VIEW_DISTANCE,
): CanonicalCameraPose => {
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error('Canonical camera distance must be a finite number greater than zero.')
  }

  const camera = getCanonicalViewCamera(id)
  const direction = camera.directionFromTarget

  return {
    id: camera.id,
    projection: camera.projection,
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    target: copyVector(target),
    up: copyVector(camera.up),
  }
}
