/**
 * Pure reference-job functions shared by the page, tests, and the browser
 * Worker. Keep this module free of editor state and browser globals.
 */
import { fitPartsToReference } from './fitter'
import { goldMasksFromTraces, traceReferenceSheet, worldFramesFromOverall } from './tracer'
import type { FitJob, ReferenceJob, ReferenceJobResult, TraceJob, TraceJobResult } from './job-types'

export const executeTraceJob = (job: TraceJob): TraceJobResult => {
  const trace = traceReferenceSheet(job.grid, job.knownDimension, { threshold: job.threshold })
  const frames = worldFramesFromOverall(trace.overall_m)
  return {
    kind: 'trace',
    trace,
    frames,
    goldMasks: goldMasksFromTraces(trace.views, frames),
  }
}

export const executeFitJob = (job: FitJob) =>
  fitPartsToReference({
    parts: job.parts,
    goldMasks: job.goldMasks,
    frames: job.frames,
    blueprint: job.blueprint,
  })

export const executeReferenceJob = (job: ReferenceJob): ReferenceJobResult => {
  if (job.kind === 'trace') return executeTraceJob(job)
  return executeFitJob(job)
}
