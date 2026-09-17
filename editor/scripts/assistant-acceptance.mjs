import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const appDir = path.join(repoRoot, 'apps', 'editor')
const baseUrl = 'http://127.0.0.1:3002'
const devServerCommand = 'bun'
const devServerArgs = ['run', 'dev']

const log = (message) => process.stdout.write(`${message}\n`)

const createAssistantTurn = ({
  reply,
  mode = 'plan',
  assumptions = [],
  ambiguities = [],
  actions = [],
  requiresReview = actions.some((action) => ![
    'set_phase',
    'set_mode',
    'set_structure_layer',
    'activate_tool',
    'focus_level',
    'select_nodes',
  ].includes(action.type)),
  destructiveActionCount = actions.filter((action) => action.type === 'delete_target').length,
}) => ({
  reply,
  mode,
  assumptions,
  ambiguities,
  actions,
  requiresReview,
  destructiveActionCount,
})

const waitForServer = async (url, timeoutMs = 180_000) => {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (await isServerResponsive(url)) return

    await delay(1_000)
  }

  throw new Error(`Timed out waiting for dev server at ${url}.`)
}

const isServerResponsive = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    return response.ok || response.status === 307 || response.status === 308
  } catch {
    return false
  }
}

const getSnapshot = async (page) =>
  page.evaluate(() => {
    const dev = window.__PASCAL_DEV__
    const scene = dev.useScene.getState()
    const editor = dev.useEditor.getState()
    const viewer = dev.useViewer.getState()
    const cad = dev.useCad.getState()
    const nodes = Object.values(scene.nodes)
    const counts = {}
    const idsByType = {}

    for (const node of nodes) {
      counts[node.type] = (counts[node.type] ?? 0) + 1
      idsByType[node.type] = [...(idsByType[node.type] ?? []), node.id]
    }

    return {
      phase: editor.phase,
      tool: editor.tool,
      activeSketchId: editor.activeSketchId,
      helperStatus: cad.helperStatus,
      counts,
      idsByType,
      selection: viewer.selection,
      lastError: cad.lastError,
    }
  })

const resetEditorState = async (page) => {
  await page.evaluate(() => {
    localStorage.removeItem('pascal-editor-scene')

    const dev = window.__PASCAL_DEV__
    dev.useScene.getState().clearScene()
    dev.useViewer.getState().setSelection({ selectedIds: [], zoneId: null })
    dev.useEditor.getState().setPreviewMode(false)
    dev.useEditor.getState().setActiveSketchId(null)
    dev.useCad.getState().clearCommandToast()
  })
}

const setPhase = async (page, phase) => {
  await page.evaluate((nextPhase) => {
    window.__PASCAL_DEV__.useEditor.getState().setPhase(nextPhase)
  }, phase)
}

const setSelectedNode = async (page, nodeId) => {
  await page.evaluate((selectedId) => {
    const dev = window.__PASCAL_DEV__
    dev.useViewer.getState().setSelection({ selectedIds: [selectedId], zoneId: null })
  }, nodeId)
}

const promptAssistant = async (page, prompt, options = {}) => {
  const input = page.locator('[data-testid="assistant-input"]')
  const sendButton = page.locator('[data-testid="assistant-send"]')

  await input.fill(prompt)
  await sendButton.click()

  if (options.expectedAssistantText) {
    await page.waitForFunction(
      (text) => document.body.textContent?.includes(text),
      options.expectedAssistantText,
      { timeout: 15_000 },
    )
  }

  if (options.expectClarify) {
    await page.waitForSelector('[data-testid="assistant-clarify-card"]', {
      state: 'visible',
      timeout: 15_000,
    })
  }

  if (options.expectReview) {
    await page.waitForSelector('[data-testid="assistant-review-card"]', {
      state: 'visible',
      timeout: 15_000,
    })
  }

  if (options.applyPlan) {
    await page.click('[data-testid="assistant-apply-plan"]')
  }

  if (options.expectExecuted) {
    await page.waitForFunction(
      () => document.body.textContent?.includes('Assistant actions completed.'),
      null,
      { timeout: 15_000 },
    )
  }

  if (options.expectError) {
    await page.waitForFunction(
      (message) => document.body.textContent?.includes(message),
      options.expectError,
      { timeout: 15_000 },
    )
  }
}

