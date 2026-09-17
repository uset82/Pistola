import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildEarAttachmentSpecs,
  buildFaceExtrusionSpec,
  buildShellPanelSpecs,
  getBoxBodySummary,
} from '@pascal-app/editor/lib/assistant/box-features'
import { CadBodyNodeSchema } from '../../../packages/core/src/schema/nodes/cad-body'
import { buildFallbackCadBrief } from './cad-deterministic-brief'
import { resolveLocalCadIntent } from './cad-local-intent'

test('buildFallbackCadBrief handles a Spanish cube prompt deterministically', () => {
  const brief = buildFallbackCadBrief('crea un cubo 1 m x 2 m x 0.5 m', {
    levelId: 'level_0',
  })

  assert.equal(brief.sketchPlans.length, 1)
  assert.equal(brief.operationGraph.length, 1)
  assert.equal(brief.operationGraph[0]?.op, 'extrude')
  assert.deepEqual(brief.ambiguities, [])
})

test('buildFallbackCadBrief handles a simple cylinder prompt deterministically', () => {
  const brief = buildFallbackCadBrief('create a cylinder 0.3 m diameter and 1.2 m height', {
    levelId: 'level_0',
  })

  assert.equal(brief.sketchPlans[0]?.entities[0]?.type, 'circle')
  assert.equal(brief.operationGraph[0]?.op, 'extrude')
  assert.deepEqual(brief.ambiguities, [])
})

test('buildFallbackCadBrief handles a round plate prompt deterministically', () => {
  const brief = buildFallbackCadBrief('create a round plate 0.3 m diameter and 0.02 m thick', {
    levelId: 'level_0',
  })

  assert.equal(brief.sketchPlans[0]?.entities[0]?.type, 'circle')
  assert.equal(brief.operationGraph[0]?.params.distance, 0.02)
  assert.deepEqual(brief.ambiguities, [])
})

test('resolveLocalCadIntent routes the selected cube ears prompt locally', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Cube Body',
    parentId: 'level_0',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    preview: {
      primitive: 'box',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: [],
  })

  const intent = resolveLocalCadIntent('al cubo conviertelo en la superficie dale unas orejas', {
    parentId: 'level_0',
    nodes: {
      [body.id]: body,
    },
    selectedIds: [body.id],
    levelId: 'level_0',
  })

  assert.ok(intent)
  assert.equal(intent?.kind, 'add_box_ears')
  assert.match(intent?.assumptions.join(' ') ?? '', /top face/i)
})

test('resolveLocalCadIntent routes shell-like selected-box prompts locally', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Cube Body',
    parentId: 'level_0',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    preview: {
      primitive: 'box',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: [],
  })

  const intent = resolveLocalCadIntent('convert the selected body into a shell surface', {
    parentId: 'level_0',
    nodes: {
      [body.id]: body,
    },
    selectedIds: [body.id],
    levelId: 'level_0',
  })

  assert.ok(intent)
  assert.equal(intent?.kind, 'shell_box_body')
  assert.match(intent?.assumptions.join(' ') ?? '', /shell panels|surface panels/i)
})

test('resolveLocalCadIntent routes face-tab prompts on the selected box locally', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Cube Body',
    parentId: 'level_0',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    preview: {
      primitive: 'box',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: [],
  })

  const intent = resolveLocalCadIntent('extrude the front face 0.2 m', {
    parentId: 'level_0',
    nodes: {
      [body.id]: body,
    },
    selectedIds: [body.id],
    levelId: 'level_0',
  })

  assert.ok(intent)
  assert.equal(intent?.kind, 'extrude_box_face')
  assert.equal(intent?.face, 'front')
  assert.equal(intent?.distance, 0.2)
})

test('buildEarAttachmentSpecs creates symmetric top attachments for a box body', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Cube Body',
    parentId: 'level_0',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    preview: {
      primitive: 'box',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: [],
  })

  const summary = getBoxBodySummary(body)
  assert.ok(summary)

  const [leftEar, rightEar] = buildEarAttachmentSpecs(summary!)

  assert.equal(leftEar.position[1], 1)
  assert.equal(rightEar.position[1], 1)
  assert.equal(leftEar.position[0], -rightEar.position[0])
  assert.equal(leftEar.dimensions[0], rightEar.dimensions[0])
  assert.equal(leftEar.dimensions[1], rightEar.dimensions[1])
  assert.equal(leftEar.dimensions[2], rightEar.dimensions[2])
})

test('buildFaceExtrusionSpec creates a front tab with the requested distance', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Cube Body',
    parentId: 'level_0',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    preview: {
      primitive: 'box',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: [],
  })

  const summary = getBoxBodySummary(body)
  assert.ok(summary)

  const tab = buildFaceExtrusionSpec(summary!, 'front', 0.2)

  assert.match(tab.name, /front tab/i)
  assert.equal(tab.dimensions[1], 0.2)
  assert.equal(tab.position[2], 0.5)
})

test('buildShellPanelSpecs creates six thin surface panels for a box body', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Cube Body',
    parentId: 'level_0',
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    preview: {
      primitive: 'box',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
    },
    operations: [],
    operationHistory: [],
    artifacts: {},
    warnings: [],
  })

  const summary = getBoxBodySummary(body)
  assert.ok(summary)

  const panels = buildShellPanelSpecs(summary!, 0.05)

  assert.equal(panels.length, 6)
  assert.equal(
    panels.every((panel) => panel.dimensions.includes(0.05)),
    true,
  )
})
