const assert = require('node:assert/strict')
const path = require('node:path')

const { chromium } = require(path.resolve(__dirname, '../editor/node_modules/playwright'))

const BASE_URL = 'http://127.0.0.1:3002'

async function waitForDevBridge(page) {
  await page.waitForFunction(
    () =>
      Boolean(
        window.__PASCAL_DEV__?.useCad &&
          window.__PASCAL_DEV__?.useEditor &&
          window.__PASCAL_DEV__?.useScene &&
          window.__PASCAL_DEV__?.useViewer,
      ),
    undefined,
    { timeout: 30_000 },
  )
}

async function resetCadScene(page) {
  await page.evaluate(() => {
    const dev = window.__PASCAL_DEV__
    dev.useScene.getState().clearScene()
    dev.useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
    dev.useEditor.getState().setSelectedReferenceId(null)
    dev.useEditor.getState().setActiveSketchId(null)
    dev.useEditor.getState().setPhase('cad')
    dev.useEditor.getState().setCadMode('sketch')
    dev.useEditor.getState().setMode('select')
    dev.useEditor.getState().setTool(null)
  })

  await page.waitForFunction(() => window.__PASCAL_DEV__.useViewer.getState().selection.levelId !== null)
}

async function setCadTool(page, tool) {
  await page.evaluate((tool) => {
    const editor = window.__PASCAL_DEV__.useEditor.getState()
    editor.setPhase('cad')
    editor.setMode('build')
    editor.setTool(tool)
  }, tool)
  await page.waitForTimeout(150)
}

async function emitGridClick(page, position) {
  await page.evaluate((position) => {
    const event = {
      position,
      nativeEvent: {},
    }

    window.__PASCAL_DEV__.emitter.emit('grid:move', event)
    window.__PASCAL_DEV__.emitter.emit('grid:click', event)
  }, position)
  await page.waitForTimeout(150)
}

async function createRectangleSketch(page, position) {
  await setCadTool(page, 'cad-sketch')
  await emitGridClick(page, position)

  const sketchId = await page.evaluate(() => window.__PASCAL_DEV__.useEditor.getState().activeSketchId)
  assert.ok(sketchId, 'expected an active CAD sketch after sketch tool click')

  await setCadTool(page, 'cad-rectangle')
  await emitGridClick(page, position)

  await page.waitForFunction(() => {
    const dev = window.__PASCAL_DEV__
    const sketchId = dev.useEditor.getState().activeSketchId
    const sketch = sketchId ? dev.useScene.getState().nodes[sketchId] : null
    return (
      sketch?.type === 'cad-sketch' &&
      sketch.entities.length === 4 &&
      sketch.closedProfileEntityIds.length === 4 &&
      sketch.constraints.length === 4
    )
  })

  await setCadTool(page, 'cad-dimension')

  await page.waitForFunction(() => {
    const dev = window.__PASCAL_DEV__
    const sketchId = dev.useEditor.getState().activeSketchId
    const sketch = sketchId ? dev.useScene.getState().nodes[sketchId] : null
    return sketch?.type === 'cad-sketch' && sketch.dimensions.length === 1
  })

  return sketchId
}

async function extrudeActiveSketch(page, depth) {
  return page.evaluate(async (depth) => {
    return window.__PASCAL_DEV__.useCad.getState().extrudeSelectedSketch({ depth })
  }, depth)
}

async function applyChamfer(page, edgeRefs, distance) {
  return page.evaluate(async ({ edgeRefs, distance }) => {
    return window.__PASCAL_DEV__.useCad.getState().applyChamferToSelection({
      edgeRefs,
      distance,
    })
  }, { edgeRefs, distance })
}

