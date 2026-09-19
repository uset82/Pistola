import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Smoke-checks the static export that Sites publishes. It serves the export
// directory over plain HTTP (no Next server, no API routes) and drives the
// hosted editor the way a visitor would.
const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const editorRoot = path.resolve(scriptsRoot, '..')

// Bun's isolated node_modules layout can leave `playwright`'s nested
// `playwright-core` link empty, which breaks resolution under Node. Fall back
// to the hoisted store entry so the check runs with plain `node`.
const loadChromium = async () => {
  try {
    return (await import('playwright')).chromium
  } catch (error) {
    const storeRoot = path.join(editorRoot, 'node_modules', '.bun')
    const entries = await readdir(storeRoot).catch(() => [])
    const coreEntry = entries.find((entry) => entry.startsWith('playwright-core@'))
    if (!coreEntry) throw error
    const coreIndex = path.join(storeRoot, coreEntry, 'node_modules', 'playwright-core', 'index.mjs')
    return (await import(pathToFileURL(coreIndex).href)).chromium
  }
}

const chromium = await loadChromium()
const exportDirectory = path.resolve(
  process.env.PISTOLA_SITES_OUT_DIR ?? path.join(editorRoot, 'out'),
)
const port = Number(process.env.PISTOLA_SITES_SMOKE_PORT ?? 3010)

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.hdr': 'application/octet-stream',
}

const resolveStaticFile = async (urlPath) => {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const candidates = [decoded]
  if (decoded.endsWith('/')) {
    candidates.push(`${decoded}index.html`)
  } else {
    candidates.push(`${decoded}.html`, `${decoded}/index.html`)
  }

  for (const candidate of candidates) {
    const filePath = path.normalize(path.join(exportDirectory, candidate))
    if (!filePath.startsWith(exportDirectory)) continue
    const stats = await stat(filePath).catch(() => null)
    if (stats?.isFile()) return filePath
  }
  return null
}

