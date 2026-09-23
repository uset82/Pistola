import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countOpenEdges,
  evaluateCadSolidSpec,
  KERNEL_TRIANGLE_BUDGET,
  rawSignedVolume,
  triangleCount,
  validateCadSolidSpec,
} from './local-kernel'
import { runKernelJob } from './kernel-jobs'
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

test('loft, hull, torus, capsule, and ellipsoid produce closed solids', () => {
  const loft = evaluateCadSolidSpec({
    op: 'loft',
    axis: 'y',
    heights: [0, 1],
    sections: [
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
    ],
  })
  assert.ok(Math.abs(loft.volume - 1) / 1 < 0.12, `loft volume ${loft.volume}`)
  assert.equal(countOpenEdges(loft), 0)

  const hull = evaluateCadSolidSpec({
    op: 'hull',
    profileXY: [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ],
    profileZY: [
      [4, 0],
      [7, 0],
      [7, 1],
      [4, 1],
    ],
    profileXZ: [
      [0, 4],
      [2, 4],
      [2, 7],
      [0, 7],
    ],
  })
  assert.ok(hull.volume > 1)
  assert.equal(validateCadSolidSpec({ op: 'hull', profileXY: [[0, 0], [1, 0], [1, 1]], profileXZ: [[0, 0], [1, 0], [1, 1]] }).success, false)

  const torus = evaluateCadSolidSpec({ op: 'torus', R: 0.4, r: 0.1 })
  const torusVolume = 2 * Math.PI ** 2 * 0.4 * 0.1 ** 2
  assert.ok(Math.abs(torus.volume - torusVolume) / torusVolume < 0.15, `torus ${torus.volume} vs ${torusVolume}`)
  assert.equal(countOpenEdges(torus), 0)
  assert.ok(Math.abs(torus.bbox[0][1]) < 0.02, 'torus sits on y=0')

  const capsule = evaluateCadSolidSpec({ op: 'capsule', r: 0.2, h: 0.6 })
  const capsuleVolume = Math.PI * 0.2 ** 2 * 0.6 + (4 / 3) * Math.PI * 0.2 ** 3
  assert.ok(Math.abs(capsule.volume - capsuleVolume) / capsuleVolume < 0.12, `capsule ${capsule.volume} vs ${capsuleVolume}`)
  assert.equal(countOpenEdges(capsule), 0)

  const ellipsoid = evaluateCadSolidSpec({ op: 'ellipsoid', radii: [0.4, 0.3, 0.2] })
  const ellipsoidVolume = (4 / 3) * Math.PI * 0.4 * 0.3 * 0.2
  assert.ok(Math.abs(ellipsoid.volume - ellipsoidVolume) / ellipsoidVolume < 0.12, `ellipsoid ${ellipsoid.volume} vs ${ellipsoidVolume}`)
})

test('angle-based normals keep box creases and smooth a cylinder wall', () => {
  const box = evaluateCadSolidSpec({ op: 'box', size: [1, 1, 1] })
  const boxNormals = box.normals ?? []
  assert.equal(boxNormals.length, box.positions.length)
  const top = []
  for (let i = 0; i < box.indices.length; i += 3) {
    const ia = box.indices[i] ?? 0
    const y0 = box.positions[ia * 3 + 1] ?? 0
    const y1 = box.positions[(box.indices[i + 1] ?? 0) * 3 + 1] ?? 0
    const y2 = box.positions[(box.indices[i + 2] ?? 0) * 3 + 1] ?? 0
    if (Math.abs(y0 - 1) < 1e-6 && Math.abs(y1 - 1) < 1e-6 && Math.abs(y2 - 1) < 1e-6) {
      top.push(ia)
    }
  }
  assert.ok(top.length > 0)
  const topNormalY = boxNormals[(top[0] ?? 0) * 3 + 1] ?? 0
  assert.ok(topNormalY > 0.95)

  const corner: [number, number, number][] = []
  for (let i = 0; i < box.positions.length; i += 3) {
    const x = box.positions[i] ?? 0
    const y = box.positions[i + 1] ?? 0
    const z = box.positions[i + 2] ?? 0
    if (Math.abs(x + 0.5) < 1e-5 && Math.abs(y - 1) < 1e-5 && Math.abs(z + 0.5) < 1e-5) {
      corner.push([boxNormals[i] ?? 0, boxNormals[i + 1] ?? 0, boxNormals[i + 2] ?? 0])
    }
  }
  assert.ok(corner.length >= 2)
  const a: [number, number, number] = corner[0] ?? [0, 1, 0]
  const b = corner.find((normal) => Math.abs(normal[0] * a[0] + normal[1] * a[1] + normal[2] * a[2]) < 0.2)
  assert.ok(b, 'box corner should keep a sharp crease')

  const cylinder = evaluateCadSolidSpec({ op: 'cylinder', r: 1, h: 2 })
  const normals = cylinder.normals ?? []
  let radialDot = 0
  let radialCount = 0
  for (let i = 0; i < cylinder.positions.length; i += 3) {
    const px = cylinder.positions[i] ?? 0
    const pz = cylinder.positions[i + 2] ?? 0
    const pr = Math.hypot(px, pz)
    if (pr < 0.85) continue
    const nx = normals[i] ?? 0
    const ny = normals[i + 1] ?? 0
    const nz = normals[i + 2] ?? 0
    if (Math.abs(ny) > 0.35) continue
    radialDot += (nx * px + nz * pz) / pr
    radialCount += 1
  }
  assert.ok(radialCount > 8)
  assert.ok(Math.abs(radialDot / radialCount) > 0.9)
})

