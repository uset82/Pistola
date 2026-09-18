import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculatePolygonArea,
  calculatePolygonPerimeter,
  executeAgentTool,
  listCapabilities,
  measure,
  searchCatalog,
} from './agent-tools'

test('calculatePolygonArea and calculatePolygonPerimeter compute correct geometry', () => {
  // 4m x 4m square
  const square: Array<[number, number]> = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ]
  const area = calculatePolygonArea(square)
  const perimeter = calculatePolygonPerimeter(square)

  assert.equal(area, 16)
  assert.equal(perimeter, 16)

  // 3-4-5 right triangle
  const triangle: Array<[number, number]> = [
    [0, 0],
    [3, 0],
    [0, 4],
  ]
  assert.equal(calculatePolygonArea(triangle), 6)
  assert.equal(calculatePolygonPerimeter(triangle), 12)
})

test('listCapabilities returns registered capabilities and supports domain filter', () => {
  const all = listCapabilities()
  assert.ok(all.total >= 89)
  assert.ok(all.capabilities.some((c) => c.type === 'create_wall'))
  assert.ok(all.capabilities.some((c) => c.type === 'create_site'))

  const cadOnly = listCapabilities({ domain: 'cad' })
  assert.ok(cadOnly.total >= 20)
  assert.ok(cadOnly.capabilities.every((c) => c.domain === 'cad'))
})

test('searchCatalog matches keywords in name, category, and tags', () => {
  const sofaSearch = searchCatalog({ query: 'sofa' })
  assert.ok(sofaSearch.total > 0)
  assert.ok(sofaSearch.items.some((item) => item.name.toLowerCase().includes('sofa') || item.category === 'furniture'))

  const kitchenSearch = searchCatalog({ query: '', category: 'kitchen' })
  assert.ok(kitchenSearch.total > 0)
  assert.ok(kitchenSearch.items.every((item) => item.category === 'kitchen'))
})

test('measure distance calculates euclidean distance between 3D points', () => {
  const result = measure({
    mode: 'distance',
    pointA: [0, 0, 0],
    pointB: [3, 0, 4],
  })
  assert.equal(result.mode, 'distance')
  if (result.mode === 'distance') {
    assert.equal(result.distance, 5)
  }
})

test('executeAgentTool dispatches known tools correctly', async () => {
  const caps = (await executeAgentTool('list_capabilities', { domain: 'structure' })) as any
  assert.ok(caps.total > 0)
  assert.ok(caps.capabilities.every((c: any) => c.domain === 'structure'))

  const finishResult = (await executeAgentTool('finish', { reply: 'Build complete.', assumptions: ['Assumed standard height.'] })) as any
  assert.equal(finishResult.status, 'finished')
  assert.equal(finishResult.reply, 'Build complete.')
})
