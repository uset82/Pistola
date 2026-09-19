import assert from 'node:assert/strict'
import test from 'node:test'
import { countOpenEdges, evaluateCadSolidSpec, validateCadSolidSpec } from './local-kernel'
import { ASYMMETRIC_L_SPEC, MANUAL_OP_EXAMPLES } from './manual-examples'
import { projectBoxToView } from './views'

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

  const aliased = evaluateCadSolidSpec({
    op: 'intersect_profiles',
    profileXY: sideProfile,
    profileXZ: topProfile,
  })
  assert.ok(Math.abs(aliased.volume - hull.volume) < 0.05)
})

test('intersect_profiles derives each missing extrusion axis from the other supplied profiles', () => {
  const profileXY: [number, number][] = [
    [10, 20],
    [14, 20],
    [14, 23],
    [10, 23],
  ]
  const profileXZ: [number, number][] = [
    [10, 30],
    [14, 30],
    [14, 35],
    [10, 35],
  ]
  const profileZY: [number, number][] = [
    [30, 20],
    [35, 20],
    [35, 23],
    [30, 23],
  ]

  const assertOffOriginHull = (name: string, spec: object) => {
    const mesh = evaluateCadSolidSpec(spec)
    const [min, max] = mesh.bbox
    assert.ok(mesh.volume > 1, `${name} should produce a non-empty solid`)
    assert.ok(Math.abs(min[0] - 10) < 0.15 && Math.abs(max[0] - 14) < 0.15, `${name} should keep the X range`)
    assert.ok(Math.abs(min[1] - 20) < 0.15 && Math.abs(max[1] - 23) < 0.15, `${name} should keep the Y range`)
    assert.ok(Math.abs(min[2] - 30) < 0.15 && Math.abs(max[2] - 35) < 0.15, `${name} should keep the Z range`)
  }

  assertOffOriginHull('XY + XZ', { op: 'intersect_profiles', profileXY, profileXZ })
  assertOffOriginHull('XY + ZY', { op: 'intersect_profiles', profileXY, profileZY })
  assertOffOriginHull('XZ + ZY', { op: 'intersect_profiles', profileXZ, profileZY })
  assertOffOriginHull('XY + XZ + ZY', { op: 'intersect_profiles', profileXY, profileXZ, profileZY })
})

test('revolve closes and reports 0 open edges', () => {
  const mesh = evaluateCadSolidSpec({
    op: 'revolve',
    profile: [
      [0.2, 0],
      [1, 0],
      [1, 2],
      [0.2, 2],
    ],
    angle: 360,
  })
  assert.equal(countOpenEdges(mesh), 0)
})

test('kernel errors carry the spec path', () => {
  assert.throws(
    () =>
      evaluateCadSolidSpec({
        op: 'extrude',
        polygon: [
          [0, 0],
          [1, 1],
          [1, 0],
          [0, 1],
        ],
        height: 0.2,
      }),
    /spec\.polygon/,
  )
})

test('every manual example executes', () => {
  for (const [name, spec] of Object.entries(MANUAL_OP_EXAMPLES)) {
    const mesh = evaluateCadSolidSpec(spec)
    assert.ok(mesh.positions.length > 0, name)
  }
})

test('asymmetric L-shape locks the view axes', () => {
  const mesh = evaluateCadSolidSpec(ASYMMETRIC_L_SPEC)
  const front = projectBoxToView(mesh.bbox[0], mesh.bbox[1], 'front')
  const side = projectBoxToView(mesh.bbox[0], mesh.bbox[1], 'side')
  assert.ok(front.size[0] > side.size[0] + 0.2, `front u ${front.size[0]} should beat side u ${side.size[0]}`)
  assert.ok(Math.abs(front.size[1] - side.size[1]) < 0.05)
})
