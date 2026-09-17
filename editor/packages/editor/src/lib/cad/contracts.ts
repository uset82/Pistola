import type {
  CadBodyNode,
  CadBodyOperation,
  CadSketchNode,
} from '@pascal-app/core'

export const DEFAULT_CAD_HELPER_URL = 'http://127.0.0.1:7878'

export const cadJobTypes = [
  'sketch_to_solid',
  'extrude',
  'revolve',
  'regenerate',
  'boolean_union',
  'boolean_cut',
  'boolean_intersect',
  'fillet',
  'chamfer',
  'import_step',
  'export_step',
] as const

export type CadJobType = (typeof cadJobTypes)[number]
export type CadHelperJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type CadHelperHealth = {
  status: 'ready' | 'error'
  runtime: string
  engine: string
  version: string
  helperUrl: string
  error?: string
}

export type CadHelperJobRequest = {
  type: CadJobType
  payload: Record<string, unknown>
}

export type CadHelperJobCreateResponse = {
  jobId: string
  status: CadHelperJobStatus
}

export type CadHelperArtifactRefs = CadBodyNode['artifacts'] & {
  previewArtifactRef?: string | null
  cadArtifactRef?: string | null
}

export type CadHelperJobResult = {
  jobId: string
  type: CadJobType
  status: CadHelperJobStatus
  warnings: string[]
  error?: string
  result?: {
    preview: CadBodyNode['preview']
    operations: CadBodyOperation[]
    artifacts: CadHelperArtifactRefs
    sourceSketch?: CadSketchNode
    exportFile?: {
      filename: string
      content: string
    }
  }
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null

const asStatus = (value: unknown): CadHelperJobStatus => {
  switch (value) {
    case 'running':
    case 'succeeded':
    case 'failed':
      return value
    case 'queued':
    case 'pending':
    default:
      return 'pending'
  }
}

const asJobType = (value: unknown): CadJobType => {
  if (typeof value === 'string' && (cadJobTypes as readonly string[]).includes(value)) {
    return value as CadJobType
  }

  return 'regenerate'
}

const normalizeArtifactPathSeparators = (value: string) => value.replaceAll('\\', '/')

const getArtifactRelativePath = (value: string) => {
  const normalizedValue = normalizeArtifactPathSeparators(value)
  const artifactMarker = '/.artifacts/'
  const markerIndex = normalizedValue.toLowerCase().lastIndexOf(artifactMarker)
  if (markerIndex < 0) return null
  return normalizedValue.slice(markerIndex + artifactMarker.length)
}

export const normalizeCadArtifactUrl = (value: unknown): string | null => {
  const pathValue = asString(value)
  if (!pathValue) return null

  if (pathValue.startsWith('/api/cad/artifacts/')) return pathValue
  if (pathValue.startsWith('/v1/cad/artifacts/')) {
    return `/api/cad/artifacts/${pathValue.slice('/v1/cad/artifacts/'.length)}`
  }
  if (pathValue.startsWith('http://') || pathValue.startsWith('https://')) return pathValue
  if (pathValue.startsWith('memory://')) return pathValue
  if (pathValue.startsWith('/')) return pathValue

  const relativePath = getArtifactRelativePath(pathValue)
  return relativePath ? `/api/cad/artifacts/${relativePath}` : null
}

export const normalizeCadHelperHealth = (
  payload: unknown,
  helperUrlFallback = DEFAULT_CAD_HELPER_URL,
): CadHelperHealth => {
  const record = isRecord(payload) ? payload : {}
  const rawStatus = asString(record.status)

  return {
    status: rawStatus === 'error' ? 'error' : 'ready',
    runtime: asString(record.runtime) || 'external',
    engine: asString(record.engine) || 'unknown',
    version: asString(record.version) || 'unknown',
    helperUrl: asString(record.helperUrl) || helperUrlFallback,
    ...(asString(record.error) ? { error: asString(record.error)! } : {}),
  }
}

export const normalizeCadJobCreateResponse = (payload: unknown): CadHelperJobCreateResponse => {
  const record = isRecord(payload) ? payload : {}

  return {
    jobId: asString(record.jobId) || '',
    status: asStatus(record.status),
  }
}

const normalizeCadArtifacts = (payload: unknown): CadHelperArtifactRefs => {
  const record = isRecord(payload) ? payload : {}
  const previewUrlSource = asString(record.previewUrl) || asString(record.previewArtifactRef)
  const cadUrlSource = asString(record.cadUrl)
  const exportUrlSource = asString(record.exportUrl)

  return {
    previewUrl: normalizeCadArtifactUrl(previewUrlSource),
    cadUrl: normalizeCadArtifactUrl(cadUrlSource),
    exportUrl: normalizeCadArtifactUrl(exportUrlSource),
    previewArtifactRef: asString(record.previewArtifactRef) || asString(record.previewUrl),
    cadArtifactRef: asString(record.cadArtifactRef) || asString(record.cadUrl),
  }
}

export const normalizeCadJobResult = (payload: unknown): CadHelperJobResult => {
  const record = isRecord(payload) ? payload : {}
  const resultRecord = isRecord(record.result) ? record.result : null

  return {
    jobId: asString(record.jobId) || '',
    type: asJobType(record.type),
    status: asStatus(record.status),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
    ...(asString(record.error) ? { error: asString(record.error)! } : {}),
    ...(resultRecord
      ? {
          result: {
            preview: (resultRecord.preview as CadBodyNode['preview']) || {
              primitive: 'box',
              dimensions: [1, 1, 1],
              color: '#60a5fa',
            },
            operations: Array.isArray(resultRecord.operations)
              ? (resultRecord.operations as CadBodyOperation[])
              : [],
            artifacts: normalizeCadArtifacts(resultRecord.artifacts),
            ...(isRecord(resultRecord.sourceSketch)
              ? { sourceSketch: resultRecord.sourceSketch as CadSketchNode }
              : {}),
            ...(isRecord(resultRecord.exportFile)
              ? {
                  exportFile: {
                    filename: asString(resultRecord.exportFile.filename) || 'export.step',
                    content: asString(resultRecord.exportFile.content) || '',
                  },
                }
              : {}),
          },
        }
      : {}),
  }
}

