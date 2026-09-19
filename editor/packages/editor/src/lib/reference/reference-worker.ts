import { executeReferenceJob } from './job-core'
import type { ReferenceJob, ReferenceJobResult } from './job-types'

type ReferenceWorkerRequest = {
  id: number
  job: ReferenceJob
}

type ReferenceWorkerResponse =
  | { id: number; ok: true; result: ReferenceJobResult }
  | { id: number; ok: false; error: { message: string } }

const messageFor = (error: unknown) => (error instanceof Error ? error.message : 'Reference job failed.')

self.addEventListener('message', (event: MessageEvent<ReferenceWorkerRequest>) => {
  const { id, job } = event.data
  try {
    const response: ReferenceWorkerResponse = { id, ok: true, result: executeReferenceJob(job) }
    self.postMessage(response)
  } catch (error) {
    const response: ReferenceWorkerResponse = { id, ok: false, error: { message: messageFor(error) } }
    self.postMessage(response)
  }
})
