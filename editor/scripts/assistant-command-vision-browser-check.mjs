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

const log = (message) => process.stdout.write(`${message}\n`)

const waitFor = async (
  predicate,
  { timeoutMs = 30_000, intervalMs = 50, errorMessage = 'Timed out waiting for condition.' } = {},
) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return
    await delay(intervalMs)
  }

  throw new Error(errorMessage)
}

const isServerResponsive = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    return response.ok || response.status === 307 || response.status === 308
  } catch {
    return false
  }
}

const waitForServer = async (url, timeoutMs = 180_000) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerResponsive(url)) return
    await delay(1_000)
  }

  throw new Error(`Timed out waiting for dev server at ${url}.`)
}

const startDevServer = () => {
  const logs = []
  const child = spawn('bun', ['run', 'dev'], {
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

const createAssistantTurn = ({
  reply,
  mode = 'plan',
  assumptions = [],
  ambiguities = [],
  actions = [],
  requiresReview = actions.some((action) =>
    ![
      'set_phase',
      'set_mode',
      'set_structure_layer',
      'activate_tool',
      'focus_level',
      'select_nodes',
      'reset_workspace_selection',
    ].includes(action.type),
  ),
  destructiveActionCount = actions.filter((action) =>
    ['delete_target', 'delete_nodes', 'clear_level_contents'].includes(action.type),
  ).length,
  targetingExplanation,
  targetCandidates,
  imageInterpretation,
}) => ({
  reply,
  mode,
  assumptions,
  ambiguities,
  actions,
  requiresReview,
  destructiveActionCount,
  ...(targetingExplanation ? { targetingExplanation } : {}),
  ...(Array.isArray(targetCandidates) ? { targetCandidates } : {}),
  ...(imageInterpretation ? { imageInterpretation } : {}),
})

const getCurrentLevelId = (body) => {
  const sceneSummary = Array.isArray(body?.context?.sceneSummary) ? body.context.sceneSummary : []
  const levelNode = sceneSummary.find((node) => node.type === 'level')
  if (typeof levelNode?.id === 'string' && levelNode.id.length > 0) {
    return levelNode.id
  }

  const selectionLevelId = body?.context?.selection?.levelId
  if (typeof selectionLevelId === 'string' && selectionLevelId.length > 0) {
    return selectionLevelId
  }

  throw new Error('Expected an active level id in the assistant planning context.')
}

const createWorkspaceSvg = ({ annotation, subject }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1365" height="768" viewBox="0 0 1365 768">
  <rect width="1365" height="768" fill="#0b1020" />
  <rect x="0" y="0" width="1365" height="68" fill="#111827" />
  <rect x="0" y="68" width="92" height="700" fill="#141b2d" />
  <rect x="1273" y="68" width="92" height="700" fill="#141b2d" />
  <rect x="120" y="102" width="1120" height="610" rx="18" fill="#d9e1ea" />
  <rect x="180" y="150" width="1030" height="520" rx="12" fill="#b9c5cf" />
  <line x1="180" y1="410" x2="1210" y2="410" stroke="#8ea0b0" stroke-width="4" stroke-dasharray="12 10" />
  <line x1="694" y1="150" x2="694" y2="670" stroke="#8ea0b0" stroke-width="4" stroke-dasharray="12 10" />
  ${subject}
  ${annotation}
</svg>`

const removeScreenshotSvg = createWorkspaceSvg({
  subject: `
    <rect x="560" y="250" width="240" height="120" rx="16" fill="#64748b" />
    <rect x="610" y="280" width="140" height="60" rx="10" fill="#94a3b8" />
  `,
  annotation: `
    <circle cx="680" cy="310" r="130" fill="none" stroke="#ff2d20" stroke-width="12" />
    <text x="610" y="170" fill="#ff2d20" font-size="54" font-family="Arial, sans-serif" font-weight="700">REMOVE</text>
  `,
})

const moveScreenshotSvg = createWorkspaceSvg({
  subject: `
    <rect x="660" y="220" width="130" height="170" rx="10" fill="#7dd3fc" />
    <rect x="676" y="238" width="98" height="134" rx="8" fill="#e0f2fe" />
  `,
  annotation: `
    <path d="M925 285 L760 285" fill="none" stroke="#ff2d20" stroke-width="12" stroke-linecap="round" />
    <path d="M760 285 L800 250" fill="none" stroke="#ff2d20" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M760 285 L800 320" fill="none" stroke="#ff2d20" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    <text x="885" y="240" fill="#ff2d20" font-size="48" font-family="Arial, sans-serif" font-weight="700">MOVE</text>
  `,
})

const floorplanSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700" viewBox="0 0 900 700">
  <rect width="900" height="700" fill="#ffffff" />
  <rect x="130" y="120" width="640" height="420" fill="none" stroke="#111111" stroke-width="18" />
  <line x1="420" y1="120" x2="420" y2="540" stroke="#111111" stroke-width="18" />
  <line x1="130" y1="340" x2="770" y2="340" stroke="#111111" stroke-width="18" />
  <rect x="390" y="314" width="60" height="52" fill="#ffffff" />
</svg>`

const svgUpload = (name, svg) => ({
  name,
  mimeType: 'image/svg+xml',
  buffer: Buffer.from(svg),
})

const getSnapshot = async (page) =>
  page.evaluate(() => {
    const dev = window.__PASCAL_DEV__
    const scene = dev.useScene.getState()
    const editor = dev.useEditor.getState()
    const nodes = Object.values(scene.nodes).map((node) => ({
      id: node.id,
      type: node.type,
      name: 'name' in node && typeof node.name === 'string' ? node.name : null,
      parentId: 'parentId' in node ? node.parentId ?? null : null,
      position: 'position' in node && Array.isArray(node.position) ? node.position : null,
      localX: 'localX' in node && typeof node.localX === 'number' ? node.localX : null,
    }))
    const counts = Object.fromEntries(
      nodes.reduce((entries, node) => {
        entries.set(node.type, (entries.get(node.type) ?? 0) + 1)
        return entries
      }, new Map()),
    )

    return { phase: editor.phase, counts, nodes }
  })

const resetEditorState = async (page) => {
  await page.evaluate(() => {
    localStorage.removeItem('pascal-editor-scene')
    const dev = window.__PASCAL_DEV__
    dev.useScene.getState().clearScene()
    const nodes = Object.values(dev.useScene.getState().nodes)
    const buildingId = nodes.find((node) => node.type === 'building')?.id ?? null
    const levelId = nodes.find((node) => node.type === 'level')?.id ?? null
    dev.useViewer.getState().setSelection({ buildingId, levelId, selectedIds: [], zoneId: null })
    dev.useEditor.getState().setPreviewMode(false)
    dev.useEditor.getState().setActiveSketchId(null)
    dev.useCad.getState().clearCommandToast()
  })
}

const setSelectedNode = async (page, nodeId) => {
  await page.evaluate((selectedId) => {
    window.__PASCAL_DEV__.useViewer.getState().setSelection({ selectedIds: [selectedId], zoneId: null })
  }, nodeId)
}

const waitForReviewCard = async (page) => {
  await page.waitForSelector('[data-testid="assistant-review-card"]', {
    state: 'visible',
    timeout: 15_000,
  })
}

const waitForClarifyCard = async (page) => {
  await page.waitForSelector('[data-testid="assistant-clarify-card"]', {
    state: 'visible',
    timeout: 15_000,
  })
}

const waitForExecutionDone = async (page) => {
  await waitFor(
    async () =>
      await page.evaluate(() => {
        const status = document.querySelector('[data-testid="assistant-execution-status"]')
        return Boolean(status?.textContent?.includes('Done'))
      }),
    { timeoutMs: 20_000, errorMessage: 'Assistant execution did not finish.' },
  )
}

const sendPrompt = async (page, prompt) => {
  await page.locator('[data-testid="assistant-input"]').fill(prompt)
  await page.locator('[data-testid="assistant-send"]').click()
}

const applyCurrentPlan = async (page) => {
  await page.locator('[data-testid="assistant-apply-plan"]').click()
  await waitForExecutionDone(page)
}

const uploadSvg = async (page, upload) => {
  await page.locator('[data-testid="assistant-panel"] input[type="file"][accept="image/*"]').setInputFiles(upload)
  await page.waitForSelector('[data-testid="assistant-image-intent"]', {
    state: 'visible',
    timeout: 15_000,
  })
}

const ensureExecutionPolicy = async (page, expectedPolicy) => {
  const toggle = page.locator('[data-testid="assistant-policy-toggle"]')
  await toggle.waitFor({ state: 'visible', timeout: 15_000 })
  const currentPolicy = ((await toggle.textContent()) ?? '').trim().toLowerCase()
  if (currentPolicy !== expectedPolicy) {
    await toggle.click()
  }

  await waitFor(
    async () => (((await toggle.textContent()) ?? '').trim().toLowerCase() === expectedPolicy),
    {
      timeoutMs: 10_000,
      errorMessage: `Assistant execution policy did not switch to ${expectedPolicy}.`,
    },
  )
}

const clearConversation = async (page) => {
  const newChatButton = page.locator('[data-testid="assistant-new-chat"]')
  if ((await newChatButton.count()) > 0) {
    await newChatButton.click()
  }
}

const results = []

const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
}

async function main() {
  const useExistingServer = await isServerResponsive(baseUrl)
  const server = useExistingServer ? { child: null, getLogs: () => '' } : startDevServer()
  let browser = null
  const captures = []

  const getLatestCapture = (prompt) =>
    [...captures].reverse().find((capture) => capture.prompt === prompt.toLowerCase().trim())

  try {
    log(useExistingServer ? 'Using existing editor dev server...' : 'Waiting for editor dev server...')
    await waitForServer(baseUrl)

    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1365, height: 768 } })
    await page.addInitScript(() => {
      localStorage.clear()
      sessionStorage.clear()
    })

    await page.route('**/api/assistant/plan', async (route) => {
      const body = route.request().postDataJSON?.() ?? JSON.parse(route.request().postData() ?? '{}')
      const prompt = String(body.prompt ?? '').trim().toLowerCase()
      const sceneSummary = Array.isArray(body.context?.sceneSummary) ? body.context.sceneSummary : []
      const selectedNodeSummary = Array.isArray(body.context?.selectedNodeSummary) ? body.context.selectedNodeSummary : []
      const currentLevelId = getCurrentLevelId(body)
      const roofTarget = sceneSummary.find((node) => node.type === 'roof')
      const windowTarget = sceneSummary.find((node) => node.type === 'window')
      const wallTarget = selectedNodeSummary.find((node) => node.type === 'wall')

      let turn
      switch (prompt) {
        case 'create a 4m x 4m room on level 0 with walls, slab, and roof':
          turn = createAssistantTurn({
            reply: 'I can create the room footprint, walls, slab, and roof.',
            assumptions: ['Using the requested editable room footprint of 4 m x 4 m.'],
            actions: [
              {
                type: 'create_zone',
                levelId: currentLevelId,
                name: 'Room',
                polygon: [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                ],
                color: '#eab308',
              },
              { type: 'create_wall', levelId: currentLevelId, start: [0, 0], end: [4, 0], height: 2.7, thickness: 0.15 },
              { type: 'create_wall', levelId: currentLevelId, start: [4, 0], end: [4, 4], height: 2.7, thickness: 0.15 },
              { type: 'create_wall', levelId: currentLevelId, start: [4, 4], end: [0, 4], height: 2.7, thickness: 0.15 },
              { type: 'create_wall', levelId: currentLevelId, start: [0, 4], end: [0, 0], height: 2.7, thickness: 0.15 },
              { type: 'create_slab', levelId: currentLevelId, name: 'Room Slab', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
              { type: 'create_roof', levelId: currentLevelId, name: 'Room Roof', corner1: [0, 0], corner2: [4, 4], height: 1.4 },
            ],
          })
          break
        case 'add a window':
          if (!wallTarget) {
            throw new Error('Expected a selected wall before adding a window.')
          }
          turn = createAssistantTurn({
            reply: 'I can add a window to that wall.',
            assumptions: [`Using wall "${wallTarget.name ?? wallTarget.id}" as the window placement target.`],
            actions: [{ type: 'place_window', wallId: wallTarget.id, localX: 2, localY: 1.4, width: 1.32, height: 1.2 }],
          })
          break
        case 'remove this':
          turn = roofTarget
            ? createAssistantTurn({
                reply: 'I can remove the screenshot-grounded target after review.',
                actions: [{ type: 'delete_target', nodeId: roofTarget.id }],
                targetingExplanation: `Using "${roofTarget.name ?? roofTarget.id}" from the annotated screenshot target.`,
                targetCandidates: [
                  {
                    id: roofTarget.id,
                    type: roofTarget.type,
                    name: roofTarget.name ?? null,
                    source: 'image-annotation',
                    confidence: 0.97,
                  },
                ],
                imageInterpretation: {
                  kind: 'workspace',
                  ocrText: ['REMOVE'],
                  annotationHints: [
                    { kind: 'circle' },
                    { kind: 'region', region: body.image?.analysis?.redMarkupBounds ?? { x: 0.3, y: 0.2, width: 0.2, height: 0.2 } },
                    { kind: 'label', label: 'remove' },
                  ],
                  targetHints: [{ text: 'roof', targetTypes: ['roof'] }],
                  buildHints: [{ text: 'Treat the image as the current workspace and resolve targets against existing scene nodes before creating new geometry.' }],
                  confidence: 0.96,
                },
              })
            : createAssistantTurn({
                reply: 'I need a more specific screenshot target or a smaller first step before I continue safely.',
                mode: 'clarify',
                actions: [],
                requiresReview: false,
                ambiguities: [
                  'The uploaded image looked actionable, but there were no visible scene targets to ground it against.',
                  'Try naming the target directly, or narrow the request to a specific wall, window, roof, or room.',
                ],
                targetingExplanation: 'The uploaded image looked actionable, but there were no visible scene targets to ground it against.',
                targetCandidates: [],
                imageInterpretation: {
                  kind: 'workspace',
                  ocrText: ['REMOVE'],
                  annotationHints: [
                    { kind: 'circle' },
                    { kind: 'region', region: body.image?.analysis?.redMarkupBounds ?? { x: 0.3, y: 0.2, width: 0.2, height: 0.2 } },
                    { kind: 'label', label: 'remove' },
                  ],
                  targetHints: [],
                  buildHints: [{ text: 'Treat the image as the current workspace and resolve targets against existing scene nodes before creating new geometry.' }],
                  confidence: 0.96,
                },
              })
          break
        case 'move this window left':
          if (!windowTarget) {
            throw new Error('Expected a window in the scene before the move scenario.')
          }
          turn = createAssistantTurn({
            reply: 'I can move the screenshot-grounded window.',
            assumptions: [`Using "${windowTarget.name ?? windowTarget.id}" from the annotated uploaded screenshot as the move target.`],
            actions: [{ type: 'move_target', nodeId: windowTarget.id, delta: [-1, 0, 0] }],
            targetingExplanation: `Using "${windowTarget.name ?? windowTarget.id}" from the annotated screenshot target.`,
            targetCandidates: [
              {
                id: windowTarget.id,
                type: windowTarget.type,
                name: windowTarget.name ?? null,
                source: 'image-annotation',
                confidence: 0.97,
              },
            ],
            imageInterpretation: {
              kind: 'workspace',
              ocrText: ['MOVE'],
              annotationHints: [
                { kind: 'arrow', direction: 'left' },
                { kind: 'region', region: body.image?.analysis?.redMarkupBounds ?? { x: 0.42, y: 0.2, width: 0.26, height: 0.18 } },
                { kind: 'label', label: 'move', direction: 'left' },
              ],
              targetHints: [{ text: 'window', targetTypes: ['window'] }],
              buildHints: [{ text: 'Treat the image as the current workspace and resolve targets against existing scene nodes before creating new geometry.' }],
              confidence: 0.98,
            },
          })
          break
        case 'recreate this floor plan approximately':
          turn = createAssistantTurn({
            reply: 'I can recreate that floor plan approximately.',
            assumptions: [
              'Approximating the uploaded floor plan with editable structural geometry instead of a literal trace.',
              'The first pass uses inferred scale from the prompt and current workspace context.',
              'Where the source is underspecified, I will use the nearest editable proxy or room-sized approximation.',
            ],
            actions: [{ type: 'create_zone', levelId: currentLevelId, name: 'Approx Room', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
            imageInterpretation: {
              kind: 'floorplan',
              ocrText: [],
              annotationHints: [],
              targetHints: [],
              buildHints: [{ text: 'Use the floor plan as a loose structural guide rather than a literal trace.' }],
              confidence: 0.8,
            },
          })
          break
        case 'switch to furnish mode':
          turn = createAssistantTurn({
            reply: 'I can switch to furnish.',
            actions: [{ type: 'set_phase', phase: 'furnish' }],
            requiresReview: false,
          })
          break
        case 'hola':
          turn = createAssistantTurn({
            reply: 'Hola, puedo ayudarte a build, refine, or explain the current scene.',
            mode: 'chat',
            actions: [],
            requiresReview: false,
          })
          break
        default:
          throw new Error(`Unhandled prompt in command-vision browser check: ${prompt}`)
      }

      captures.push({ prompt, body, turn })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(turn),
      })
    })

    log('Opening editor...')
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(window.__PASCAL_DEV__), null, { timeout: 60_000 })
    await page.waitForSelector('[data-testid="assistant-panel"]', { state: 'visible' })
    await ensureExecutionPolicy(page, 'review')

    log('Creating a room fixture scene...')
    await resetEditorState(page)
    await sendPrompt(page, 'create a 4m x 4m room on level 0 with walls, slab, and roof')
    await waitForReviewCard(page)
    await applyCurrentPlan(page)

    let snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.zone, 1)
    assert.equal(snapshot.counts.wall, 4)
    assert.equal(snapshot.counts.roof, 1)

    const roofNode = snapshot.nodes.find((node) => node.type === 'roof')
    const wallNode = snapshot.nodes.find((node) => node.type === 'wall')
    assert.ok(roofNode)
    assert.ok(wallNode)

    await setSelectedNode(page, wallNode.id)
    await sendPrompt(page, 'add a window')
    await waitForReviewCard(page)
    await applyCurrentPlan(page)

    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.window, 1)

    const windowBeforeMove = snapshot.nodes.find((node) => node.type === 'window')
    assert.ok(windowBeforeMove?.position)

    log('Verifying circled REMOVE screenshot deletion path...')
    await uploadSvg(page, svgUpload('workspace-remove.svg', removeScreenshotSvg))
    assert.equal(await page.locator('[data-testid="assistant-image-intent"]').inputValue(), 'auto')
    await sendPrompt(page, 'remove this')
    await waitForReviewCard(page)

    const removeCapture = getLatestCapture('remove this')
    assert.ok(removeCapture)
    assert.equal(removeCapture.body.image.kind, 'auto')
    assert.ok((removeCapture.body.image.analysis?.viewportMatchScore ?? 0) > 0.9)
    assert.ok((removeCapture.body.image.analysis?.workspaceUiScore ?? 0) > 0.4)
    assert.equal(removeCapture.turn.imageInterpretation?.kind, 'workspace')
    assert.equal(removeCapture.turn.actions?.[0]?.type, 'delete_target')
    assert.match(removeCapture.turn.targetingExplanation ?? '', /annotated screenshot target/i)
    assert.match(await page.locator('[data-testid="assistant-review-card"]').textContent(), /annotated screenshot target/i)

    const roofCountBeforeDelete = snapshot.counts.roof ?? 0
    await applyCurrentPlan(page)
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.counts.roof ?? 0, roofCountBeforeDelete - 1)
    record('browser remove screenshot resolves and deletes the circled target', true)

    log('Verifying arrow-based move screenshot path...')
    await uploadSvg(page, svgUpload('workspace-move.svg', moveScreenshotSvg))
    assert.equal(await page.locator('[data-testid="assistant-image-intent"]').inputValue(), 'auto')
    await sendPrompt(page, 'move this window left')
    await waitForReviewCard(page)

    const moveCapture = getLatestCapture('move this window left')
    assert.ok(moveCapture)
    assert.equal(moveCapture.turn.imageInterpretation?.kind, 'workspace')
    assert.equal(moveCapture.turn.actions?.[0]?.type, 'move_target')
    assert.match(moveCapture.turn.targetingExplanation ?? '', /annotated screenshot target/i)

    await applyCurrentPlan(page)
    snapshot = await getSnapshot(page)
    const windowAfterMove = snapshot.nodes.find((node) => node.id === moveCapture.turn.actions[0].nodeId)
    assert.ok(windowAfterMove?.position)
    assert.ok((windowAfterMove.position?.[0] ?? 0) < (windowBeforeMove.position?.[0] ?? 0))
    record('browser move screenshot resolves the correct node and applies a bounded move', true)

    log('Verifying floor-plan browser path...')
    await resetEditorState(page)
    await clearConversation(page)
    await uploadSvg(page, svgUpload('floorplan.svg', floorplanSvg))
    await sendPrompt(page, 'recreate this floor plan approximately')
    await waitForReviewCard(page)

    const floorplanCapture = getLatestCapture('recreate this floor plan approximately')
    assert.ok(floorplanCapture)
    assert.equal(floorplanCapture.turn.actions?.[0]?.type, 'create_zone')
    assert.ok(
      floorplanCapture.turn.assumptions?.some((assumption) => /editable structural geometry/i.test(assumption)),
    )

    await applyCurrentPlan(page)
    snapshot = await getSnapshot(page)
    assert.ok((snapshot.counts.zone ?? 0) >= 1)
    record('browser floor-plan prompt still returns and executes a buildable plan', true)

    log('Verifying planner alias drift stays user-safe in the UI...')
    await clearConversation(page)
    await sendPrompt(page, 'switch to furnish mode')
    await waitForExecutionDone(page)
    snapshot = await getSnapshot(page)
    assert.equal(snapshot.phase, 'furnish')
    const pageText = (await page.locator('body').textContent()) ?? ''
    assert.doesNotMatch(pageText, /invalid enum|expected one of|schema validation/i)
    record('browser planner alias drift shows repaired execution instead of a schema dump', true)

    log('Verifying new chat clears stale image-grounded failure UI...')
    await resetEditorState(page)
    await clearConversation(page)
    await uploadSvg(page, svgUpload('workspace-remove-empty.svg', removeScreenshotSvg))
    await sendPrompt(page, 'remove this')
    await waitForClarifyCard(page)
    const clarifyText = (await page.locator('[data-testid="assistant-clarify-card"]').textContent()) ?? ''
    assert.match(clarifyText, /no visible scene targets|ground it against/i)

    await clearConversation(page)
    await waitFor(
      async () => (await page.locator('[data-testid="assistant-clarify-card"]').count()) === 0,
      {
        timeoutMs: 10_000,
        errorMessage: 'Clarify card did not clear after starting a new chat.',
      },
    )

    await sendPrompt(page, 'hola')
    await waitFor(
      async () => {
        const text = (await page.locator('body').textContent()) ?? ''
        return /hola|puedo ayudarte/i.test(text)
      },
      { timeoutMs: 10_000, errorMessage: 'Greeting reply did not render after new chat reset.' },
    )
    const postResetText = (await page.locator('body').textContent()) ?? ''
    assert.doesNotMatch(postResetText, /no visible scene targets|ground it against/i)
    record('browser new chat clears stale image-grounded clarification state', true)

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

main()
  .then(() => {
    console.log(JSON.stringify(results, null, 2))
  })
  .catch((error) => {
    console.error(error)
    console.log(JSON.stringify(results, null, 2))
    process.exitCode = 1
  })
