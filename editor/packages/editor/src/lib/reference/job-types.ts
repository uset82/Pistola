import type { BlueprintV2 } from '../blueprint'
import type { PixelGrid } from '../cad/silhouette-tracer'
import type { StructurePart } from '../structure'
import type { FitResult } from './fitter'
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

export type ReferenceJobResult = TraceJobResult | FitResult
