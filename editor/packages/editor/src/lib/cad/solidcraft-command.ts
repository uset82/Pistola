import { createCadJob } from './client'
import type { CadHelperJobResult } from './contracts'
import { waitForCadJob } from './wait-for-job'

/**
 * The SolidCraft passthrough job types.
 *
 * These reach SolidCraft's command catalog directly instead of going through
 * the eleven canonical geometry jobs. The helper rejects them with a 400 while
 * it runs the FreeCAD engine, because FreeCAD has no addressable catalog.
 */
export type SolidcraftJobType = 'command' | 'batch' | 'list_commands' | 'describe_command'

export class SolidcraftUnavailableError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'SolidcraftUnavailableError'
  }
}

const SOLIDCRAFT_ENGINE_HINT =
  'SolidCraft commands need the SolidCraft CAD engine. Start the helper with PISTOLA_CAD_ENGINE=solidcraft.'

/**
 * Run one passthrough job and return its settled result.
 *
 * A 400 from the helper means the wrong engine is active, which is a
 * configuration problem rather than a bad command, so it is reported with the
 * hint rather than the raw HTTP error.
 */
export async function runSolidcraftJob(
  type: SolidcraftJobType,
  payload: Record<string, unknown>,
): Promise<CadHelperJobResult> {
  let created: Awaited<ReturnType<typeof createCadJob>>

  try {
    created = await createCadJob({ type, payload })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('400')) throw new SolidcraftUnavailableError(SOLIDCRAFT_ENGINE_HINT)
    throw error
  }

  const job = await waitForCadJob(created.jobId)

  if (job.status === 'failed') {
    throw new Error(job.error || `SolidCraft job ${type} failed.`)
  }

  return job
}

/** The free-form payload a passthrough job returns, never a body. */
export const solidcraftJobData = (job: CadHelperJobResult): Record<string, unknown> =>
  job.result?.data ?? {}
