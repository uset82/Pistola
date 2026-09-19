import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpClient, parseToolJson } from './mcp-stdio-client.mjs'

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

  const child = spawn('node', [path.join(editorRoot, 'tooling/pistola-mcp/src/index.ts')], {
    env: {
      ...process.env,
      PISTOLA_TRANSPORT: 'browser',
      PISTOLA_TARGET: pageUrl,
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
    const screenshotPath = path.join(evidenceDir, `sailboat-${targetFlag}.png`)
    await writeFile(screenshotPath, Buffer.from(image.data, 'base64'))

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
          screenshot: screenshotPath,
        },
        null,
        2,
      ),
    )
  } finally {
    child.kill()
    server?.close()
    setTimeout(() => process.exit(0), 50)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