async function startBodyStatusLog(page, bodyId, key) {
  await page.evaluate(([bodyId, key]) => {
    const dev = window.__PASCAL_DEV__
    window.__CAD_BODY_LOGS__ ??= {}

    if (window.__CAD_BODY_LOGS__[key]?.unsubscribe) {
      window.__CAD_BODY_LOGS__[key].unsubscribe()
    }

    const history = []
    const currentNode = dev.useScene.getState().nodes[bodyId]
    if (currentNode?.type === 'cad-body') {
      history.push(currentNode.regenStatus)
    }

    const unsubscribe = dev.useScene.subscribe((state) => {
      const node = state.nodes[bodyId]
      if (node?.type !== 'cad-body') return

      if (history[history.length - 1] !== node.regenStatus) {
        history.push(node.regenStatus)
      }
    })

    window.__CAD_BODY_LOGS__[key] = {
      history,
      unsubscribe,
    }
  }, [bodyId, key])
}

async function getBodyStatusLog(page, key) {
  return page.evaluate((key) => window.__CAD_BODY_LOGS__?.[key]?.history ?? [], key)
}

async function waitForBodyStatus(page, bodyId, status, timeout = 30_000) {
  await page.waitForFunction(
    ([bodyId, status]) => {
      const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
      return node?.type === 'cad-body' && node.regenStatus === status
    },
    [bodyId, status],
    { timeout },
  )
}

async function getBody(page, bodyId) {
  return page.evaluate((bodyId) => {
    const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
    if (node?.type !== 'cad-body') return null

    return {
      id: node.id,
      regenStatus: node.regenStatus,
      regenError: node.regenError,
      previewArtifactRef: node.previewArtifactRef,
      transform: node.transform,
      operationHistory: node.operationHistory.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        suppressed: operation.suppressed,
      })),
    }
  }, bodyId)
}

async function getSketchDimensionValue(page, sketchId) {
  return page.evaluate((sketchId) => {
    const node = window.__PASCAL_DEV__.useScene.getState().nodes[sketchId]
    return node?.type === 'cad-sketch' ? node.dimensions[0]?.value ?? null : null
  }, sketchId)
}

async function getCadSketchCount(page) {
  return page.evaluate(() =>
    Object.values(window.__PASCAL_DEV__.useScene.getState().nodes).filter(
      (node) => node.type === 'cad-sketch',
    ).length,
  )
}

async function setCadSelection(page, { selectedIds = [], activeSketchId = null, tool = null, mode = 'select' }) {
  await page.evaluate(
    ({ selectedIds, activeSketchId, tool, mode }) => {
      const dev = window.__PASCAL_DEV__
      dev.useEditor.getState().setPhase('cad')
      dev.useEditor.getState().setMode(mode)
      dev.useEditor.getState().setTool(tool)
      dev.useEditor.getState().setActiveSketchId(activeSketchId)
      dev.useViewer.getState().setSelection({ selectedIds, zoneId: null })
    },
    { selectedIds, activeSketchId, tool, mode },
  )
}

