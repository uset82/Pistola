import assert from 'node:assert/strict'
import test from 'node:test'

import { interpretAssistantImage, isWorkspaceImageCommandPrompt } from './assistant-image-interpretation'

test('interpretAssistantImage classifies annotated workspace commands as workspace intent', () => {
  const interpretation = interpretAssistantImage({
    prompt: 'clean this area',
    context: {
      sceneSummary: [{ id: 'wall_a', type: 'wall', name: 'Wall A' }],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace',
      kind: 'auto',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
        imageWidth: 800,
        imageHeight: 600,
        redPixelCount: 750,
        annotationKinds: [],
      },
    },
  })

  assert.equal(interpretation?.kind, 'workspace')
  assert.equal(interpretation?.annotationHints[0]?.kind, 'region')
  assert.equal(interpretation?.targetHints[0]?.targetTypes.includes('zone'), true)
  assert.equal(
    isWorkspaceImageCommandPrompt(
      'clean this area',
      {
        dataUrl: 'data:image/png;base64,workspace',
        kind: 'workspace',
        source: 'upload',
      },
      { sceneSummary: [{ id: 'wall_a', type: 'wall', name: 'Wall A' }] },
    ),
    true,
  )
})

test('interpretAssistantImage classifies floor plan prompts separately from workspace screenshots', () => {
  const interpretation = interpretAssistantImage({
    prompt: 'recreate this floor plan approximately',
    context: {},
    image: {
      dataUrl: 'data:image/png;base64,floorplan',
      kind: 'auto',
      source: 'upload',
    },
  })

  assert.equal(interpretation?.kind, 'floorplan')
  assert.match(interpretation?.buildHints[0]?.text ?? '', /floor plan/i)
})

test('interpretAssistantImage detects room references, sketches, and unknown uploads', () => {
  const roomReference = interpretAssistantImage({
    prompt: 'use this room reference to furnish the room approximately',
    context: {},
    image: {
      dataUrl: 'data:image/png;base64,room-reference',
      kind: 'auto',
      source: 'upload',
      filename: 'living-room-reference.png',
    },
  })
  const sketch = interpretAssistantImage({
    prompt: 'create a simple bracket approximation from this drawing',
    context: {},
    image: {
      dataUrl: 'data:image/png;base64,sketch',
      kind: 'auto',
      source: 'upload',
      filename: 'bracket-sketch.png',
    },
  })
  const unknown = interpretAssistantImage({
    prompt: 'what is this?',
    context: {},
    image: {
      dataUrl: 'data:image/png;base64,unknown',
      kind: 'auto',
      source: 'upload',
      filename: 'mystery-upload.png',
    },
  })

  assert.equal(roomReference?.kind, 'room-reference')
  assert.equal(sketch?.kind, 'sketch')
  assert.equal(unknown?.kind, 'unknown')
  assert.match(unknown?.buildHints[0]?.text ?? '', /did not strongly match/i)
})

test('interpretAssistantImage prioritizes workspace screenshots when viewport and UI cues match the editor', () => {
  const interpretation = interpretAssistantImage({
    prompt: 'move this window left',
    context: {
      sceneSummary: [{ id: 'window_front', type: 'window', name: 'Front Window' }],
    },
    image: {
      dataUrl: 'data:image/png;base64,reference-looking-name',
      kind: 'auto',
      source: 'upload',
      filename: 'reference.png',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.42, y: 0.2, width: 0.26, height: 0.18 },
        imageWidth: 1365,
        imageHeight: 768,
        redPixelCount: 920,
        viewportMatchScore: 0.99,
        workspaceUiScore: 0.71,
        annotationKinds: ['arrow', 'region'],
      },
    },
  })

  assert.equal(interpretation?.kind, 'workspace')
  assert.equal(interpretation?.annotationHints.some((hint) => hint.kind === 'arrow'), true)
})

test('interpretAssistantImage extracts OCR-style intent and annotation hints from workspace screenshots', () => {
  const interpretation = interpretAssistantImage({
    prompt: 'remove this',
    context: {
      sceneSummary: [{ id: 'roof_main', type: 'roof', name: 'Main Roof' }],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace-remove',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.3, y: 0.18, width: 0.28, height: 0.26 },
        imageWidth: 1365,
        imageHeight: 768,
        redPixelCount: 1020,
        annotationKinds: ['circle', 'region'],
      },
    },
  })

  assert.deepEqual(interpretation?.ocrText, ['REMOVE'])
  assert.equal(interpretation?.annotationHints.some((hint) => hint.kind === 'circle'), true)
  assert.equal(
    interpretation?.annotationHints.some((hint) => hint.kind === 'label' && hint.label === 'remove'),
    true,
  )
})
