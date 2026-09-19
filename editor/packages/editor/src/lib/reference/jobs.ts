/**
 * Worker-ready job body. This module stays free of the scene store so it can
 * run on the main thread (tests, Sites) or inside a Worker.
 */
import type { BlueprintV2 } from '../blueprint'
import type { PixelGrid } from '../cad/silhouette-tracer'
import type { StructurePart } from '../structure'
import { fitPartsToReference, type FitResult } from './fitter'
import { goldMasksFromTraces, traceReferenceSheet, worldFramesFromOverall } from './tracer'
import type { KnownDimension, ReferenceFrames, ReferenceGoldMasks, ReferenceTraceResult } from './types'

export type TraceJob = {
  kind: 'trace'
  grid: PixelGrid
  knownDimension: number | KnownDimension
  threshold?: number
}

export type FitJob = {
  kind: 'fit'
  parts: StructurePart[]
  goldMasks: ReferenceGoldMasks
  frames: ReferenceFrames
  blueprint: BlueprintV2
}

export type ReferenceJob = TraceJob | FitJob

export type TraceJobResult = {
  kind: 'trace'
  trace: ReferenceTraceResult
  goldMasks: ReferenceGoldMasks
  frames: ReferenceFrames
}

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

export const executeFitJob = (job: FitJob): FitResult =>
  fitPartsToReference({
    parts: job.parts,
    goldMasks: job.goldMasks,
    frames: job.frames,
    blueprint: job.blueprint,
  })

export const executeReferenceJob = (job: ReferenceJob) => {
  if (job.kind === 'trace') return executeTraceJob(job)
  return executeFitJob(job)
}

export const runReferenceJob = async <T>(job: ReferenceJob): Promise<T> => {
  return executeReferenceJob(job) as T
}
