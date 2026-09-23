import type { CaptureBounds, CapturePose } from './capture-frame'
import type { Vec3 } from '../render-views/canonical-views'

export type SceneCaptureRequest = {
  width: number
  height: number
  pose: CapturePose
}

export type SceneCaptureResult = {
  dataUrl: string
  camera: {
    position: Vec3
    target: Vec3
    up: Vec3
    fov: number
    projection: CapturePose['projection']
  }
  bounds: CaptureBounds | null
}

type Waiter = {
  request: SceneCaptureRequest
  bounds: CaptureBounds | null
  resolve: (value: SceneCaptureResult) => void
  reject: (error: Error) => void
}

const queue: Waiter[] = []
const listeners = new Set<() => void>()

export const requestSceneCapture = (
  request: SceneCaptureRequest,
  bounds: CaptureBounds | null = null,
  timeoutMs = 8_000,
) =>
  new Promise<SceneCaptureResult>((resolve, reject) => {
    const waiter: Waiter = { request, bounds, resolve, reject }
    const timer = setTimeout(() => {
      const index = queue.indexOf(waiter)
      if (index >= 0) queue.splice(index, 1)
      reject(new Error('Scene capture timed out. The 3D viewer is not mounted in this tab.'))
    }, timeoutMs)
    waiter.resolve = (value) => {
      clearTimeout(timer)
      resolve(value)
    }
    waiter.reject = (error) => {
      clearTimeout(timer)
      reject(error)
    }
    queue.push(waiter)
    for (const listener of listeners) listener()
  })

export const subscribeSceneCaptures = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const takeSceneCapture = () => queue.shift()
