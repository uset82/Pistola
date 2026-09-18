export type MacHelperJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type MacHelperHealth = {
  status: 'ready' | 'error'
  runtime: string
  engine: string
  version: string
  helperUrl: string
  macRootConfigured?: boolean
  macRoot?: string | null
  pythonPath?: string | null
  openRouterConfigured?: boolean
  model?: string | null
  error?: string
}

export type MacHelperJobCreateResponse = {
  jobId: string
  status: MacHelperJobStatus
}

export type MacHelperArtifactRefs = {
  previewUrl?: string | null
  cadUrl?: string | null
  stlUrl?: string | null
  codeUrl?: string | null
  measurementsUrl?: string | null
  previewArtifactRef?: string | null
  cadArtifactRef?: string | null
  stlArtifactRef?: string | null
  codeArtifactRef?: string | null
}

export type MacHelperJobResult = {
  jobId: string
  type: string
  status: MacHelperJobStatus
  warnings: string[]
  error?: string
  result?: {
    prompt?: string
    mode?: string
    qaSummary?: string | null
    warnings?: string[]
    artifacts?: MacHelperArtifactRefs
    metadata?: Record<string, unknown>
  }
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null

const asStatus = (value: unknown): MacHelperJobStatus => {
  switch (value) {
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'pending':
      return value
    default:
      return 'pending'
  }
}

const rewriteArtifactUrl = (url: string | null | undefined) => {
  if (!url) return null
  if (url.startsWith('/v1/mac/artifacts/')) {
    return `/api/mac/artifacts/${url.slice('/v1/mac/artifacts/'.length)}`
  }
  if (url.startsWith('/api/mac/artifacts/')) {
    return url
  }
  return url
}

const normalizeArtifacts = (value: unknown): MacHelperArtifactRefs => {
  if (!isRecord(value)) return {}
  return {
    previewUrl: rewriteArtifactUrl(asString(value.previewUrl)),
    cadUrl: rewriteArtifactUrl(asString(value.cadUrl)),
    stlUrl: rewriteArtifactUrl(asString(value.stlUrl)),
    codeUrl: rewriteArtifactUrl(asString(value.codeUrl)),
    measurementsUrl: rewriteArtifactUrl(asString(value.measurementsUrl)),
    previewArtifactRef: asString(value.previewArtifactRef),
    cadArtifactRef: asString(value.cadArtifactRef),
    stlArtifactRef: asString(value.stlArtifactRef),
    codeArtifactRef: asString(value.codeArtifactRef),
  }
}

export const normalizeMacHelperHealth = (
  payload: unknown,
  helperUrl: string,
): MacHelperHealth => {
  if (!isRecord(payload)) {
    return {
      status: 'error',
      runtime: 'unknown',
      engine: 'mac-build123d',
      version: 'unknown',
      helperUrl,
      error: 'Invalid MAC helper health payload.',
    }
  }

  return {
    status: payload.status === 'ready' ? 'ready' : 'error',
    runtime: asString(payload.runtime) || 'unknown',
    engine: asString(payload.engine) || 'mac-build123d',
    version: asString(payload.version) || 'unknown',
    helperUrl: asString(payload.helperUrl) || helperUrl,
    macRootConfigured: Boolean(payload.macRootConfigured),
    macRoot: asString(payload.macRoot),
    pythonPath: asString(payload.pythonPath),
    openRouterConfigured: Boolean(payload.openRouterConfigured),
    model: asString(payload.model),
    error: asString(payload.error) || undefined,
  }
}

export const normalizeMacJobCreateResponse = (payload: unknown): MacHelperJobCreateResponse => {
  if (!isRecord(payload)) {
    return { jobId: '', status: 'failed' }
  }
  return {
    jobId: asString(payload.jobId) || '',
    status: asStatus(payload.status),
  }
}

export const normalizeMacJobResult = (payload: unknown): MacHelperJobResult => {
  if (!isRecord(payload)) {
    return {
      jobId: '',
      type: 'generate_part',
      status: 'failed',
      warnings: [],
      error: 'Invalid MAC job payload.',
    }
  }

  const result = isRecord(payload.result) ? payload.result : null

  return {
    jobId: asString(payload.jobId) || '',
    type: asString(payload.type) || 'generate_part',
    status: asStatus(payload.status),
    warnings: Array.isArray(payload.warnings)
      ? payload.warnings.filter((item): item is string => typeof item === 'string')
      : [],
    error: asString(payload.error) || undefined,
    result: result
      ? {
          prompt: asString(result.prompt) || undefined,
          mode: asString(result.mode) || undefined,
          qaSummary: asString(result.qaSummary),
          warnings: Array.isArray(result.warnings)
            ? result.warnings.filter((item): item is string => typeof item === 'string')
            : [],
          artifacts: normalizeArtifacts(result.artifacts),
          metadata: isRecord(result.metadata) ? result.metadata : {},
        }
      : undefined,
  }
}
