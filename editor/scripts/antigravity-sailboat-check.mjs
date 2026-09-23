import { spawn } from 'node:child_process'
import { mkdir, readdir, copyFile, writeFile, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium } from './load-chromium.mjs'

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(editorRoot, '..')
const evidenceDir = path.join(repoRoot, 'docs/tasks/evidence/frictionless-creation')
const rendersDir = path.join(repoRoot, '.pistola/renders')
const configPath = path.join(process.env.USERPROFILE ?? '', '.gemini/config/mcp_config.json')
const agy = path.join(process.env.LOCALAPPDATA ?? '', 'agy/bin/antigravity.exe')

const prompt = `Build a toy sailboat in the already-open Pistola tab using only pistola MCP tools: pistola_status, pistola_open, pistola_task_create, pistola_inspect, pistola_task_run_step, pistola_render_eight_views. Do not use pistola_chat, pistola_plan, or the in-app assistant. Do not reload the tab. Do not edit files.

Create a task plan, then run one batch of place_item actions with allowOverlap true and placement explicit:
1. name "Sailboat Hull", assetId primitive-box, position [0,0,0], scale [1.4,0.45,3.2], color #8b5a2b, refId $ref_sailboat_hull
2. name "Sailboat Keel", assetId primitive-box, position [0,-0.35,0], scale [0.12,0.7,1.4], color #4a3728, parentId $ref_sailboat_hull
3. name "Sailboat Mast", assetId primitive-cylinder, position [0,0.45,0.2], scale [0.1,2.4,0.1], color #d6c6a8, parentId $ref_sailboat_hull
4. name "Sailboat Sail", assetId primitive-wedge, position [0.15,0.9,0.4], scale [0.08,1.8,1.4], color #f4f1ea, parentId $ref_sailboat_hull

Then call pistola_render_eight_views with mode "image" and do not pass cell. Reply with the render file path and the part count. Stop.`

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

const runAgy = () => new Promise((resolve) => {
  const child = spawn(agy, [
    '--print', prompt,
    '--mode', 'accept-edits',
    '--dangerously-skip-permissions',
    '--print-timeout', '4m',
    '--add-dir', repoRoot,
  ], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.on('error', (error) => resolve({ code: 1, output: String(error) }))
  let output = ''
  const append = (chunk) => {
    output += chunk.toString()
    if (output.length > 120_000) output = output.slice(-80_000)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  const timer = setTimeout(() => {
    child.kill()
    resolve({ code: 124, output: `${output}\nTIMEOUT` })
  }, 5 * 60 * 1000)
  child.on('exit', (code) => {
    clearTimeout(timer)
    resolve({ code: code ?? 1, output })
  })
})

const pngNames = async () => {
  const names = await readdir(rendersDir).catch(() => [])
  return new Set(names.filter((name) => name.endsWith('.png')))
}

const main = async () => {
  await mkdir(evidenceDir, { recursive: true })
  const original = await readFile(configPath, 'utf8')
  const before = await pngNames()
  const standIn = await openStandIn()
  console.log(`stand-in ${standIn.sessionId}`)
  const config = JSON.parse(original)
  config.mcpServers.pistola.env = {
    PISTOLA_TARGET: 'local',
    PISTOLA_TRANSPORT: 'bridge',
    PISTOLA_BASE_URL: 'http://127.0.0.1:3002',
    PISTOLA_SESSION_ID: standIn.sessionId,
  }
  let result = { code: 1, output: '' }
  try {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    result = await runAgy()
  } finally {
    await writeFile(configPath, original)
    await standIn.browser.close()
  }
  const after = await pngNames()
  const fresh = [...after].filter((name) => !before.has(name))
  const ranked = []
  for (const name of fresh) {
    const info = await stat(path.join(rendersDir, name))
    ranked.push({ name, size: info.size })
  }
  ranked.sort((left, right) => right.size - left.size)
  let copied = null
  const best = ranked[0]
  if (best && best.size > 10_000) {
    copied = path.join(evidenceDir, 'antigravity-sailboat.png')
    await copyFile(path.join(rendersDir, best.name), copied)
  }
  const report = { sessionId: standIn.sessionId, code: result.code, fresh: ranked, copied }
  await writeFile(path.join(evidenceDir, 'antigravity-sailboat.txt'), `${JSON.stringify(report, null, 2)}\n\n${result.output.slice(-6000)}\n`)
  console.log(JSON.stringify(report))
}

await main()