const server = http.createServer(async (request, response) => {
  const filePath = await resolveStaticFile(request.url ?? '/')
  if (!filePath) {
    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end('Not found')
    return
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
})

await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${port}`

const results = []
const record = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const consoleErrors = []
  const apiRequests = []
  const failedRequests = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === baseUrl && url.pathname.startsWith('/api/')) {
      apiRequests.push(url.pathname)
    }
  })
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.origin === baseUrl) {
      failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'failed'})`)
    }
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin === baseUrl && response.status() >= 400) {
      failedRequests.push(`${response.url()} (${response.status()})`)
    }
  })

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })

  const headline = page.getByText(/Say the object/i).first()
  await headline.waitFor({ state: 'visible', timeout: 30000 })
  record('landing matches How Pistola Works', true)

  const github = page.getByRole('link', { name: /Collaborate on GitHub/i }).first()
  await github.waitFor({ state: 'visible', timeout: 15000 })
  const githubHref = await github.getAttribute('href')
  record(
    'collaborate link points at GitHub',
    githubHref === 'https://github.com/uset82/Pistola',
    githubHref ?? '',
  )

  const privacy = page.getByRole('link', { name: 'Privacy' })
  const privacyHref = await privacy.getAttribute('href')
  record(
    'privacy link points at official Canner',
    privacyHref === 'https://pistola.canner.app/privacy',
    privacyHref ?? '',
  )

  const openWorkspace = page.getByRole('link', { name: /^Open workspace$/i }).first()
  await openWorkspace.click()
  await page.waitForURL(/\/workspace/, { timeout: 15000 })

  const architectureTab = page.getByRole('tab', { name: 'Architecture workspace' }).first()
  await architectureTab.waitFor({ state: 'visible', timeout: 30000 })
  record('Architecture world is present', true)

  const cadTab = page.getByRole('tab', { name: 'CAD workspace' }).first()
  const cadTabVisible = await cadTab.isVisible().catch(() => false)
  record('CAD world is present', cadTabVisible)

  const assistant = page.getByRole('button', { name: /New Chat/i }).first()
  const assistantVisible = await assistant.isVisible().catch(() => false)
  record('AI Assistant is mounted', assistantVisible)
  if (assistantVisible) {
    await page.getByRole('button', { name: 'Minimize assistant' }).click()
  }
  const assistantCollapsed = await page.getByTestId('assistant-toggle').isVisible().catch(() => false)
  record('AI Assistant can be collapsed before direct IDE work', assistantCollapsed)

  const sitesBanner = await page.getByText(/Pistola CAD on Sites|Pistola browser preview/i).count()
  record('no Sites-only banner', sitesBanner === 0)

  await page.waitForFunction(
    () => document.documentElement.dataset.pistolaAgent === 'ready',
    undefined,
    { timeout: 15000 },
  )
  const operatorResult = await page.evaluate(async () => {
    const api = window.pistola
    if (!api?.taskPlan || api.taskPlan.version !== 1) return { available: false }
    const inspection = await api.inspect({ type: 'level', limit: 1 })
    const levelId = inspection.nodes[0]?.id
    if (!levelId) return { available: true, ok: false, error: 'No level was available.' }
    const plan = await api.taskPlan.create({
      id: 'sites-smoke-direct-plan',
      title: 'Static Sites direct control smoke',
      source: 'codex',
      phases: [
        {
          id: 'build',
          title: 'Build',
          steps: [{ id: 'box', title: 'Place a provider-free box', kind: 'execution' }],
        },
      ],
    })
    const outcome = await api.taskPlan.runStep({
      planId: plan.id,
      phaseId: 'build',
      stepId: 'box',
      actions: [
        {
          type: 'place_item',
          assetId: 'primitive-box',
          name: 'Static smoke box',
          levelId,
          placement: 'explicit',
          position: [0, 0, 0],
          scale: [0.25, 0.25, 0.25],
        },
      ],
    })
    return {
      available: true,
      ok: outcome.ok,
      planId: plan.id,
      status: outcome.plan.status,
      createdNodeIds: outcome.result?.createdNodeIds ?? [],
    }
  })
  record('provider-free IDE operator bridge is available', operatorResult.available === true)
  record(
    'static Sites executes a direct typed action plan',
    operatorResult.ok === true &&
      operatorResult.status === 'done' &&
      operatorResult.createdNodeIds?.length === 1,
    operatorResult.error ?? '',
  )

  const operatorPanel = page.getByTestId('operator-plan-panel')
  const operatorPanelVisible = await operatorPanel.isVisible().catch(() => false)
  const operatorPanelText = operatorPanelVisible ? await operatorPanel.textContent() : ''
  record(
    'IDE plan mirror is visible and provider-free',
    operatorPanelVisible &&
      /IDE plan/i.test(operatorPanelText ?? '') &&
      /Provider-free/i.test(operatorPanelText ?? '') &&
      /Verified/i.test(operatorPanelText ?? '') &&
      !/model provider|What should we build/i.test(operatorPanelText ?? ''),
  )

  if (operatorResult.planId) {
    await page.evaluate(async (planId) => window.pistola?.taskPlan.undo(planId), operatorResult.planId)
  }

  if (cadTabVisible) {
    await cadTab.click()
    await wait(500)

    const sketchTool = page.getByRole('button', { name: /New Sketch/i }).first()
    const sketchToolVisible = await sketchTool.isVisible().catch(() => false)
    record('CAD sketch tools are available', sketchToolVisible)

    const extrudeCount = await page.getByRole('button', { name: /Extrude \(Pad\)/i }).count()
    record('FreeCAD solid tools are available', extrudeCount > 0)

    const enginesLabel = await page.getByText(/CAD Engines/i).count()
    record('CAD Runtime panel lists both engines', enginesLabel > 0)

    if (sketchToolVisible) {
      await sketchTool.click()
      await wait(500)
      const stillAlive = await architectureTab.isVisible().catch(() => false)
      record('activating the sketch tool does not crash the editor', stillAlive)
    }
  }

  await wait(1500)

  record(
    'the static host does not serve /api/* itself',
    apiRequests.length === 0,
    apiRequests.length ? [...new Set(apiRequests)].join(', ') : '',
  )
  record(
    'no failed same-origin network requests',
    failedRequests.length === 0,
    failedRequests.length ? failedRequests.slice(0, 5).join(' | ') : '',
  )

  const relevantErrors = consoleErrors.filter(
    (text) =>
      !/WebGPU|webgpu|GPUAdapter|THREE\.WebGPURenderer/i.test(text) &&
      !/pistola\.canner\.app|CORS policy|Access-Control-Allow-Origin|net::ERR_FAILED/i.test(text),
  )
  record(
    'no console errors',
    relevantErrors.length === 0,
    relevantErrors.length ? relevantErrors.slice(0, 5).join(' | ') : '',
  )
} catch (error) {
  record('smoke run completed', false, error instanceof Error ? error.message : String(error))
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter((result) => !result.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length > 0 ? 1 : 0)
