/**
 * Dispatches the store-free reference-job body to a module Worker in the
 * browser. SSR, tests, and browsers without Worker support retain a
 * deterministic inline fallback.
 */
import { executeFitJob, executeReferenceJob, executeTraceJob } from './job-core'
import type { ReferenceJob, ReferenceJobResult } from './job-types'

export { executeFitJob, executeReferenceJob, executeTraceJob }
export type { FitJob, ReferenceJob, ReferenceJobResult, TraceJob, TraceJobResult } from './job-types'

type ReferenceWorkerRequest = {
  id: number
  job: ReferenceJob
}

type ReferenceWorkerResponse =
  | { id: number; ok: true; result: ReferenceJobResult }
  | { id: number; ok: false; error: { message: string } }

export type ReferenceJobRunOptions = {
  /** A test seam, or a host-specific Worker constructor. */
  workerFactory?: () => Worker
  timeoutMs?: number
}

export const REFERENCE_JOB_TIMEOUT_MS = 30_000

let nextJobId = 0

const messageFor = (error: unknown) => (error instanceof Error ? error.message : 'Reference job failed.')

const createBrowserWorker = (): Worker | null => {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./reference-worker.ts', import.meta.url), { type: 'module' })
  } catch (error) {
    throw new Error(`Could not start the reference Worker: ${messageFor(error)}`)
  }
}

const runInWorker = <T>(worker: Worker, job: ReferenceJob, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const id = ++nextJobId
    let settled = false
    const cleanup = () => {
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      clearTimeout(timeout)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const timeout = setTimeout(() => {
      settle(() => reject(new Error(`Reference job exceeded ${timeoutMs}ms.`)))
    }, timeoutMs)

    worker.onmessage = (event: MessageEvent<ReferenceWorkerResponse>) => {
      const response = event.data
      if (!response || response.id !== id) return
      if (response.ok) {
        settle(() => resolve(response.result as T))
      } else {
        settle(() => reject(new Error(response.error.message)))
      }
    }
    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message || 'Reference Worker failed.')))
    }
    worker.onmessageerror = () => {
      settle(() => reject(new Error('Reference Worker could not deserialize a job response.')))
    }

    try {
      worker.postMessage({ id, job } satisfies ReferenceWorkerRequest)
    } catch (error) {
      settle(() => reject(new Error(messageFor(error))))
    }
  })

export const runReferenceJob = async <T>(job: ReferenceJob, options: ReferenceJobRunOptions = {}): Promise<T> => {
  const worker = options.workerFactory?.() ?? createBrowserWorker()
  if (!worker) return executeReferenceJob(job) as T
  return runInWorker<T>(worker, job, options.timeoutMs ?? REFERENCE_JOB_TIMEOUT_MS)
}
