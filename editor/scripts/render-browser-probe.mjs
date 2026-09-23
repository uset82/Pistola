import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMcpClient } from './mcp-stdio-client.mjs'

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(editorRoot, '..')
const child = spawn('node', [path.join(editorRoot, 'tooling/pistola-mcp/src/index.ts')], {
  env: {
    ...process.env,
    PISTOLA_TRANSPORT: 'browser',
    PISTOLA_TARGET: 'local',
    PISTOLA_BROWSER_HEADLESS: '1',
    PISTOLA_BROWSER_CHANNEL: 'chrome',
    PISTOLA_BROWSER_DEBUG_PORT: '9334',
    PISTOLA_BROWSER_PROFILE: path.join(os.tmpdir(), 'pistola-browser-probe-profile'),
    PISTOLA_MCP_ASSISTANT_TOOLS: '',
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})
child.stderr.on('data', (chunk) => process.stderr.write(chunk))
const client = createMcpClient(child)

try {
  await client.initialize()
  await client.callTool('pistola_open', {})
  const ran = await client.callTool('pistola_run', {
    actions: [
      {
        type: 'build_cad_solid',
        name: 'Browser probe',
        color: '#e11d48',
        spec: { op: 'box', size: [1, 1, 1] },
        position: [0, 0, 0],
      },
    ],
    preview: false,
  })
  const runText = ran.content?.find((item) => item.type === 'text')?.text ?? ''
  let created = null
  try {
    created = JSON.parse(runText).createdNodeIds?.length ?? JSON.parse(runText).result?.createdNodeIds?.length ?? null
  } catch {
    created = null
  }
  const views = await client.callTool('pistola_render_views', {})
  const image = views.content?.find((item) => item.type === 'image')
  const text = views.content?.find((item) => item.type === 'text')?.text ?? ''
  if (!image?.data) throw new Error(`no image ${text.slice(0, 200)}`)
  const file = path.join(repoRoot, 'docs/tasks/evidence/frictionless-creation/browser-driver-views.png')
  const bytes = Buffer.from(image.data, 'base64')
  await writeFile(file, bytes)
  console.log(JSON.stringify({
    runHasError: runText.includes('"ok": false'),
    created,
    bytes: bytes.length,
    saved: text.includes('.pistola'),
    file,
  }))
} finally {
  child.kill()
  setTimeout(() => process.exit(0), 100)
}
