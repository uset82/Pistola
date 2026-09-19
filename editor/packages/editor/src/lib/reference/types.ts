import type { BlueprintV2 } from '../blueprint'
import type { RasterFrame } from '../render'
import type { TracedProfile } from '../cad/silhouette-tracer'

export const REFERENCE_SHEET_LAYOUTS = ['front|side|top', 'sheet', 'front-side-top'] as const
export type ReferenceSheetLayout = (typeof REFERENCE_SHEET_LAYOUTS)[number]

/** A session-local source token for guide proposals; never an image payload. */
export const REFERENCE_GUIDE_URI_PREFIX = 'pistola-reference:'

export const referenceGuideUri = (referenceId: string) => `${REFERENCE_GUIDE_URI_PREFIX}${referenceId}`

export const referenceGuideIdFromUri = (value: string) =>
  value.startsWith(REFERENCE_GUIDE_URI_PREFIX) ? value.slice(REFERENCE_GUIDE_URI_PREFIX.length) : null

export type KnownDimension = {
  axis: 'width' | 'height' | 'depth' | 'x' | 'y' | 'z'
  meters: number
  label?: string
}

export type ReferenceViewName = 'front' | 'side' | 'top'

export type ReferenceViewTrace = TracedProfile & {
  view: ReferenceViewName
  plane: 'XY' | 'ZY' | 'XZ'
}

export type CrossViewCheck = {
  pair: string
  expected: number
  actual: number
  error: number
  ok: boolean
}

export type ReferenceTraceResult = {
  views: Record<ReferenceViewName, ReferenceViewTrace>
  overall_m: [number, number, number]
  metersPerPixel: number
  consistency: CrossViewCheck[]
  consistent: boolean
}

export type ReferenceGoldMasks = {
  front: Uint8Array
  side: Uint8Array
  top: Uint8Array
  size: number
}

export type ReferenceFrames = {
  front: RasterFrame
  side: RasterFrame
  top: RasterFrame
}

export type ReferenceRecord = {
  id: string
  layout: ReferenceSheetLayout
  knownDimension: KnownDimension
  blueprint: BlueprintV2
  dataUrl?: string
  trace: ReferenceTraceResult
  goldMasks: ReferenceGoldMasks
  frames: ReferenceFrames
}

export type ReferenceAddInput = {
  path?: string
  dataUrl?: string
  layout?: ReferenceSheetLayout
  knownDimension: number | KnownDimension
  blueprint: unknown
}

export const normalizeKnownDimension = (value: number | KnownDimension): KnownDimension => {
  if (typeof value === 'number') {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new Error('knownDimension must be a positive length in meters.')
    }
    return { axis: 'width', meters: value, label: 'width' }
  }
  if (!(value.meters > 0) || !Number.isFinite(value.meters)) {
    throw new Error('knownDimension.meters must be a positive length in meters.')
  }
  return value
}

export const axisIndex = (axis: KnownDimension['axis']) => {
  if (axis === 'height' || axis === 'y') return 1
  if (axis === 'depth' || axis === 'z') return 2
  return 0
}
