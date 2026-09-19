import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createForegroundMask,
  findConnectedComponents,
  mooreTraceContour,
  simplifyClosedPolygon,
  traceOrthoImageGrid,
  type PixelGrid,
} from './silhouette-tracer'
import { evaluateCadSolidSpec, validateCadSolidSpec } from './local-kernel'

const createMockImageGrid = (width: number, height: number, drawShapes: (setPixel: (x: number, y: number) => void) => void): PixelGrid => {
  const data = new Uint8ClampedArray(width * height * 4)
  // Fill background with white
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 255
    data[i * 4 + 1] = 255
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = 255
  }

  const setPixel = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = (y * width + x) * 4
      data[idx] = 20
      data[idx + 1] = 20
      data[idx + 2] = 20
      data[idx + 3] = 255
    }
  }

  drawShapes(setPixel)
  return { width, height, data }
}

test('silhouette-tracer extracts clean mask and traces closed contour', () => {
  const grid = createMockImageGrid(40, 40, (setPixel) => {
    // Draw a 20x10 rectangle
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 30; x++) {
        setPixel(x, y)
      }
    }
  })

  const mask = createForegroundMask(grid)
  assert.equal(mask.length, 40)
  assert.equal(mask[0]?.length, 40)
  assert.equal(mask[15]![20], true)
  assert.equal(mask[5]![5], false)

  const comps = findConnectedComponents(mask)
  assert.equal(comps.length, 1)
  assert.equal(comps[0]!.length, 200)

  const contour = mooreTraceContour(comps[0]!)
  assert.ok(contour.length >= 20)

  const simplified = simplifyClosedPolygon(contour, 1.0)
  assert.ok(simplified.length <= 8, `Expected simplified rectangle to have <= 8 vertices, got ${simplified.length}`)
})

test('traceOrthoImageGrid converts orthographic views directly into valid CAD solid', () => {
  const grid = createMockImageGrid(100, 100, (setPixel) => {
    // Side view: upper rectangle (x: 20..80, y: 15..35)
    for (let y = 15; y < 35; y++) {
      for (let x = 20; x < 80; x++) {
        setPixel(x, y)
      }
    }
    // Top view: lower ellipse/diamond (x: 25..75, y: 65..85)
    for (let y = 65; y < 85; y++) {
      for (let x = 25; x < 75; x++) {
        const dx = (x - 50) / 25
        const dy = (y - 75) / 10
        if (dx * dx + dy * dy <= 1) {
          setPixel(x, y)
        }
      }
    }
  })

  const result = traceOrthoImageGrid(grid, { lengthM: 4.0, widthM: 1.6, heightM: 1.2 }, { epsilon: 1.2 })
  assert.equal(result.action, 'build_cad_solid')
  assert.equal(result.spec.op, 'intersect_profiles')
  assert.ok(result.spec.sideProfile.length >= 4)
  assert.ok(result.spec.topProfile.length >= 4)

  // Validate with local kernel
  const validation = validateCadSolidSpec(result.spec)
  assert.equal(validation.success, true)

  // Evaluate solid geometry
  const mesh = evaluateCadSolidSpec(result.spec)
  assert.ok(mesh.volume > 0.5, `Generated solid volume should be positive, got ${mesh.volume}`)
  assert.ok(mesh.positions.length > 20)
})
