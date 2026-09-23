import { FramebufferTexture, RenderTarget, type WebGPURenderer } from 'three/webgpu'

export type PipelineCapturePose = {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  fov: number
  near: number
  far: number
}

export type PipelineCaptureImage = {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

type Waiter = {
  pose: PipelineCapturePose
  resolve: (image: PipelineCaptureImage) => void
  reject: (error: Error) => void
}

const queue: Waiter[] = []
let captureHold = 0

export const isPipelineCaptureActive = () => captureHold > 0

export const holdPipelineCapture = () => {
  captureHold += 1
}

export const releasePipelineCapture = () => {
  captureHold = Math.max(0, captureHold - 1)
}

export const requestPipelineCapture = (pose: PipelineCapturePose, timeoutMs = 8_000) =>
  new Promise<PipelineCaptureImage>((resolve, reject) => {
    const waiter: Waiter = { pose, resolve, reject }
    const timer = setTimeout(() => {
      const index = queue.indexOf(waiter)
      if (index >= 0) queue.splice(index, 1)
      reject(new Error('Scene capture timed out. The viewer pipeline is not ready.'))
    }, timeoutMs)
    waiter.resolve = (image) => {
      clearTimeout(timer)
      resolve(image)
    }
    waiter.reject = (error) => {
      clearTimeout(timer)
      reject(error)
    }
    queue.push(waiter)
  })

export const takePipelineCapture = () => queue.shift()

const unpackRows = (pixels: ArrayLike<number>, width: number, height: number) => {
  const tight = new Uint8ClampedArray(width * height * 4)
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256
  const packed = pixels.length === width * height * 4
  for (let y = 0; y < height; y += 1) {
    const source = packed ? y * width * 4 : y * bytesPerRow
    for (let x = 0; x < width; x += 1) {
      const from = source + x * 4
      const to = (y * width + x) * 4
      tight[to] = pixels[from] ?? 0
      tight[to + 1] = pixels[from + 1] ?? 0
      tight[to + 2] = pixels[from + 2] ?? 0
      tight[to + 3] = 255
    }
  }
  return tight
}

export const readFramebufferTexture = async (
  renderer: WebGPURenderer,
  texture: FramebufferTexture,
  width: number,
  height: number,
) => {
  const target = new RenderTarget(width, height)
  target.textures[0] = texture
  const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)
  texture.dispose()
  return unpackRows(pixels, width, height)
}
