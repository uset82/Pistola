import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rendersDir = () => {
  let dir = process.cwd()
  for (let hop = 0; hop < 6; hop += 1) {
    if (existsSync(path.join(dir, '.git'))) return path.join(dir, '.pistola', 'renders')
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.join(process.cwd(), '.pistola', 'renders')
}

export const saveRenderPng = (base64: string, name: string) => {
  const dir = rendersDir()
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${Date.now()}-${name.replace(/[^a-z0-9-]+/gi, '-')}.png`)
  writeFileSync(file, Buffer.from(base64, 'base64'))
  return file
}

export const pngPayload = (rendered: { dataUrl?: unknown; mime?: unknown }) => {
  const dataUrl = typeof rendered.dataUrl === 'string' ? rendered.dataUrl : ''
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  if (!base64) throw new Error('The Pistola page did not return a PNG.')
  return { base64, mime: typeof rendered.mime === 'string' ? rendered.mime : 'image/png' }
}
