const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { chromium } = require(path.resolve(__dirname, '../editor/node_modules/playwright'))

const BASE_URL = 'http://127.0.0.1:3002'
const STEP_FIXTURE = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Pistola smoke import'),'2;1');
FILE_NAME('phase5-smoke.step','2026-03-24T00:00:00',('Pistola'),('Pistola CAD Helper'),'OpenAI Codex','Pistola','');
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;`

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
    dev.useEditor.getState().setActiveWorkplane('XY')
  })

  await page.waitForFunction(() => window.__PASCAL_DEV__.useViewer.getState().selection.levelId !== null)
}

async function addSmokeLevel(page, levelNumber) {
  return page.evaluate((levelNumber) => {
    const dev = window.__PASCAL_DEV__
    const scene = dev.useScene.getState()
    const building = Object.values(scene.nodes).find((node) => node.type === 'building')
    if (!building) throw new Error('Smoke level creation requires a building node.')

    const levelId = `level_smoke_${levelNumber}`
    const nextLevel = {
      object: 'node',
      id: levelId,
      type: 'level',
      name: `Smoke Level ${levelNumber}`,
      parentId: building.id,
      visible: true,
      metadata: {},
      children: [],
      level: levelNumber,
    }

    scene.createNode(nextLevel, building.id)
    dev.useViewer.getState().setSelection({ buildingId: building.id, levelId, zoneId: null, selectedIds: [] })
    return levelId
  }, levelNumber)
}

async function importStep(page, fileName, contents) {
  return page.evaluate(async ({ fileName, contents }) => {
    const file = new File([contents], fileName, { type: 'application/step' })
    return window.__PASCAL_DEV__.useCad.getState().importStepFile(file)
  }, { fileName, contents })
}

async function getCadBody(page, bodyId) {
  return page.evaluate((bodyId) => {
    const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
    if (node?.type !== 'cad-body') return null

    return {
      id: node.id,
      parentId: node.parentId,
      preview: node.preview,
      previewArtifactRef: node.previewArtifactRef,
      cadArtifactRef: node.cadArtifactRef,
      regenStatus: node.regenStatus,
    }
  }, bodyId)
}

async function getCadSketch(page, sketchId) {
  return page.evaluate((sketchId) => {
    const node = window.__PASCAL_DEV__.useScene.getState().nodes[sketchId]
    if (node?.type !== 'cad-sketch') return null

    return {
      id: node.id,
      parentId: node.parentId,
      plane: node.plane,
      position: node.position,
    }
  }, sketchId)
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    console.log('Loading editor...')
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await waitForDevBridge(page)
    await resetCadScene(page)

    console.log('Selecting a non-default level for level-aware checks...')
    const smokeLevelId = await addSmokeLevel(page, 1)

    console.log('Importing STEP fixture...')
    const importedBodyId = await importStep(page, 'phase5-smoke.step', STEP_FIXTURE)
    assert.ok(importedBodyId, 'expected STEP import to create a CAD body')

    await page.waitForFunction(
      (bodyId) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return node?.type === 'cad-body' && node.regenStatus === 'idle'
      },
      importedBodyId,
      { timeout: 30_000 },
    )

    const importedBody = await getCadBody(page, importedBodyId)
    assert.equal(importedBody.parentId, smokeLevelId, 'import should parent the body under the selected level')
    assert.ok(importedBody.previewArtifactRef, 'import should produce a preview artifact ref')
    assert.ok(importedBody.cadArtifactRef, 'import should preserve the CAD artifact ref')
    assert.equal(importedBody.regenStatus, 'idle', 'imported body should settle in idle state')

    console.log('Exporting imported STEP body...')
    await page.evaluate((bodyId) => {
      const dev = window.__PASCAL_DEV__
      dev.useViewer.getState().setSelection({ selectedIds: [bodyId], zoneId: null })
    }, importedBodyId)

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate(() => window.__PASCAL_DEV__.useCad.getState().exportSelectedBodyStep()),
    ])

    const downloadedPath = path.join(os.tmpdir(), `phase5-export-${Date.now()}.step`)
    await download.saveAs(downloadedPath)
    const exportedStep = await fs.readFile(downloadedPath, 'utf8')
    assert.match(exportedStep, /ISO-10303-21;/, 'exported file should be STEP-like text')

    console.log('Creating a level-workplane sketch...')
    const sketchId = await page.evaluate(() => {
      const dev = window.__PASCAL_DEV__
      dev.useEditor.getState().setPhase('cad')
      dev.useEditor.getState().setActiveWorkplane('level')
      const sketch = dev.useCad.getState().createDefaultSketch([4, 999, 2])
      return sketch?.id ?? null
    })

    assert.ok(sketchId, 'expected level workplane sketch creation to succeed')
    const sketch = await getCadSketch(page, sketchId)
    assert.equal(sketch.parentId, smokeLevelId, 'level workplane sketch should inherit the selected level')
    assert.equal(sketch.plane, 'level', 'sketch should record the level workplane')
    assert.ok(
      Math.abs(sketch.position[1] - 2.51) < 0.001,
      `expected level workplane sketch Y to match level elevation, got ${sketch.position[1]}`,
    )

    console.log('Reloading editor to verify persistence...')
    const expectedPreviewArtifactRef = importedBody.previewArtifactRef
    const expectedCadArtifactRef = importedBody.cadArtifactRef
    await page.reload({ waitUntil: 'networkidle' })
    await waitForDevBridge(page)

    await page.waitForFunction(
      ([bodyId, previewArtifactRef, cadArtifactRef]) => {
        const node = window.__PASCAL_DEV__.useScene.getState().nodes[bodyId]
        return (
          node?.type === 'cad-body' &&
          node.previewArtifactRef === previewArtifactRef &&
          node.cadArtifactRef === cadArtifactRef
        )
      },
      [importedBodyId, expectedPreviewArtifactRef, expectedCadArtifactRef],
      { timeout: 30_000 },
    )

    assert.deepEqual(pageErrors, [], `expected no page errors, got ${pageErrors.join(' | ')}`)

    console.log('Phase 5 smoke passed.')
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
