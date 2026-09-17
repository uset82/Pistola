const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const { chromium } = require(path.resolve(__dirname, '../editor/node_modules/playwright'))

const BASE_URL = 'http://127.0.0.1:3002'

const stopHelper = () => {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "$helperPid=(Get-NetTCPConnection -LocalPort 7878 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if ($helperPid) { Stop-Process -Id $helperPid -Force }",
    ],
    { stdio: 'pipe' },
  )
}

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

async function getBody(page, bodyId) {
  return page.evaluate((bodyId) => {
    const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
    if (node?.type !== 'cad-body') return null

    return {
      id: node.id,
      operations: node.operationHistory.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        suppressed: operation.suppressed,
      })),
      preview: node.preview,
      previewArtifactRef: node.previewArtifactRef,
      regenError: node.regenError,
      regenStatus: node.regenStatus,
    }
  }, bodyId)
}

async function startBodyStatusLog(page, bodyId, key = 'default') {
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

async function getBodyStatusLog(page, key = 'default') {
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

async function extrudeActiveSketch(page, depth) {
  return page.evaluate(async (depth) => {
    return window.__PASCAL_DEV__.useCad.getState().extrudeSelectedSketch({ depth })
  }, depth)
}

async function applyBoolean(page, operation) {
  return page.evaluate(async (operation) => {
    return window.__PASCAL_DEV__.useCad.getState().applyBooleanToSelection({ operation })
  }, operation)
}

async function applyFillet(page, edgeRefs, radius) {
  return page.evaluate(async ({ edgeRefs, radius }) => {
    return window.__PASCAL_DEV__.useCad.getState().applyFilletToSelection({ edgeRefs, radius })
  }, { edgeRefs, radius })
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

    console.log('Creating base sketch and extrude...')
    await createRectangleSketch(page, [0, 0.01, 0])
    const bodyId = await extrudeActiveSketch(page, 2.5)

    assert.ok(bodyId, 'expected extrude to create a CAD body')
    await startBodyStatusLog(page, bodyId, 'extrude')
    await waitForBodyStatus(page, bodyId, 'idle')

    const extrudedBody = await getBody(page, bodyId)
    assert.equal(extrudedBody.preview.dimensions[1], 2.5, 'extrude depth should be reflected in preview height')
    assert.ok(
      (await getBodyStatusLog(page, 'extrude')).includes('building'),
      'extrude should pass through building state',
    )

    console.log('Editing dimension and waiting for regeneration...')
    const initialPreviewArtifactRef = extrudedBody.previewArtifactRef
    await startBodyStatusLog(page, bodyId, 'dimension-edit')
    const dimensionInput = page.locator('input[type="number"]').first()
    await dimensionInput.waitFor({ state: 'visible', timeout: 10_000 })
    await dimensionInput.fill('2.20')
    await dimensionInput.blur()

    await page.waitForFunction(
      ([bodyId, initialPreviewArtifactRef]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return (
          node?.type === 'cad-body' &&
          node.regenStatus === 'idle' &&
          node.previewArtifactRef !== initialPreviewArtifactRef
        )
      },
      [bodyId, initialPreviewArtifactRef],
      { timeout: 30_000 },
    )

    const regeneratedBody = await getBody(page, bodyId)
    const dimensionLog = await getBodyStatusLog(page, 'dimension-edit')
    assert.notEqual(
      regeneratedBody.previewArtifactRef,
      initialPreviewArtifactRef,
      'dimension edit should regenerate preview artifact',
    )
    assert.ok(
      dimensionLog.includes('pending') &&
        dimensionLog.includes('building') &&
        dimensionLog.includes('idle'),
      `dimension edit should cycle through pending/building/idle, got ${dimensionLog.join(' -> ')}`,
    )
    assert.ok(
      Math.abs(regeneratedBody.preview.dimensions[2] - 2.2) < 0.05,
      `expected regenerated body depth to reflect the edited dimension, got ${regeneratedBody.preview.dimensions[2]}`,
    )

    console.log('Creating second body and applying boolean cut...')
    await createRectangleSketch(page, [0.5, 0.01, 0.5])
    const secondBodyId = await extrudeActiveSketch(page, 2.5)
    assert.ok(secondBodyId, 'expected second extrude to create a CAD body')
    await waitForBodyStatus(page, secondBodyId, 'building')
    await waitForBodyStatus(page, secondBodyId, 'idle')

    await page.evaluate(([bodyId, secondBodyId]) => {
      const dev = window.__PASCAL_DEV__
      dev.useEditor.getState().setActiveSketchId(null)
      dev.useViewer.getState().setSelection({ selectedIds: [bodyId, secondBodyId], zoneId: null })
    }, [bodyId, secondBodyId])

    const booleanPreviewArtifactRef = (await getBody(page, bodyId)).previewArtifactRef
    await startBodyStatusLog(page, bodyId, 'boolean')
    const booleanResultId = await applyBoolean(page, 'cut')
    assert.equal(booleanResultId, bodyId, 'boolean cut should update the selected target body')
    await page.waitForFunction(
      ([bodyId, booleanPreviewArtifactRef]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return (
          node?.type === 'cad-body' &&
          node.regenStatus === 'idle' &&
          node.previewArtifactRef !== booleanPreviewArtifactRef
        )
      },
      [bodyId, booleanPreviewArtifactRef],
      { timeout: 30_000 },
    )

    const booleanBody = await getBody(page, bodyId)
    assert.ok(
      (await getBodyStatusLog(page, 'boolean')).includes('building'),
      'boolean cut should pass through building state',
    )
    assert.notEqual(
      booleanBody.previewArtifactRef,
      booleanPreviewArtifactRef,
      'boolean cut should generate a new preview artifact',
    )

    console.log('Applying fillet...')
    await page.evaluate((bodyId) => {
      const dev = window.__PASCAL_DEV__
      dev.useViewer.getState().setSelection({ selectedIds: [bodyId], zoneId: null })
    }, bodyId)

    const filletPreviewArtifactRef = (await getBody(page, bodyId)).previewArtifactRef
    await startBodyStatusLog(page, bodyId, 'fillet')
    const filletResultId = await applyFillet(page, ['edge-1'], 0.08)
    assert.equal(filletResultId, bodyId, 'fillet should update the selected body')
    await page.waitForFunction(
      ([bodyId, filletPreviewArtifactRef]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return (
          node?.type === 'cad-body' &&
          node.regenStatus === 'idle' &&
          node.previewArtifactRef !== filletPreviewArtifactRef
        )
      },
      [bodyId, filletPreviewArtifactRef],
      { timeout: 30_000 },
    )

    const filletedBody = await getBody(page, bodyId)
    assert.ok(
      (await getBodyStatusLog(page, 'fillet')).includes('building'),
      'fillet should pass through building state',
    )
    assert.notEqual(
      filletedBody.previewArtifactRef,
      filletPreviewArtifactRef,
      'fillet should generate a new preview artifact',
    )

    console.log('Suppressing operation from CadBodyPanel...')
    const suppressButton = page.getByRole('button', { name: 'Suppress' }).first()
    await suppressButton.waitFor({ state: 'visible', timeout: 10_000 })
    await startBodyStatusLog(page, bodyId, 'suppress')
    await suppressButton.click()

    await waitForBodyStatus(page, bodyId, 'idle')

    const suppressedBody = await getBody(page, bodyId)
    assert.ok(
      (await getBodyStatusLog(page, 'suppress')).includes('building'),
      'suppress action should trigger a rebuild',
    )
    assert.ok(
      suppressedBody.operations.some((operation) => operation.suppressed),
      'expected at least one suppressed operation after panel action',
    )

    console.log('Stopping helper to validate offline error state...')
    stopHelper()
    await page.waitForTimeout(1000)

    await createRectangleSketch(page, [2, 0.01, 0])
    const offlineBodyId = await extrudeActiveSketch(page, 1.4)
    assert.ok(offlineBodyId, 'expected offline extrude to still create a body placeholder')
    await startBodyStatusLog(page, offlineBodyId, 'offline')
    await waitForBodyStatus(page, offlineBodyId, 'error')

    const offlineBody = await getBody(page, offlineBodyId)
    assert.ok(
      (await getBodyStatusLog(page, 'offline')).includes('building'),
      'offline extrude should still enter building before failing',
    )
    assert.ok(offlineBody.regenError, 'offline extrude should capture a regeneration error')
    assert.ok(offlineBody.operations.length > 0, 'offline extrude should preserve operation history')

    console.log('Phase 3 smoke passed.')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
