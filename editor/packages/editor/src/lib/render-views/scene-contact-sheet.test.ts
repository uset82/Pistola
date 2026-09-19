import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_VIEW_ORDER } from './canonical-views'
import {
  renderSceneContactSheet,
  stableColorForPart,
  type RenderableAabbPart,
} from './scene-contact-sheet'

const viewSection = (svg: string, viewId: string) => {
  const start = svg.indexOf(`data-view-id="${viewId}"`)
  assert.notEqual(start, -1, `${viewId} should have a contact-sheet cell`)
  const next = svg.indexOf('data-view-id="', start + 1)
  return svg.slice(start, next === -1 ? undefined : next)
}

const polygonPoints = (section: string, id: string) => {
  const match = section.match(new RegExp(`<polygon[^>]*data-part-id="${id}"[^>]*points="([^"]+)"`))
  assert.ok(match, `expected ${id} to be projected as a polygon`)
  return match[1] ?? ''
}

test('renders all eight canonical labels into the stable 4 by 2 contact-sheet cells', () => {
  const result = renderSceneContactSheet([])

  assert.equal(result.columns, 4)
  assert.equal(result.rows, 2)
  assert.deepEqual(
    result.views.map((view) => view.id),
    CANONICAL_VIEW_ORDER,
  )
  assert.deepEqual(
    result.views.map(({ index, row, column }) => [index, row, column]),
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

  for (const view of result.views) {
    assert.match(result.svg, new RegExp(`data-view-id="${view.id}"`))
    assert.match(result.svg, new RegExp(`>${view.label}</text>`))
    assert.equal(view.cell.width > 0 && view.cell.height > 0, true)
    assert.equal(view.floorLine.x1 < view.floorLine.x2, true)
  }
  assert.equal((result.svg.match(/data-role="grid"/g) ?? []).length, 8)
  assert.equal((result.svg.match(/data-role="floor-line"/g) ?? []).length, 8)
})

test('projects actual AABB geometry into every view and gives each part a stable color', () => {
  const parts: RenderableAabbPart[] = [
    {
      id: 'hull',
      name: 'Hull',
      bounds: { min: [-2, 0, -0.6], max: [2, 0.8, 0.6] },
    },
    {
      id: 'mast',
      name: 'Mast',
      bounds: { min: [-0.08, 0.8, -0.08], max: [0.08, 3.2, 0.08] },
      color: '#BADA55',
    },
  ]
  const first = renderSceneContactSheet(parts)
  const second = renderSceneContactSheet([...parts].reverse())

  assert.equal(first.partColors.hull, stableColorForPart('hull'))
  assert.equal(first.partColors.mast, '#BADA55')
  assert.deepEqual(first.partColors, second.partColors)
  assert.equal((first.svg.match(/data-part-id="hull"/g) ?? []).length, 8)
  assert.equal((first.svg.match(/data-part-id="mast"/g) ?? []).length, 8)

  const frontHull = polygonPoints(viewSection(first.svg, 'front'), 'hull')
  const topHull = polygonPoints(viewSection(first.svg, 'top'), 'hull')
  const frontMast = polygonPoints(viewSection(first.svg, 'front'), 'mast')
  assert.notEqual(frontHull, topHull, 'front and top must use different actual AABB projections')
  assert.notEqual(
    frontHull,
    frontMast,
    'different AABBs must render as different projected geometry',
  )
  assert.match(first.svg, /fill="#BADA55"/)
})

test('rejects unsafe or unbounded input before generating an SVG', () => {
  assert.throws(
    () =>
      renderSceneContactSheet([
        {
          id: 'bad',
          bounds: { min: [1, 0, 0], max: [0, 1, 1] },
        },
      ]),
    /bounds\.min must not exceed bounds\.max/,
  )
  assert.throws(
    () =>
      renderSceneContactSheet([
        {
          id: 'behind-no-one',
          bounds: { min: [0, 0, 0], max: [Number.POSITIVE_INFINITY, 1, 1] },
        },
      ]),
    /finite coordinates/,
  )
})
