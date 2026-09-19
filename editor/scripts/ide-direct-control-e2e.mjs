import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const createMcpClient = (child) => {
  let nextId = 1
  let buffer = Buffer.alloc(0)
  const pending = new Map()

  const take = () => {
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = buffer.subarray(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const start = headerEnd + 4
      if (buffer.length < start + length) return
      const body = buffer.subarray(start, start + length).toString('utf8')
      buffer = buffer.subarray(start + length)
      const message = JSON.parse(body)
      const waiter = pending.get(message.id)
      if (waiter) {
        pending.delete(message.id)
        if (message.error) waiter.reject(new Error(message.error.message ?? JSON.stringify(message.error)))
        else waiter.resolve(message.result)
      }
    }
  }

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    take()
  })
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  const send = (method, params) => {
    const id = nextId
    nextId += 1
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }), 'utf8')
    child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`)
    child.stdin.write(payload)
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`MCP timeout: ${method}`))
        }
      }, 180_000)
    })
  }

  return {
    initialize: async () => {
      await send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'pistola-ide-e2e', version: '1.0.0' },
      })
      child.stdin.write(
        `Content-Length: ${Buffer.byteLength('{"jsonrpc":"2.0","method":"notifications/initialized"}')}\r\n\r\n{"jsonrpc":"2.0","method":"notifications/initialized"}`,
      )
    },
    listTools: () => send('tools/list', {}),
    callTool: (name, arguments_) => send('tools/call', { name, arguments: arguments_ ?? {} }),
  }
}

const parseToolJson = (result) => {
  const text = result?.content?.find((item) => item.type === 'text')?.text
  if (!text) return result
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
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
