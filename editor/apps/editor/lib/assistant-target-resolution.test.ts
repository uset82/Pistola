import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findAssistantTargetById,
  getAssistantTargetSummaries,
  resolveAssistantPromptTarget,
} from './assistant-target-resolution'

test('getAssistantTargetSummaries keeps unique targets across session, selection, and scene context', () => {
  const targets = getAssistantTargetSummaries({
    assistantSession: {
      lastCreatedNodes: [{ id: 'zone_living', type: 'zone', name: 'Living Room' }],
      recentReferencedNodes: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
    },
    selectedNodeSummary: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
    sceneSummary: [{ id: 'wall_main', type: 'wall', name: 'Main Wall' }],
  })

  assert.deepEqual(targets, [
    { id: 'item_sofa', type: 'item', name: 'Sofa' },
    { id: 'zone_living', type: 'zone', name: 'Living Room' },
    { id: 'wall_main', type: 'wall', name: 'Main Wall' },
  ])
})

test('findAssistantTargetById resolves explicit ids from the shared summary set', () => {
  const target = findAssistantTargetById(
    {
      sceneSummary: [{ id: 'item_42', type: 'item', name: 'Bar Stool' }],
    },
    'item_42',
  )

  assert.deepEqual(target, { id: 'item_42', type: 'item', name: 'Bar Stool' })
})

test('resolveAssistantPromptTarget prefers the current selection over prompt and session fallbacks', () => {
  const resolution = resolveAssistantPromptTarget({
    context: {
      selectedNodeSummary: [{ id: 'wall_main', type: 'wall', name: 'Main Wall' }],
      sceneSummary: [{ id: 'zone_kitchen', type: 'zone', name: 'Kitchen' }],
      assistantSession: {
        lastCreatedNodes: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
        recentReferencedNodes: [],
      },
    },
    normalizedPrompt: 'move kitchen left',
    selection: {
      selectedIds: ['wall_main'],
    },
  })

  assert.equal(resolution.source, 'selected')
  assert.deepEqual(resolution.target, { id: 'wall_main', type: 'wall', name: 'Main Wall' })
})

test('resolveAssistantPromptTarget can resolve an explicit node id from the prompt', () => {
  const resolution = resolveAssistantPromptTarget({
    context: {
      sceneSummary: [{ id: 'item_42', type: 'item', name: 'Bar Stool' }],
    },
    normalizedPrompt: 'move item_42 left',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, 'explicit-id')
  assert.deepEqual(resolution.target, { id: 'item_42', type: 'item', name: 'Bar Stool' })
})

test('resolveAssistantPromptTarget can resolve a named prompt target', () => {
  const resolution = resolveAssistantPromptTarget({
    context: {
      sceneSummary: [
        { id: 'zone_living', type: 'zone', name: 'Living Room' },
        { id: 'zone_kitchen', type: 'zone', name: 'Kitchen' },
      ],
    },
    normalizedPrompt: 'rename kitchen',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, 'named-target')
  assert.deepEqual(resolution.target, { id: 'zone_kitchen', type: 'zone', name: 'Kitchen' })
})

test('resolveAssistantPromptTarget falls back to last created targets before recent references in refine mode', () => {
  const resolution = resolveAssistantPromptTarget({
    allowRecentAssistantFallback: true,
    context: {
      assistantSession: {
        lastCreatedNodes: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
        recentReferencedNodes: [{ id: 'wall_main', type: 'wall', name: 'Main Wall' }],
      },
    },
    normalizedPrompt: 'move it left',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, 'last-created')
  assert.deepEqual(resolution.target, { id: 'item_sofa', type: 'item', name: 'Sofa' })
})

test('resolveAssistantPromptTarget falls back to recent referenced targets when nothing newer is available', () => {
  const resolution = resolveAssistantPromptTarget({
    allowRecentAssistantFallback: true,
    context: {
      assistantSession: {
        lastCreatedNodes: [],
        recentReferencedNodes: [{ id: 'item_sofa', type: 'item', name: 'Sofa' }],
      },
    },
    normalizedPrompt: 'move it left',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, 'recent-reference')
  assert.deepEqual(resolution.target, { id: 'item_sofa', type: 'item', name: 'Sofa' })
})

test('resolveAssistantPromptTarget resolves a single window from workspace image hints', () => {
  const resolution = resolveAssistantPromptTarget({
    context: {
      sceneSummary: [{ id: 'window_front', type: 'window', name: 'Front Window' }],
    },
    imageInterpretation: {
      kind: 'workspace',
      ocrText: ['MOVE'],
      annotationHints: [
        { kind: 'region', region: { x: 0.4, y: 0.2, width: 0.2, height: 0.2 } },
        { kind: 'arrow', direction: 'left' },
      ],
      targetHints: [{ text: 'window', targetTypes: ['window'] }],
      buildHints: [{ text: 'Resolve against existing scene nodes first.' }],
      confidence: 0.92,
    },
    normalizedPrompt: 'move this window left',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, 'image-annotation')
  assert.deepEqual(resolution.target, { id: 'window_front', type: 'window', name: 'Front Window' })
  assert.equal(resolution.candidates.length, 1)
})

test('resolveAssistantPromptTarget returns candidate walls from a highlighted workspace region', () => {
  const resolution = resolveAssistantPromptTarget({
    context: {
      sceneSummary: [
        { id: 'wall_a', type: 'wall', name: 'Wall A' },
        { id: 'wall_b', type: 'wall', name: 'Wall B' },
        { id: 'wall_c', type: 'wall', name: 'Wall C' },
      ],
    },
    imageInterpretation: {
      kind: 'workspace',
      ocrText: ['REMOVE'],
      annotationHints: [{ kind: 'region', region: { x: 0.15, y: 0.18, width: 0.6, height: 0.5 } }],
      targetHints: [{ text: 'wall', targetTypes: ['wall'] }],
      buildHints: [{ text: 'Use a reviewable delete set when more than one wall matches.' }],
      confidence: 0.88,
    },
    normalizedPrompt: 'delete the highlighted walls',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, null)
  assert.equal(resolution.target, null)
  assert.equal(resolution.candidates.length, 3)
  assert.match(resolution.explanation ?? '', /plausible/i)
})

test('resolveAssistantPromptTarget uses level context and region overlap to pick the grounded screenshot target', () => {
  const resolution = resolveAssistantPromptTarget({
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [
        { id: 'window_a', type: 'window', name: 'North Opening', parentId: 'level_0', position: [1, 0, 1] },
        { id: 'window_b', type: 'window', name: 'South Opening', parentId: 'level_1', position: [8, 0, 8] },
      ],
      assistantSession: {
        lastCreatedNodes: [],
        recentReferencedNodes: [],
      },
    },
    imageInterpretation: {
      kind: 'workspace',
      ocrText: ['MOVE'],
      annotationHints: [
        { kind: 'region', region: { x: 0.02, y: 0.02, width: 0.18, height: 0.18 } },
        { kind: 'arrow', direction: 'left' },
      ],
      targetHints: [{ text: 'window', targetTypes: ['window'] }],
      buildHints: [{ text: 'Resolve against existing scene nodes first.' }],
      confidence: 0.95,
    },
    normalizedPrompt: 'move this window left',
    selection: {
      selectedIds: [],
    },
  })

  assert.equal(resolution.source, 'image-annotation')
  assert.deepEqual(resolution.target, { id: 'window_a', type: 'window', name: 'North Opening' })
  assert.equal(resolution.candidates[0]?.id, 'window_a')
  assert.equal(resolution.candidates.length, 1)
})