test('complexity budget rejects oversized meshes and kernel jobs evaluate on a worker-ready path', async () => {
  assert.equal(KERNEL_TRIANGLE_BUDGET, 50_000)
  assert.throws(
    () => evaluateCadSolidSpec({ op: 'box', size: [1, 1, 1] }, { budget: 1 }),
    /complexity budget/,
  )
  const mesh = await runKernelJob({ kind: 'evaluate', spec: { op: 'box', size: [1, 1, 1] } })
  assert.ok(triangleCount(mesh) > 1)
  assert.ok((mesh.normals?.length ?? 0) === mesh.positions.length)
})

test('every solid op has outward winding and group merges without a boolean', () => {
  const specs = [
    { op: 'box', size: [1, 1, 1] },
    { op: 'cylinder', r: 0.4, h: 1 },
    { op: 'sphere', r: 0.5 },
    { op: 'extrude', polygon: [[-0.5, -0.4], [0.5, -0.4], [0.5, 0.4], [-0.5, 0.4]], height: 0.2 },
    { op: 'revolve', profile: [[0.2, 0], [0.4, 0], [0.4, 0.6], [0.2, 0.6]] },
    { op: 'torus', R: 0.4, r: 0.1 },
    { op: 'capsule', r: 0.2, h: 0.6 },
    { op: 'ellipsoid', radii: [0.4, 0.3, 0.2] },
    { op: 'loft', sections: [[[-0.4, -0.3], [0.4, -0.3], [0.4, 0.3], [-0.4, 0.3]], [[-0.2, -0.15], [0.2, -0.15], [0.2, 0.15], [-0.2, 0.15]]], heights: [0, 0.5] },
    {
      op: 'hull',
      profileXY: [[0, 0], [1, 0], [1, 1], [0, 1]],
      profileZY: [[0, 0], [1, 0], [1, 1], [0, 1]],
      profileXZ: [[0, 0], [1, 0], [1, 1], [0, 1]],
    },
  ] as const
  for (const spec of specs) {
    const mesh = evaluateCadSolidSpec(spec)
    const signed = rawSignedVolume(mesh.positions, mesh.indices)
    assert.ok(signed > 0, `${spec.op} signed volume ${signed}`)
  }
  const grouped = evaluateCadSolidSpec({
    op: 'group',
    children: [
      { op: 'box', size: [0.4, 0.4, 0.4] },
      { op: 'box', size: [0.4, 0.4, 0.4], translate: [1, 0, 0] },
    ],
  })
  assert.ok(rawSignedVolume(grouped.positions, grouped.indices) > 0)
  assert.ok(grouped.volume > 0.1)
})

test('touching unions weld down to a closed solid', () => {
  const boxes = evaluateCadSolidSpec({
    op: 'union',
    children: [
      { op: 'box', size: [1, 1, 1] },
      { op: 'box', size: [1, 1, 1], translate: [1, 0, 0] },
    ],
  })
  assert.equal(countOpenEdges(boxes), 0)
  assert.ok(rawSignedVolume(boxes.positions, boxes.indices) > 0)

  const stacked = evaluateCadSolidSpec({
    op: 'union',
    children: [
      { op: 'cylinder', r: 0.25, h: 0.5 },
      { op: 'cylinder', r: 0.25, h: 0.5, translate: [0, 0.5, 0] },
    ],
  })
  const open = countOpenEdges(stacked)
  assert.ok(open <= 8, `coaxial cylinder union open edges ${open}`)
  assert.ok(rawSignedVolume(stacked.positions, stacked.indices) > 0)
  const sphere = evaluateCadSolidSpec({ op: 'sphere', r: 0.3 })
  assert.equal(countOpenEdges(sphere), 0)
  assert.ok(rawSignedVolume(sphere.positions, sphere.indices) > 0)
})
