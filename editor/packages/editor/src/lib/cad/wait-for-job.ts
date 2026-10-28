import { fetchCadJob } from './client'
import type { CadHelperJobResult, CadHelperJobStatus } from './contracts'

export const CAD_JOB_TIMEOUT_MS = 60_000
export const CAD_JOB_POLL_MS = 500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Poll a CAD helper job until it settles.
 *
 * Shared by the body runtime system and the SolidCraft passthrough actions so
 * both agree on the timeout and the terminal states.
 */
export async function waitForCadJob(
  jobId: string,
  onStatus?: (status: CadHelperJobStatus) => void,
): Promise<CadHelperJobResult> {
  const deadline = Date.now() + CAD_JOB_TIMEOUT_MS

  while (Date.now() < deadline) {
    const job = await fetchCadJob(jobId)
    onStatus?.(job.status)

    if (job.status === 'succeeded' || job.status === 'failed') {
      return job
    }

    await sleep(CAD_JOB_POLL_MS)
  }

  throw new Error('CAD helper timed out while waiting for a job result.')
}
