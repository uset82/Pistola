import assert from 'node:assert/strict'
import { test } from 'node:test'

import { executeReferenceJob, runReferenceJob, type ReferenceJob, type TraceJobResult } from './jobs'

const traceJob = (): ReferenceJob => {
  const width = 180
  const height = 60
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * width + x) * 4
        data[index] = 20
        data[index + 1] = 20
        data[index + 2] = 20
        data[index + 3] = 255
      }
    }
  }
  fill(10, 15, 50, 45)
  fill(70, 15, 90, 45)
  fill(130, 20, 170, 40)
  return { kind: 'trace', grid: { width, height, data }, knownDimension: 2 }
}

test('runReferenceJob uses a supplied browser Worker and terminates it after a result', async () => {
  let terminated = false
  const fake = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    postMessage(request: unknown) {
      const input = request as { id: number; job: ReferenceJob }
      queueMicrotask(() => {
        fake.onmessage?.({
          data: { id: input.id, ok: true, result: executeReferenceJob(input.job) },
        } as MessageEvent)
      })
    },
    terminate() {
      terminated = true
    },
  }

  const result = await runReferenceJob<TraceJobResult>(traceJob(), {
    workerFactory: () => fake as unknown as Worker,
  })

  assert.equal(result.kind, 'trace')
  assert.equal(result.trace.consistent, true)
  assert.equal(terminated, true)
})

test('runReferenceJob propagates Worker failures and still terminates the Worker', async () => {
  let terminated = false
  const fake = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    postMessage(request: unknown) {
      const input = request as { id: number }
      queueMicrotask(() => {
        fake.onmessage?.({ data: { id: input.id, ok: false, error: { message: 'tracing failed' } } } as MessageEvent)
      })
    },
    terminate() {
      terminated = true
    },
  }

  await assert.rejects(
    () => runReferenceJob(traceJob(), { workerFactory: () => fake as unknown as Worker }),
    /tracing failed/,
  )
  assert.equal(terminated, true)
})

test('runReferenceJob retains the deterministic inline fallback outside a browser', async () => {
  const result = await runReferenceJob<TraceJobResult>(traceJob())
  assert.equal(result.kind, 'trace')
  assert.equal(result.trace.views.front.plane, 'XY')
})
