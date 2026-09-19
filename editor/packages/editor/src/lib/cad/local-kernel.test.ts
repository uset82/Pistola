import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCadSolidSpec, validateCadSolidSpec } from './local-kernel'

test('local kernel volumes match analytic boxes, cylinders, extrudes, and differences', () => {
  const box = evaluateCadSolidSpec({ op: 'box', size: [2, 3, 4] })
  assert.ok(Math.abs(box.volume - 24) / 24 < 0.05)

  const cylinder = evaluateCadSolidSpec({ op: 'cylinder', r: 1, h: 2 })
  assert.ok(Math.abs(cylinder.volume - Math.PI * 2) / (Math.PI * 2) < 0.08)

  const plate = evaluateCadSolidSpec({
    op: 'extrude',
    polygon: [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ],
    height: 0.5,
  })
  assert.ok(Math.abs(plate.volume - 1) / 1 < 0.08)

  const holed = evaluateCadSolidSpec({
    op: 'extrude',
    polygon: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    holes: [
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
    ],
    height: 1,
  })
  assert.ok(Math.abs(holed.volume - 3) / 3 < 0.12)

  const revolve = evaluateCadSolidSpec({
    op: 'revolve',
    profile: [
      [0.2, 0],
      [1, 0],
      [1, 2],
      [0.2, 2],
    ],
    angle: 360,
  })
  assert.ok(revolve.volume > 4)

  const cut = evaluateCadSolidSpec({
    op: 'difference',
    children: [
      { op: 'box', size: [2, 1, 2] },
      { op: 'box', size: [0.8, 1, 0.8], translate: [0, 0, 0] },
    ],
  })
  assert.ok(Math.abs(cut.volume - 3.36) / 3.36 < 0.08)
})

test('build_cad_solid spec validation accepts a heart-like extrude and rejects empty trees', () => {
  const ok = validateCadSolidSpec({
    op: 'extrude',
    polygon: [
      [0, 0.6],
      [0.4, 0.2],
      [0.2, -0.4],
      [0, -0.2],
      [-0.2, -0.4],
      [-0.4, 0.2],
    ],
    height: 0.5,
  })
  assert.equal(ok.success, true)
  assert.equal(validateCadSolidSpec({ op: 'union', children: [] }).success, false)
})

test('build_cad_solid intersect_profiles generates a smooth 3D hull from orthogonal 2D profiles', () => {
  const sideProfile: [number, number][] = [
    [-2, 0],
    [2, 0],
    [2, 0.8],
    [0, 0.7],
    [-2, 1.2],
  ]
  const topProfile: [number, number][] = [
    [-2, 0],
    [0, -0.6],
    [2, -0.5],
    [2, 0.5],
    [0, 0.6],
  ]

  const validation = validateCadSolidSpec({
    op: 'intersect_profiles',
    sideProfile,
    topProfile,
  })
  assert.equal(validation.success, true)

  const hull = evaluateCadSolidSpec({
    op: 'intersect_profiles',
    sideProfile,
    topProfile,
  })

  assert.ok(hull.volume > 0.5, `Volume should be positive, got ${hull.volume}`)
  assert.ok(hull.positions.length > 20, 'Should contain 3D mesh vertices')
  assert.ok(hull.indices.length > 20, 'Should contain triangle indices')
  // Check that X dimension matches the length of the profiles (-2 to 2)
  const [min, max] = hull.bbox
  assert.ok(Math.abs((max[0] - min[0]) - 4.0) < 0.1, `Length in X should match profile length (~4m), got ${max[0] - min[0]}`)
})
