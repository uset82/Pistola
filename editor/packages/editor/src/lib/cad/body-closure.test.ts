import assert from 'node:assert/strict'
import test from 'node:test'

import { collectBodyClosure } from './body-closure'

type NodeMap = Parameters<typeof collectBodyClosure>[0]

const extrude = (sketchId: string): Record<string, unknown> => ({
  id: `extrude-${sketchId}`,
  type: 'extrude',
  kind: 'extrude',
  suppressed: false,
  sketchId,
  params: { distance: 0.02, direction: [0, 1, 0], symmetric: false },
  depth: 0.02,
  distance: 0.02,
  direction: [0, 1, 0],
  symmetric: false,
})

const booleanCut = (toolBodyIds: string[]): Record<string, unknown> => ({
  id: 'cadop-cut',
  type: 'boolean_cut',
  kind: 'boolean_cut',
  suppressed: false,
  params: { toolBodyIds },
  operation: 'cut',
  toolBodyIds,
})

const body = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  type: 'cad-body',
  name: id,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  operations: [],
  operationHistory: [],
  ...overrides,
})

const scene = (): NodeMap =>
  ({
    'body-a': body('body-a', { operations: [extrude('sketch-1')] }),
    'body-b': body('body-b', {
      operations: [extrude('sketch-2')],
      position: [0.01, 0.002, 0.003],
    }),
    'sketch-1': { id: 'sketch-1', type: 'cad-sketch', entities: [] },
    'sketch-2': { id: 'sketch-2', type: 'cad-sketch', entities: [] },
    'level-1': { id: 'level-1', type: 'level' },
  }) as unknown as NodeMap

test('with no bodyIds every CAD body is inspected and its sketches are carried', () => {
  const closure = collectBodyClosure(scene())

  assert.deepEqual(closure.bodyIds, ['body-a', 'body-b'])
  assert.deepEqual(closure.againstBodyIds, [])
  assert.deepEqual(Object.keys(closure.bodies).sort(), ['body-a', 'body-b'])
  assert.deepEqual(Object.keys(closure.sketches).sort(), ['sketch-1', 'sketch-2'])
})

test('explicit bodyIds are kept in order and filtered to CAD bodies', () => {
  const closure = collectBodyClosure(scene(), {
    bodyIds: ['body-b', 'level-1', 'missing'],
  })

  assert.deepEqual(closure.bodyIds, ['body-b'])
  assert.deepEqual(Object.keys(closure.bodies), ['body-b'])
  assert.deepEqual(Object.keys(closure.sketches), ['sketch-2'])
})

test('a clearance baseline is rebuilt but not inspected', () => {
  const closure = collectBodyClosure(scene(), {
    bodyIds: ['body-a'],
    againstBodyIds: ['body-b'],
  })

  assert.deepEqual(closure.bodyIds, ['body-a'])
  assert.deepEqual(closure.againstBodyIds, ['body-b'])
  // Both are in the closure so the helper can rebuild them into one document.
  assert.deepEqual(Object.keys(closure.bodies).sort(), ['body-a', 'body-b'])
})

test('a clearance baseline is excluded from the default body set', () => {
  const closure = collectBodyClosure(scene(), { againstBodyIds: ['body-b'] })

  assert.deepEqual(closure.bodyIds, ['body-a'])
  assert.deepEqual(closure.againstBodyIds, ['body-b'])
})

test('boolean tool bodies join the closure without becoming inspected bodies', () => {
  const nodes = scene() as unknown as Record<string, Record<string, unknown>>
  nodes['body-a'] = body('body-a', { operations: [booleanCut(['body-b'])] })

  const closure = collectBodyClosure(nodes as unknown as NodeMap, {
    bodyIds: ['body-a'],
  })

  assert.deepEqual(closure.bodyIds, ['body-a'])
  assert.deepEqual(Object.keys(closure.bodies).sort(), ['body-a', 'body-b'])
})

test('operationHistory wins over the mirrored operations list', () => {
  const nodes = scene() as unknown as Record<string, Record<string, unknown>>
  nodes['body-a'] = body('body-a', {
    operations: [extrude('sketch-1')],
    operationHistory: [extrude('sketch-1'), extrude('sketch-2')],
  })

  const closure = collectBodyClosure(nodes as unknown as NodeMap, {
    bodyIds: ['body-a'],
  })

  assert.equal(closure.bodies['body-a']?.operations.length, 2)
  assert.deepEqual(Object.keys(closure.sketches).sort(), ['sketch-1', 'sketch-2'])
})

test('scene placement is carried for every body', () => {
  const closure = collectBodyClosure(scene(), { bodyIds: ['body-b'] })

  assert.deepEqual(closure.bodies['body-b']?.position, [0.01, 0.002, 0.003])
  assert.deepEqual(closure.bodies['body-b']?.rotation, [0, 0, 0])
  assert.deepEqual(closure.bodies['body-b']?.scale, [1, 1, 1])
})