const assertPanelVisibleAcrossPhases = async (page) => {
  for (const phase of ['site', 'structure', 'furnish', 'cad']) {
    await setPhase(page, phase)
    await page.waitForSelector('[data-testid="assistant-panel"]', { state: 'visible' })
    const visible = await page.locator('[data-testid="assistant-panel"]').isVisible()
    assert.equal(visible, true, `Assistant panel should stay visible in ${phase} phase.`)
  }
}

const startDevServer = () => {
  const logs = []
  const child = spawn(devServerCommand, devServerArgs, {
    cwd: appDir,
    env: {
      ...process.env,
      NEXT_PUBLIC_ENABLE_DEV_TOOLS: '0',
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const capture = (chunk) => {
    const text = chunk.toString()
    logs.push(text)
    if (logs.length > 200) logs.shift()
    process.stdout.write(text)
  }

  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)

  return {
    child,
    getLogs: () => logs.join(''),
  }
}

async function main() {
  const useExistingServer = await isServerResponsive(baseUrl)
  const server = useExistingServer
    ? { child: null, getLogs: () => '' }
    : startDevServer()
  let browser

  const fail = async (error) => {
    if (browser) await browser.close().catch(() => {})
    server.child?.kill()
    throw error
  }

  try {
    log(useExistingServer ? 'Using existing editor dev server...' : 'Waiting for editor dev server...')
    await waitForServer(baseUrl)

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    let roomZoneId = null
    let roomRoofId = null

    await page.route('**/api/assistant/plan', async (route) => {
      const requestBody = JSON.parse(route.request().postData() ?? '{}')
      const prompt = String(requestBody.prompt ?? '').trim().toLowerCase()

      let payload

      switch (prompt) {
        case 'what can you help me build here?':
          payload = createAssistantTurn({
            reply:
              'I can help you chat, switch tools, create scene geometry, place items, and run CAD builds.',
            mode: 'chat',
          })
          break

        case 'switch to structure and open the wall tool':
          payload = createAssistantTurn({
            reply: 'I will switch to structure and activate the wall tool.',
            actions: [
              { type: 'set_phase', phase: 'structure' },
              { type: 'activate_tool', tool: 'wall' },
            ],
            requiresReview: false,
          })
          break

        case 'create a 4m x 4m room on level 0 with walls, slab, and roof':
          payload = createAssistantTurn({
            reply: 'I can create the room footprint, add four walls, a slab, and a roof.',
            assumptions: ['Interpreting the request as a single rectangular room on the active level.'],
            actions: [
              {
                type: 'create_zone',
                name: 'Room',
                polygon: [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                ],
              },
              { type: 'create_wall', start: [0, 0], end: [4, 0] },
              { type: 'create_wall', start: [4, 0], end: [4, 4] },
              { type: 'create_wall', start: [4, 4], end: [0, 4] },
              { type: 'create_wall', start: [0, 4], end: [0, 0] },
              {
                type: 'create_slab',
                name: 'Room Slab',
                polygon: [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                ],
              },
              {
                type: 'create_roof',
                name: 'Room Roof',
                corner1: [0, 0],
                corner2: [4, 4],
              },
            ],
          })
          break

        case 'put a sofa in the center of the room':
          assert.ok(roomZoneId, 'Room zone id must exist before placing the sofa.')
          payload = createAssistantTurn({
            reply: 'I can place a sofa in the center of the existing room.',
            actions: [
              {
                type: 'place_item',
                assetId: 'sofa',
                targetNodeId: roomZoneId,
                placement: 'center',
              },
            ],
          })
          break

        case 'create a box 1m x 2m x 0.5m':
          payload = createAssistantTurn({
            reply: 'I can switch into CAD execution and build that box as a CAD body.',
            actions: [{ type: 'run_cad_prompt', prompt: 'create a box 1m x 2m x 0.5m' }],
          })
          break

        case 'add a nice entrance':
          payload = createAssistantTurn({
            reply: 'I need more detail before changing the scene.',
            mode: 'clarify',
            ambiguities: ['Do you want a new door, porch, path, canopy, or entry furniture?'],
          })
          break

        case 'delete the selected roof':
          payload = createAssistantTurn({
            reply: 'I can delete the selected roof after review.',
            actions: [{ type: 'delete_target' }],
            destructiveActionCount: 1,
          })
          break

        case 'trigger rollback test':
          assert.ok(roomZoneId, 'Room zone id must exist before rollback test.')
          payload = createAssistantTurn({
            reply: 'This plan intentionally fails after the first mutation to confirm rollback.',
            actions: [
              { type: 'create_wall', start: [6, 0], end: [6, 4] },
              {
                type: 'place_item',
                assetId: 'sofa',
                targetNodeId: roomZoneId,
                position: [999, 0, 999],
              },
            ],
          })
          break

        default:
          throw new Error(`Unhandled assistant prompt in acceptance script: ${prompt}`)
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    })

    await page.route('**/api/cad/brief', async (route) => {
      const response = {
        provider: 'fallback',
        raw: JSON.stringify({
          intent: 'create a box 1m x 2m x 0.5m',
          sketchPlans: [
            {
              plane: 'XY',
              entities: [
                {
                  type: 'rectangle',
                  points: [
                    [-0.5, -1],
                    [0.5, 1],
                  ],
                  params: {},
                },
              ],
              dimensions: [],
              constraints: [],
            },
          ],
          operationGraph: [
            {
              id: 'box-extrude',
              op: 'extrude',
              params: { sketchIndex: 0, distance: 0.5 },
              dependsOn: [],
            },
          ],
          assumptions: ['Interpreted the prompt as a simple box.'],
          ambiguities: [],
        }),
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      })
    })

    log('Opening editor...')
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(window.__PASCAL_DEV__), null, { timeout: 60_000 })
    await page.waitForSelector('[data-testid="assistant-panel"]', { state: 'visible' })
    await resetEditorState(page)

    log('Checking assistant visibility across phases...')
    await assertPanelVisibleAcrossPhases(page)

    log('Checking pure chat mode...')
    const countsBeforeChat = (await getSnapshot(page)).counts
    await promptAssistant(page, 'what can you help me build here?')
    await page.waitForFunction(
      () =>
        document.body.textContent?.includes(
          'I can help you chat, switch tools, create scene geometry, place items, and run CAD builds.',
        ),
      null,
      { timeout: 15_000 },
    )
    assert.equal(await page.locator('[data-testid="assistant-review-card"]').count(), 0)
    assert.deepEqual((await getSnapshot(page)).counts, countsBeforeChat)

    log('Checking safe immediate execution...')
    await promptAssistant(page, 'switch to structure and open the wall tool', {
      expectedAssistantText: 'I will switch to structure and activate the wall tool.',
      expectExecuted: true,
    })
    let snapshot = await getSnapshot(page)
    assert.equal(snapshot.phase, 'structure')
    assert.equal(snapshot.tool, 'wall')

    log('Checking reviewed room creation...')
    const countsBeforeRoom = snapshot.counts
    await promptAssistant(page, 'create a 4m x 4m room on level 0 with walls, slab, and roof', {
      expectedAssistantText: 'I can create the room footprint, add four walls, a slab, and a roof.',
      expectExecuted: true,
    })
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.zone, (countsBeforeRoom.zone ?? 0) + 1)
    assert.equal(snapshot.counts.wall, (countsBeforeRoom.wall ?? 0) + 4)
    assert.equal(snapshot.counts.slab, (countsBeforeRoom.slab ?? 0) + 1)
    assert.equal(snapshot.counts.roof, (countsBeforeRoom.roof ?? 0) + 1)
    roomZoneId = snapshot.idsByType.zone?.[0] ?? null
    roomRoofId = snapshot.idsByType.roof?.[0] ?? null
    assert.ok(roomZoneId, 'Room zone should exist after room creation.')
    assert.ok(roomRoofId, 'Room roof should exist after room creation.')

    log('Checking item placement through the assistant...')
    const itemCountBefore = snapshot.counts.item ?? 0
    await promptAssistant(page, 'put a sofa in the center of the room', {
      expectedAssistantText: 'I can place a sofa in the center of the existing room.',
      expectExecuted: true,
    })
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.item, itemCountBefore + 1)
    await page.click('[data-testid="assistant-undo-last-turn"]')
    await page.waitForFunction(
      (expectedCount) => {
        const nodes = Object.values(window.__PASCAL_DEV__.useScene.getState().nodes)
        return nodes.filter((node) => node.type === 'item').length === expectedCount
      },
      itemCountBefore,
      { timeout: 15_000 },
    )
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.item ?? 0, itemCountBefore)
    await promptAssistant(page, 'put a sofa in the center of the room', {
      expectedAssistantText: 'I can place a sofa in the center of the existing room.',
      expectExecuted: true,
    })
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.item, itemCountBefore + 1)

    log('Checking CAD request from a non-CAD phase...')
    await setPhase(page, 'structure')
    const cadCountsBefore = {
      sketches: snapshot.counts['cad-sketch'] ?? 0,
      bodies: snapshot.counts['cad-body'] ?? 0,
    }
    await promptAssistant(page, 'create a box 1m x 2m x 0.5m', {
      expectedAssistantText: 'I can switch into CAD execution and build that box as a CAD body.',
      expectExecuted: true,
    })
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.phase, 'cad')
    assert.equal(snapshot.counts['cad-sketch'], cadCountsBefore.sketches + 1)
    assert.equal(snapshot.counts['cad-body'], cadCountsBefore.bodies + 1)

    log('Checking clarification path...')
    const countsBeforeClarify = snapshot.counts
    await promptAssistant(page, 'add a nice entrance', {
      expectedAssistantText: 'I need more detail before changing the scene.',
      expectClarify: true,
    })
    assert.deepEqual((await getSnapshot(page)).counts, countsBeforeClarify)

    log('Checking destructive reviewed action...')
    await setPhase(page, 'structure')
    await setSelectedNode(page, roomRoofId)
    const roofCountBeforeDelete = (await getSnapshot(page)).counts.roof ?? 0
    await promptAssistant(page, 'delete the selected roof', {
      expectedAssistantText: 'I can delete the selected roof after review.',
      expectReview: true,
    })
    assert.equal((await getSnapshot(page)).counts.roof ?? 0, roofCountBeforeDelete)
    await page.click('[data-testid="assistant-apply-plan"]')
    await page.waitForFunction(
      () => document.body.textContent?.includes('Assistant actions completed.'),
      null,
      { timeout: 15_000 },
    )
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.roof ?? 0, roofCountBeforeDelete - 1)

    log('Checking rollback on reviewed execution failure...')
    const wallCountBeforeRollback = snapshot.counts.wall ?? 0
    await promptAssistant(page, 'trigger rollback test', {
      expectedAssistantText: 'This plan intentionally fails after the first mutation to confirm rollback.',
      expectReview: true,
    })
    await page.click('[data-testid="assistant-apply-plan"]')
    await page.waitForFunction(
      () => document.body.textContent?.includes('must stay inside zone'),
      null,
      { timeout: 15_000 },
    )
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.wall ?? 0, wallCountBeforeRollback)

    log('Assistant acceptance coverage passed.')
    await browser.close()
    server.child?.kill()
  } catch (error) {
    await browser?.close().catch(() => {})
    server.child?.kill()
    const logs = server.getLogs()
    if (logs) {
      log('\nLast dev server logs:\n')
      log(logs)
    }
    throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
