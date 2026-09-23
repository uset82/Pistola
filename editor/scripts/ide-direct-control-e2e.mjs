import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { createMcpClient, parseToolJson } from './mcp-stdio-client.mjs'
import { loadChromium } from './load-chromium.mjs'

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const editorRoot = path.resolve(scriptsRoot, '..')
const repoRoot = path.resolve(editorRoot, '..')
const evidenceDir = path.join(repoRoot, 'docs/tasks/evidence/ide-direct-control')
const exportDirectory = path.resolve(process.env.PISTOLA_SITES_OUT_DIR ?? path.join(editorRoot, 'out'))

const args = process.argv.slice(2)
const targetFlag = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'sites'
const listOnly = args.includes('--list-tools')
const assistantTools = args.includes('--assistant-tools')

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
}

const serveExport = async (port) => {
  const exists = await stat(exportDirectory).catch(() => null)
  if (!exists) {
    throw new Error(`Sites export is missing at ${exportDirectory}. Run bun run build:sites first.`)
  }
  const resolveFile = async (urlPath) => {
    const decoded = decodeURIComponent((urlPath ?? '/').split('?')[0])
    const candidates = [decoded]
    if (decoded.endsWith('/')) candidates.push(`${decoded}index.html`)
    else candidates.push(`${decoded}.html`, `${decoded}/index.html`)
    for (const candidate of candidates) {
      const filePath = path.normalize(path.join(exportDirectory, candidate))
      if (!filePath.startsWith(exportDirectory)) continue
      const stats = await stat(filePath).catch(() => null)
      if (stats?.isFile()) return filePath
    }
    return null
  }
  const server = http.createServer(async (request, response) => {
    const filePath = await resolveFile(request.url)
    if (!filePath) {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    })
    createReadStream(filePath).pipe(response)
  })
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  return server
}

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const diagonal = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left
  if (upDistance <= diagonal) return up
  return upLeft
}

const pngLuminanceSpread = (buffer) => {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Render is not a PNG.')
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 2
  const chunks = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels || width < 1 || height < 1) throw new Error(`Unsupported PNG color type ${colorType}.`)
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  let previous = Buffer.alloc(stride)
  let min = 255
  let max = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0
    const row = Buffer.alloc(stride)
    const start = y * (stride + 1) + 1
    for (let index = 0; index < stride; index += 1) {
      const value = raw[start + index] ?? 0
      const left = index >= channels ? row[index - channels] : 0
      const up = previous[index]
      const upLeft = index >= channels ? previous[index - channels] : 0
      if (filter === 1) row[index] = (value + left) & 255
      else if (filter === 2) row[index] = (value + up) & 255
      else if (filter === 3) row[index] = (value + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) row[index] = (value + paeth(left, up, upLeft)) & 255
      else row[index] = value
    }
    for (let index = 0; index < stride; index += channels * 8) {
      const luminance = channels === 1
        ? row[index]
        : Math.round(0.2126 * row[index] + 0.7152 * row[index + 1] + 0.0722 * row[index + 2])
      min = Math.min(min, luminance)
      max = Math.max(max, luminance)
    }
    previous = row
  }
  return { width, height, spread: max - min }
}

const waitForBridgeTab = async () => {
  const chromium = await loadChromium()
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://127.0.0.1:3002/workspace', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => document.documentElement.dataset.pistolaAgent === 'ready', undefined, { timeout: 60_000 })
  const sessionId = await page.evaluate(() => sessionStorage.getItem('pistola-workspace-session-id'))
  if (!sessionId) {
    await browser.close()
    throw new Error('The stand-in tab did not create a workspace session.')
  }
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const response = await fetch('http://127.0.0.1:3002/api/workspace/session')
    const body = await response.json().catch(() => ({}))
    const mine = (body.sessions ?? []).find((session) => session.sessionId === sessionId)
    if (mine?.streamConnected) return { browser, sessionId }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  await browser.close()
  throw new Error('The stand-in tab did not register a bridge stream.')
}

const localAlive = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'manual' })
    return response.ok || [301, 302, 307, 308].includes(response.status)
  } catch {
    return false
  }
}

const collectBodies = (inspected) => {
  const bags = [inspected?.nodes, inspected?.items, inspected?.bodies, inspected?.results]
  const nodes = bags.find((value) => Array.isArray(value)) ?? []
  return nodes.filter((node) => node?.type === 'cad-body' || /sailboat/i.test(String(node?.name ?? '')))
}

