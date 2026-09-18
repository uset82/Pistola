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
    if (url.pathname.startsWith('/api/')) apiRequests.push(url.pathname)
  })
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'failed'})`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.url()} (${response.status()})`)
  })

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })

  const structureTab = page.getByRole('button', { name: /^Structure/ }).first()
  await structureTab.waitFor({ state: 'visible', timeout: 30000 })
  record('editor shell renders from the static export', true)

  const cadTab = page.getByRole('button', { name: /^CAD/ }).first()
  const cadTabVisible = await cadTab.isVisible().catch(() => false)
  record('CAD workspace tab is present', cadTabVisible)

  if (cadTabVisible) {
    await cadTab.click()
    await wait(500)

    const sketchTool = page.getByRole('button', { name: /New Sketch/i }).first()
    const sketchToolVisible = await sketchTool.isVisible().catch(() => false)
    record('CAD sketch tools are available', sketchToolVisible)

    const extrudeCount = await page.getByRole('button', { name: /Extrude \(Pad\)/i }).count()
    record('FreeCAD-only Part Design tools are hidden', extrudeCount === 0)

    const runtimeNote = await page.getByText(/require the desktop FreeCAD runtime/i).count()
    record('Runtime limitation note is shown', runtimeNote > 0)

    if (sketchToolVisible) {
      await sketchTool.click()
      await wait(500)
      const stillAlive = await structureTab.isVisible().catch(() => false)
      record('activating the sketch tool does not crash the editor', stillAlive)
    }
  }

  await wait(1500)

  record(
    'no /api/* requests are issued by the static site',
    apiRequests.length === 0,
    apiRequests.length ? [...new Set(apiRequests)].join(', ') : '',
  )
  record(
    'no failed network requests',
    failedRequests.length === 0,
    failedRequests.length ? failedRequests.slice(0, 5).join(' | ') : '',
  )

  const relevantErrors = consoleErrors.filter(
    (text) => !/WebGPU|webgpu|GPUAdapter|THREE\.WebGPURenderer/i.test(text),
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
