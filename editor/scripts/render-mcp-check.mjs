import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { createMcpClient } from './mcp-stdio-client.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const rendersDir = path.join(repoRoot, '.pistola', 'renders')

const pngSpread = (buffer) => {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a png')
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
  if (!channels) throw new Error(`color type ${colorType}`)
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  let min = 255
  let max = 0
  let previous = Buffer.alloc(stride)
  const paeth = (left, up, upLeft) => {
    const estimate = left + up - upLeft
    const pa = Math.abs(estimate - left)
    const pb = Math.abs(estimate - up)
    const pc = Math.abs(estimate - upLeft)
    if (pa <= pb && pa <= pc) return left
    if (pb <= pc) return up
    return upLeft
  }
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
      const lum = channels === 1 ? row[index] : Math.round(0.2126 * row[index] + 0.7152 * row[index + 1] + 0.0722 * row[index + 2])
      min = Math.min(min, lum)
      max = Math.max(max, lum)
    }
    previous = row
  }
  return { width, height, spread: max - min, longEdge: Math.max(width, height) }
}

const newestRender = async (since) => {
  const names = await readdir(rendersDir).catch(() => [])
  const files = []
  for (const name of names) {
    const file = path.join(rendersDir, name)
    const info = await stat(file)
    if (info.mtimeMs >= since) files.push({ file, mtimeMs: info.mtimeMs })
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files[0]?.file ?? null
}

const child = spawn('node', [path.join(repoRoot, 'editor/tooling/pistola-mcp/src/index.ts')], {
  env: { ...process.env, PISTOLA_TRANSPORT: 'bridge', PISTOLA_TARGET: 'local', PISTOLA_MCP_ASSISTANT_TOOLS: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
})
child.stderr.on('data', (chunk) => process.stderr.write(chunk))
const client = createMcpClient(child)
const started = Date.now()

try {
  await client.initialize()
  const views = await client.callTool('pistola_render_views', {})
  const image = views.content?.find((item) => item.type === 'image')
  if (!image?.data) throw new Error(`render_views missing image: ${JSON.stringify(views).slice(0, 400)}`)
  const real = pngSpread(Buffer.from(image.data, 'base64'))
  if (real.spread < 12) throw new Error(`render_views is flat (${real.spread})`)
  if (real.longEdge > 1568) throw new Error(`render_views long edge ${real.longEdge}`)
  const text = views.content?.find((item) => item.type === 'text')?.text ?? ''
  const meta = JSON.parse(text)
  if (!meta.path || !String(meta.path).includes(`${path.sep}.pistola${path.sep}renders${path.sep}`)) {
    throw new Error(`render_views did not save under .pistola/renders: ${text.slice(0, 300)}`)
  }

  const layout = await client.callTool('pistola_render_views', { mode: 'layout' })
  const layoutImage = layout.content?.find((item) => item.type === 'image')
  if (!layoutImage?.data) throw new Error('layout mode did not return an image')
  pngSpread(Buffer.from(layoutImage.data, 'base64'))

  const ran = await client.callTool('pistola_run', {
    actions: [{ type: 'build_cad_solid', name: 'Preview probe', spec: { op: 'box', size: [0.2, 0.2, 0.2] }, position: [4, 0, 4] }],
    preview: true,
  })
  const preview = ran.content?.find((item) => item.type === 'image')
  const previewText = ran.content?.find((item) => item.type === 'text')?.text ?? ''
  if (!preview?.data) throw new Error(`auto-preview missing image: ${previewText.slice(0, 400)}`)
  const previewSpread = pngSpread(Buffer.from(preview.data, 'base64'))
  if (previewSpread.spread < 12) throw new Error(`preview is flat (${previewSpread.spread})`)
  if (!previewText.includes('previewPath')) throw new Error('auto-preview did not return previewPath')
  await client.callTool('pistola_undo', {})

  const saved = await newestRender(started)
  console.log(JSON.stringify({
    ok: true,
    views: { ...real, path: meta.path },
    layoutBytes: Buffer.from(layoutImage.data, 'base64').length,
    preview: previewSpread,
    saved,
  }))
} finally {
  child.kill()
  setTimeout(() => process.exit(0), 50)
}