async function waitForCommandPalette(page) {
  const input = page.locator('input[placeholder="Search actions…"]')
  await input.waitFor({ state: 'visible', timeout: 10_000 })
  return input
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('Loading editor...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await waitForDevBridge(page)
    await resetCadScene(page)

    console.log('Creating sketch and base body...')
    const sketchId = await createRectangleSketch(page, [0, 0.01, 0])
    const bodyId = await extrudeActiveSketch(page, 2.5)
    assert.ok(bodyId, 'expected extrude to create a CAD body')
    await waitForBodyStatus(page, bodyId, 'idle')

    console.log('Checking cad-body transform move path...')
    await setCadSelection(page, {
      selectedIds: [bodyId],
      activeSketchId: sketchId,
      tool: null,
      mode: 'select',
    })
    await page.waitForFunction(() => window.__PASCAL_DEV__.transformOverlay?.hasGizmo?.() === true)

    const bodyBeforeMove = await getBody(page, bodyId)
    await startBodyStatusLog(page, bodyId, 'transform-move')
    const moved = await page.evaluate(() => window.__PASCAL_DEV__.transformOverlay.nudgeBy([1.2, 0, 0.6]))
    assert.equal(moved, true, 'expected transform overlay dev nudge to succeed')
    await page.waitForTimeout(400)

    const bodyAfterMove = await getBody(page, bodyId)
    assert.notDeepEqual(
      bodyAfterMove.transform.position,
      bodyBeforeMove.transform.position,
      'moving the body should update node.transform.position',
    )
    assert.equal(
      bodyAfterMove.previewArtifactRef,
      bodyBeforeMove.previewArtifactRef,
      'moving the body should not regenerate the preview artifact',
    )
    assert.deepEqual(
      await getBodyStatusLog(page, 'transform-move'),
      ['idle'],
      'moving the body should not trigger CAD regeneration',
    )

    console.log('Checking sketch edit regeneration preserves placement...')
    await startBodyStatusLog(page, bodyId, 'dimension-edit')
    const dimensionInput = page.locator('input[type="number"]').first()
    await dimensionInput.waitFor({ state: 'visible', timeout: 10_000 })
    await dimensionInput.fill('2.20')
    await dimensionInput.blur()

    await page.waitForFunction(
      ([bodyId, previewArtifactRef]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return (
          node?.type === 'cad-body' &&
          node.regenStatus === 'idle' &&
          node.previewArtifactRef !== previewArtifactRef
        )
      },
      [bodyId, bodyAfterMove.previewArtifactRef],
      { timeout: 30_000 },
    )

    const bodyAfterDimension = await getBody(page, bodyId)
    assert.deepEqual(
      bodyAfterDimension.transform,
      bodyAfterMove.transform,
      'body placement should be preserved after sketch-driven regeneration',
    )
    const dimensionLog = await getBodyStatusLog(page, 'dimension-edit')
    assert.ok(
      dimensionLog.includes('pending') && dimensionLog.includes('building') && dimensionLog.includes('idle'),
      `dimension edit should cycle through pending/building/idle, got ${dimensionLog.join(' -> ')}`,
    )

    console.log('Checking suppress action from CadBodyPanel...')
    await setCadSelection(page, {
      selectedIds: [bodyId],
      activeSketchId: null,
      tool: null,
      mode: 'select',
    })
    const suppressButton = page.getByRole('button', { name: 'Suppress' }).first()
    await suppressButton.waitFor({ state: 'visible', timeout: 10_000 })
    await startBodyStatusLog(page, bodyId, 'suppress')
    await suppressButton.click()
    await waitForBodyStatus(page, bodyId, 'idle')

    const suppressedBody = await getBody(page, bodyId)
    assert.ok(
      suppressedBody.operationHistory.some((operation) => operation.suppressed),
      'suppress should toggle an operation into suppressed state',
    )
    assert.ok(
      (await getBodyStatusLog(page, 'suppress')).includes('building'),
      'suppressing an operation should rebuild the body',
    )

    console.log('Checking command palette CAD extrude command...')
    await setCadSelection(page, {
      selectedIds: [bodyId],
      activeSketchId: sketchId,
      tool: null,
      mode: 'select',
    })
    await page.getByRole('button', { name: /commands/i }).click()
    const commandInput = await waitForCommandPalette(page)
    await commandInput.fill('extrude')
    await page.getByText('Extrude Active Sketch', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    await commandInput.press('ArrowDown')
    await commandInput.press('Enter')
    await page.waitForFunction(() => {
      const editor = window.__PASCAL_DEV__.useEditor.getState()
      return editor.tool === 'cad-extrude' && editor.mode === 'build'
    })

    console.log('Checking CAD S shortcut...')
    await setCadSelection(page, {
      selectedIds: [],
      activeSketchId: null,
      tool: null,
      mode: 'select',
    })
    await page.mouse.click(20, 20)
    await page.keyboard.press('s')
    await page.waitForFunction(() => {
      const editor = window.__PASCAL_DEV__.useEditor.getState()
      return editor.phase === 'cad' && editor.tool === 'cad-sketch' && editor.mode === 'build'
    })

    console.log('Checking undo/redo for node creation...')
    const sketchCountBefore = await getCadSketchCount(page)
    await page.evaluate(() => {
      window.__PASCAL_DEV__.useCad.getState().createDefaultSketch([3, 0.01, 0])
    })
    await page.waitForFunction(
      (expected) =>
        Object.values(window.__PASCAL_DEV__.useScene.getState().nodes).filter(
          (node) => node.type === 'cad-sketch',
        ).length === expected,
      sketchCountBefore + 1,
    )
    await page.evaluate(() => window.__PASCAL_DEV__.useScene.temporal.getState().undo())
    await page.waitForFunction(
      (expected) =>
        Object.values(window.__PASCAL_DEV__.useScene.getState().nodes).filter(
          (node) => node.type === 'cad-sketch',
        ).length === expected,
      sketchCountBefore,
    )
    await page.evaluate(() => window.__PASCAL_DEV__.useScene.temporal.getState().redo())
    await page.waitForFunction(
      (expected) =>
        Object.values(window.__PASCAL_DEV__.useScene.getState().nodes).filter(
          (node) => node.type === 'cad-sketch',
        ).length === expected,
      sketchCountBefore + 1,
    )

    console.log('Checking undo/redo for sketch edits...')
    await setCadSelection(page, {
      selectedIds: [bodyId],
      activeSketchId: sketchId,
      tool: null,
      mode: 'select',
    })
    const originalDimensionValue = await getSketchDimensionValue(page, sketchId)
    assert.equal(typeof originalDimensionValue, 'number', 'expected an editable sketch dimension')

    const sketchDimensionInput = page.locator('input[type="number"]').first()
    await sketchDimensionInput.fill('2.80')
    await sketchDimensionInput.blur()
    await page.waitForFunction(
      ([sketchId, value]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[sketchId]
        return node?.type === 'cad-sketch' && node.dimensions[0]?.value === value
      },
      [sketchId, 2.8],
      { timeout: 10_000 },
    )
    await waitForBodyStatus(page, bodyId, 'idle')

    await page.evaluate(() => window.__PASCAL_DEV__.useScene.temporal.getState().undo())
    await page.waitForFunction(
      ([sketchId, value]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[sketchId]
        return node?.type === 'cad-sketch' && node.dimensions[0]?.value === value
      },
      [sketchId, originalDimensionValue],
      { timeout: 10_000 },
    )
    await page.evaluate(() => window.__PASCAL_DEV__.useScene.temporal.getState().redo())
    await page.waitForFunction(
      ([sketchId, value]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[sketchId]
        return node?.type === 'cad-sketch' && node.dimensions[0]?.value === value
      },
      [sketchId, 2.8],
      { timeout: 10_000 },
    )
    await waitForBodyStatus(page, bodyId, 'idle')

    console.log('Checking undo/redo for operation history appends...')
    await setCadSelection(page, {
      selectedIds: [bodyId],
      activeSketchId: null,
      tool: null,
      mode: 'select',
    })
    const operationCountBefore = (await getBody(page, bodyId)).operationHistory.length
    const chamferBodyId = await applyChamfer(page, ['edge-1'], 0.06)
    assert.equal(chamferBodyId, bodyId, 'expected chamfer to append to the selected body')
    await page.waitForFunction(
      ([bodyId, expected]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return node?.type === 'cad-body' && node.regenStatus === 'idle' && node.operationHistory.length === expected
      },
      [bodyId, operationCountBefore + 1],
      { timeout: 30_000 },
    )

    await page.evaluate(() => window.__PASCAL_DEV__.useScene.temporal.getState().undo())
    await page.waitForFunction(
      ([bodyId, expected]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return node?.type === 'cad-body' && node.operationHistory.length === expected
      },
      [bodyId, operationCountBefore],
      { timeout: 10_000 },
    )

    await page.evaluate(() => window.__PASCAL_DEV__.useScene.temporal.getState().redo())
    await page.waitForFunction(
      ([bodyId, expected]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return node?.type === 'cad-body' && node.regenStatus === 'idle' && node.operationHistory.length === expected
      },
      [bodyId, operationCountBefore + 1],
      { timeout: 30_000 },
    )

    console.log('Phase 4 smoke passed.')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
