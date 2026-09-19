import type { PixelGrid } from '../cad/silhouette-tracer'
import { bytesFromDataUrl, decodePng } from '../render/png'

const decodeViaImage = async (dataUrl: string): Promise<PixelGrid | null> => {
  if (typeof Image === 'undefined') return null
  try {
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height)
    return { width: image.width, height: image.height, data: pixels.data }
  } catch {
    return null
  }
}

const readPathBytes = async (filePath: string): Promise<Uint8Array> => {
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    const response = await fetch(filePath)
    if (!response.ok) throw new Error(`Could not fetch reference image "${filePath}".`)
    return new Uint8Array(await response.arrayBuffer())
  }
  try {
    const fs = require('node:fs') as { readFileSync: (path: string) => Uint8Array }
    return fs.readFileSync(filePath)
  } catch (error) {
    throw new Error(
      `Could not read reference path "${filePath}". Pass a dataUrl in the browser. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

export const loadReferenceGrid = async (input: {
  path?: string
  dataUrl?: string
}): Promise<{ grid: PixelGrid; dataUrl?: string }> => {
  if (input.dataUrl) {
    const fromImage = await decodeViaImage(input.dataUrl)
    if (fromImage) return { grid: fromImage, dataUrl: input.dataUrl }
    return { grid: decodePng(bytesFromDataUrl(input.dataUrl)), dataUrl: input.dataUrl }
  }
  if (input.path) {
    if (input.path.startsWith('data:')) {
      return loadReferenceGrid({ dataUrl: input.path })
    }
    const bytes = await readPathBytes(input.path)
    const grid = decodePng(bytes)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return { grid, dataUrl: `data:image/png;base64,${btoa(binary)}` }
  }
  throw new Error('reference.add requires path or dataUrl.')
}
