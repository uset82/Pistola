import { spawn } from 'node:child_process'
import { mkdir, readdir, copyFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium } from './load-chromium.mjs'

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(editorRoot, '..')
const evidenceDir = path.join(repoRoot, 'docs/tasks/evidence/frictionless-creation')
const rendersDir = path.join(repoRoot, '.pistola/renders')
const settingsPath = path.join(repoRoot, '.workbuddy/settings.json')
const mcpConfigPath = path.join(repoRoot, '.pistola/workbuddy-mcp.json')
const codebuddy = 'C:/Users/carlos/AppData/Local/Programs/WorkBuddyAI/resources/app.asar.unpacked/cli/bin/codebuddy'

const prompt = `Build a toy sailboat in the already-open Pistola tab using only pistola MCP tools: pistola_status, pistola_open, pistola_task_create, pistola_inspect, pistola_task_run_step, pistola_render_eight_views. Do not use pistola_chat, pistola_plan, or the in-app assistant. Do not reload the tab. Do not edit files.

Create a task plan, then run one batch of place_item actions with allowOverlap true and placement explicit:
1. name "Sailboat Hull", assetId primitive-box, position [0,0,0], scale [1.4,0.45,3.2], color #8b5a2b, refId $ref_sailboat_hull
2. name "Sailboat Keel", assetId primitive-box, position [0,-0.35,0], scale [0.12,0.7,1.4], color #4a3728, parentId $ref_sailboat_hull
3. name "Sailboat Mast", assetId primitive-cylinder, position [0,0.45,0.2], scale [0.1,2.4,0.1], color #d6c6a8, parentId $ref_sailboat_hull
4. name "Sailboat Sail", assetId primitive-wedge, position [0.15,0.9,0.4], scale [0.08,1.8,1.4], color #f4f1ea, parentId $ref_sailboat_hull

Then call pistola_render_eight_views. Reply with the render file path and the part count. Stop.`

const openStandIn = async () => {
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

const runCodebuddy = (sessionId) => new Promise((resolve) => {
  const child = spawn(process.execPath, [
    codebuddy,
    '--print',
    '--settings', settingsPath,
    '--strict-mcp-config',
    '--mcp-config', mcpConfigPath,
    '--max-turns', '8',
    '--output-format', 'text',
    prompt,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PISTOLA_SESSION_ID: sessionId,
      PISTOLA_TARGET: 'local',
      PISTOLA_TRANSPORT: 'bridge',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const append = (chunk) => {
    output += chunk.toString()
    if (output.length > 80_000) output = output.slice(-60_000)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.on('error', (error) => resolve({ code: 1, output: String(error) }))
  const timer = setTimeout(() => {
    child.kill()
    resolve({ code: 124, output: `${output}\nTIMEOUT` })
  }, 8 * 60 * 1000)
  child.on('exit', (code) => {
    clearTimeout(timer)
    resolve({ code: code ?? 1, output })
  })
})

const pngNames = async () => new Set((await readdir(rendersDir).catch(() => [])).filter((name) => name.endsWith('.png')))

const main = async () => {
  await mkdir(evidenceDir, { recursive: true })
  await mkdir(path.join(repoRoot, '.pistola'), { recursive: true })
  const before = await pngNames()
  const standIn = await openStandIn()
  console.log(`stand-in ${standIn.sessionId}`)
  await writeFile(mcpConfigPath, JSON.stringify({
    honoured: true,
    mcpServers: {
      pistola: {
        command: 'node',
        args: [path.join(editorRoot, 'tooling/pistola-mcp/src/index.ts')],
        env: {
          PISTOLA_TARGET: 'local',
          PISTOLA_TRANSPORT: 'bridge',
          PISTOLA_SESSION_ID: standIn.sessionId,
        },
      },
    },
  }, null, 2))
  let result = { code: 1, output: '' }
  try {
    result = await runCodebuddy(standIn.sessionId)
  } finally {
    await standIn.browser.close()
    await rm(mcpConfigPath, { force: true })
  }
  const fresh = [...await pngNames()].filter((name) => !before.has(name))
  let copied = null
  if (fresh.length > 0) {
    copied = path.join(evidenceDir, 'workbuddy-sailboat.png')
    await copyFile(path.join(rendersDir, fresh[fresh.length - 1]), copied)
  }
  const report = { sessionId: standIn.sessionId, code: result.code, fresh, copied }
  await writeFile(path.join(evidenceDir, 'workbuddy-sailboat.txt'), `${JSON.stringify(report, null, 2)}\n\n${result.output.slice(-4000)}\n`)
  console.log(JSON.stringify(report))
}

await main()