const sailboatActions = [
  {
    type: 'place_item',
    name: 'Sailboat Hull',
    assetId: 'primitive-box',
    placement: 'explicit',
    position: [0, 0, 0],
    scale: [1.4, 0.45, 3.2],
    color: '#8b5a2b',
    allowOverlap: true,
  },
  {
    type: 'place_item',
    name: 'Sailboat Keel',
    assetId: 'primitive-box',
    placement: 'explicit',
    position: [0, -0.35, 0],
    scale: [0.12, 0.7, 1.4],
    color: '#4a3728',
    allowOverlap: true,
  },
  {
    type: 'place_item',
    name: 'Sailboat Mast',
    assetId: 'primitive-cylinder',
    placement: 'explicit',
    position: [0, 0.45, 0.2],
    scale: [0.1, 2.4, 0.1],
    color: '#d6c6a8',
    allowOverlap: true,
  },
  {
    type: 'place_item',
    name: 'Sailboat Sail',
    assetId: 'primitive-wedge',
    placement: 'explicit',
    position: [0.15, 0.9, 0.4],
    scale: [0.08, 1.8, 1.4],
    color: '#f4f1ea',
    allowOverlap: true,
  },
]

const main = async () => {
  await mkdir(evidenceDir, { recursive: true })
  let server = null
  let pageUrl = process.env.PISTOLA_TARGET_URL ?? ''

  if (!pageUrl) {
    if (targetFlag === 'canner') {
      pageUrl = process.env.PISTOLA_CANNER_URL ?? 'https://pistola.canner.app/workspace'
    } else if (targetFlag === 'local') {
      const live = 'http://127.0.0.1:3002/workspace'
      pageUrl = (await localAlive(live)) ? live : ((server = await serveExport(3020)), 'http://127.0.0.1:3020/workspace')
    } else if (targetFlag === 'sites') {
      pageUrl = process.env.PISTOLA_SITES_URL
        ? process.env.PISTOLA_SITES_URL
        : ((server = await serveExport(3011)), 'http://127.0.0.1:3011/workspace')
    } else {
      pageUrl = targetFlag
    }
  }

  let standIn = null
  let transport = 'browser'
  if (targetFlag === 'local' && pageUrl.startsWith('http://127.0.0.1:3002')) {
    standIn = await waitForBridgeTab()
    transport = 'bridge'
  }

  const child = spawn('node', [path.join(editorRoot, 'tooling/pistola-mcp/src/index.ts')], {
    env: {
      ...process.env,
      PISTOLA_TRANSPORT: transport,
      PISTOLA_TARGET: transport === 'bridge' ? 'local' : pageUrl,
      ...(standIn?.sessionId ? { PISTOLA_SESSION_ID: standIn.sessionId } : {}),
      PISTOLA_BROWSER_HEADLESS: process.env.PISTOLA_BROWSER_HEADLESS ?? '1',
      PISTOLA_BROWSER_PROFILE: path.join(evidenceDir, `.browser-profile-${targetFlag}`),
      ...(assistantTools ? { PISTOLA_MCP_ASSISTANT_TOOLS: '1' } : { PISTOLA_MCP_ASSISTANT_TOOLS: '' }),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const client = createMcpClient(child)
  try {
    await client.initialize()
    const listed = await client.listTools()
    const names = (listed.tools ?? []).map((tool) => tool.name).sort()
    await writeFile(
      path.join(evidenceDir, `mcp-tools-${assistantTools ? 'assistant' : 'default'}.json`),
      `${JSON.stringify(names, null, 2)}\n`,
    )
    if (listOnly) {
      console.log(JSON.stringify({ tools: names }, null, 2))
      return
    }
    const leaked = names.filter((name) => name.includes('assistant') || name === 'pistola_plan' || name === 'pistola_chat')
    if (!assistantTools && leaked.length > 0) {
      throw new Error(`Default MCP surface leaked AI tools: ${leaked.join(', ')}`)
    }

    const opened = parseToolJson(await client.callTool('pistola_open'))
    if (opened.error) throw new Error(opened.error)
    if (opened.signInRequired) throw new Error('sign-in required')
    if (!opened.apiVersion) {
      throw new Error('This deployment lacks window.pistola.invoke. Stop. Do not fall back to chat.')
    }

    const plan = parseToolJson(
      await client.callTool('pistola_task_create', {
        plan: {
          id: `sailboat-${targetFlag}`,
          title: 'Toy sailboat',
          source: 'ide',
          replace: true,
          phases: [
            {
              id: 'model',
              title: 'Model',
              steps: [
                { id: 'inspect', title: 'Inspect scene', kind: 'observation' },
                { id: 'build', title: 'Build hull keel mast sail', kind: 'execution' },
                { id: 'verify', title: 'Verify four bodies', kind: 'validation' },
              ],
            },
          ],
        },
      }),
    )
    const planId = plan.id
    if (!planId) throw new Error(`taskPlan.create failed: ${JSON.stringify(plan)}`)

    const levels = parseToolJson(await client.callTool('pistola_inspect', { type: 'level', limit: 20 }))
    const levelId = collectBodies({ nodes: levels.nodes }).find((node) => node.type === 'level')?.id
      ?? (levels.nodes ?? []).find((node) => node?.type === 'level')?.id
    await client.callTool('pistola_task_update_step', {
      planId,
      phaseId: 'model',
      stepId: 'inspect',
      status: 'done',
      evidence: {
        kind: 'observation',
        summary: levelId ? `Using level ${levelId}.` : 'Workspace opened; no explicit level id found.',
      },
    })

    const actions = sailboatActions.map((action, index) => ({
      ...action,
      ...(levelId ? { levelId } : {}),
      ...(index === 0 ? { refId: '$ref_sailboat_hull' } : { parentId: '$ref_sailboat_hull' }),
    }))

    const built = parseToolJson(
      await client.callTool('pistola_task_run_step', {
        planId,
        phaseId: 'model',
        stepId: 'build',
        actions,
      }),
    )
    if (built.ok === false || built.error) {
      throw new Error(`Sailboat build failed: ${JSON.stringify(built)}`)
    }

    const inspected = parseToolJson(await client.callTool('pistola_inspect', { nameQuery: 'Sailboat', limit: 50 }))
    const bodies = collectBodies(inspected)
    const total = bodies.length || Number(inspected.total ?? 0)
    if (total < 4) {
      throw new Error(`Expected at least 4 bodies, inspect returned ${JSON.stringify(inspected).slice(0, 1000)}`)
    }

    await client.callTool('pistola_task_update_step', {
      planId,
      phaseId: 'model',
      stepId: 'verify',
      status: 'done',
      evidence: { kind: 'observation', summary: `Inspect found ${total} bodies.` },
    })

    await client.callTool('pistola_wait_idle', { timeoutMs: 10_000 }).catch(() => null)
    const shot = await client.callTool('pistola_screenshot')
    const image = shot.content?.find((item) => item.type === 'image')
    if (!image?.data) {
      throw new Error(`Screenshot tool did not return image content: ${JSON.stringify(shot).slice(0, 800)}`)
    }
    const png = Buffer.from(image.data, 'base64')
    const spread = pngLuminanceSpread(png)
    if (spread.spread < 12) {
      throw new Error(`Render is flat (luminance spread ${spread.spread}).`)
    }
    const screenshotPath = path.join(evidenceDir, `sailboat-${targetFlag}.png`)
    await writeFile(screenshotPath, png)

    const portraitPath = path.join(repoRoot, '.pistola/studio/claude-self-portrait/actions.json')
    let selfPortrait = 'missing'
    try {
      const portraitActions = JSON.parse(await readFile(portraitPath, 'utf8'))
      const replayActions = Array.isArray(portraitActions)
        ? portraitActions
        : Array.isArray(portraitActions.order) && portraitActions.groups
          ? portraitActions.order.flatMap((name) => portraitActions.groups[name] ?? [])
          : portraitActions.actions
      const replayed = parseToolJson(await client.callTool('pistola_replay', { actions: replayActions }))
      if (replayed.ok === false || replayed.error) throw new Error(JSON.stringify(replayed).slice(0, 500))
      const structure = parseToolJson(await client.callTool('pistola_check'))
      if ((structure.errorCount ?? 1) !== 0) {
        throw new Error(`Self-portrait structure errors: ${structure.errorCount}`)
      }
      selfPortrait = '0 errors'
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        selfPortrait = 'missing'
      } else {
        throw error
      }
    }

    const status = parseToolJson(await client.callTool('pistola_status'))
    if ((status.forbiddenRequestCount ?? 0) > 0) {
      throw new Error(`Forbidden requests: ${JSON.stringify(status.forbiddenHits)}`)
    }

    const finalPlan = parseToolJson(await client.callTool('pistola_task_get'))
    await writeFile(
      path.join(evidenceDir, `sailboat-${targetFlag}.json`),
      `${JSON.stringify({ pageUrl, status, plan: finalPlan, built, inspect: inspected }, null, 2)}\n`,
    )

    console.log(
      JSON.stringify(
        {
          ok: true,
          target: targetFlag,
          pageUrl,
          apiVersion: opened.apiVersion,
          forbiddenRequestCount: status.forbiddenRequestCount ?? 0,
          framing: 'newline',
          transport,
          luminanceSpread: spread.spread,
          selfPortrait,
          screenshot: screenshotPath,
        },
        null,
        2,
      ),
    )
  } finally {
    child.kill()
    await standIn?.browser.close()
    server?.close()
    setTimeout(() => process.exit(0), 50)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
