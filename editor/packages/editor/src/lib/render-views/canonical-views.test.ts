import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANONICAL_CONTACT_SHEET_LAYOUT,
  CANONICAL_VIEW_CAMERAS,
  CANONICAL_VIEW_DISTANCE,
  CANONICAL_VIEW_ORDER,
  createCanonicalCameraPose,
  getCanonicalViewCamera,
  PISTOLA_CANONICAL_FRAME,
  type Vec3,
} from './canonical-views'

const subtract = (left: Vec3, right: Vec3): Vec3 => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
]

const dot = (left: Vec3, right: Vec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2]

const magnitude = (vector: Vec3) => Math.hypot(vector[0], vector[1], vector[2])

const approximatelyEqual = (actual: number, expected: number, message?: string) => {
  assert.ok(Math.abs(actual - expected) < 1e-10, message ?? `${actual} should equal ${expected}`)
}

test('uses the Pistola +Y-up, +Z-front, +X-right canonical frame', () => {
  assert.deepEqual(PISTOLA_CANONICAL_FRAME, {
    up: '+Y',
    front: '+Z',
    right: '+X',
    units: 'meters',
    origin: 'bottom-center',
  })
})

test('locks all six cardinal cameras to their expected axis, orientation, and orthographic projection', () => {
  const expected = {
    top: { position: [0, 8, 0], direction: [0, 1, 0], up: [0, 0, -1] },
    front: { position: [0, 0, 8], direction: [0, 0, 1], up: [0, 1, 0] },
    left: { position: [-8, 0, 0], direction: [-1, 0, 0], up: [0, 1, 0] },
    right: { position: [8, 0, 0], direction: [1, 0, 0], up: [0, 1, 0] },
    back: { position: [0, 0, -8], direction: [0, 0, -1], up: [0, 1, 0] },
    bottom: { position: [0, -8, 0], direction: [0, -1, 0], up: [0, 0, 1] },
  } as const

  for (const [id, locked] of Object.entries(expected)) {
    const camera = getCanonicalViewCamera(id as keyof typeof expected)
    assert.equal(camera.projection, 'orthographic')
    assert.deepEqual(camera.target, [0, 0, 0])
    assert.deepEqual(camera.position, locked.position)
    assert.deepEqual(camera.directionFromTarget, locked.direction)
    assert.deepEqual(camera.up, locked.up)
  }
})

test('locks the diagonal review cameras to a horizontal 45-degree front-facing perspective', () => {
  const left = getCanonicalViewCamera('left-45')
  const right = getCanonicalViewCamera('right-45')

  assert.equal(left.projection, 'perspective')
  assert.equal(right.projection, 'perspective')
  assert.ok(left.position[0] < 0)
  assert.ok(right.position[0] > 0)
  assert.ok(left.position[2] > 0)
  assert.ok(right.position[2] > 0)
  approximatelyEqual(Math.abs(left.position[0]), Math.abs(left.position[2]))
  approximatelyEqual(Math.abs(right.position[0]), Math.abs(right.position[2]))
  approximatelyEqual(magnitude(left.directionFromTarget), 1)
  approximatelyEqual(magnitude(right.directionFromTarget), 1)
  assert.equal(left.directionFromTarget[1], 0)
  assert.equal(right.directionFromTarget[1], 0)
})

test('keeps every camera pointed at its target with a non-degenerate screen-up orientation', () => {
  for (const camera of CANONICAL_VIEW_CAMERAS) {
    const lookDirection = subtract(camera.target, camera.position)
    approximatelyEqual(magnitude(lookDirection), CANONICAL_VIEW_DISTANCE)
    approximatelyEqual(
      dot(lookDirection, camera.up),
      0,
      `${camera.id} up must be perpendicular to look direction`,
    )
    assert.ok(magnitude(camera.up) > 0, `${camera.id} must define a usable screen-up vector`)
  }
})

test('re-centres and re-scales a canonical pose without changing its projection or orientation', () => {
  const pose = createCanonicalCameraPose('right-45', [2, 3, 4], 10)
  assert.equal(pose.projection, 'perspective')
  assert.deepEqual(pose.target, [2, 3, 4])
  approximatelyEqual(pose.position[0], 2 + 10 * Math.SQRT1_2)
  assert.equal(pose.position[1], 3)
  approximatelyEqual(pose.position[2], 4 + 10 * Math.SQRT1_2)
  assert.deepEqual(pose.up, [0, 1, 0])
  assert.throws(() => createCanonicalCameraPose('front', [0, 0, 0], 0), /greater than zero/)
})

test('lays out each of the eight required views exactly once in stable row-major 4 by 2 order', () => {
  assert.equal(CANONICAL_CONTACT_SHEET_LAYOUT.columns, 4)
  assert.equal(CANONICAL_CONTACT_SHEET_LAYOUT.rows, 2)
  assert.deepEqual(
    CANONICAL_CONTACT_SHEET_LAYOUT.cells.map((cell) => cell.viewId),
    CANONICAL_VIEW_ORDER,
  )
  assert.deepEqual(
    CANONICAL_CONTACT_SHEET_LAYOUT.cells.map(({ index, row, column }) => [index, row, column]),
    [
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 2],
      [3, 0, 3],
      [4, 1, 0],
      [5, 1, 1],
      [6, 1, 2],
      [7, 1, 3],
    ],
  )
  assert.equal(new Set(CANONICAL_CONTACT_SHEET_LAYOUT.cells.map((cell) => cell.viewId)).size, 8)
})
