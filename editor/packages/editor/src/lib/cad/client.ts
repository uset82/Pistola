import type {
  CadBodyNode,
  CadBodyOperation,
  CadSketchNode,
} from '@pascal-app/core'
import {
  DEFAULT_CAD_HELPER_URL,
  normalizeCadHelperHealth,
  normalizeCadJobCreateResponse,
  normalizeCadJobResult,
  type CadHelperHealth,
  type CadHelperJobCreateResponse,
  type CadHelperJobRequest,
  type CadHelperJobResult,
  type CadJobType,
} from './contracts'

export type { CadHelperHealth, CadHelperJobCreateResponse, CadHelperJobRequest, CadHelperJobResult, CadJobType }

const getApiBase = () => process.env.NEXT_PUBLIC_PISTOLA_API_BASE?.trim().replace(/\/+$/, '') || ''

const toApiUrl = (pathname: string) => `${getApiBase()}${pathname}`

const remoteRequestInit = (init: RequestInit = {}): RequestInit =>
  getApiBase()
    ? {
        ...init,
        // Canner owns the session; the static Sites app never receives a token.
        credentials: 'include',
      }
    : init

const toRemoteArtifactUrl = (value: string | null | undefined) =>
  value?.startsWith('/api/cad/artifacts/') ? toApiUrl(value) : value || null

const withRemoteArtifactUrls = (job: CadHelperJobResult): CadHelperJobResult => {
  if (!getApiBase() || !job.result) return job

  const artifacts = job.result.artifacts
  return {
    ...job,
    result: {
      ...job.result,
      artifacts: {
        ...artifacts,
        previewUrl: toRemoteArtifactUrl(artifacts.previewUrl),
        cadUrl: toRemoteArtifactUrl(artifacts.cadUrl),
        exportUrl: toRemoteArtifactUrl(artifacts.exportUrl),
        previewArtifactRef: toRemoteArtifactUrl(artifacts.previewArtifactRef),
        cadArtifactRef: toRemoteArtifactUrl(artifacts.cadArtifactRef),
      },
    },
  }
}

async function parseJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
      if (payload?.error) {
        throw new Error(payload.error)
      }
    }

    const message = await response.text()
    throw new Error(message || `CAD helper request failed: ${response.status}`)
  }

  return response.json()
}

export async function fetchCadHelperHealth(): Promise<CadHelperHealth> {
  const response = await fetch(toApiUrl('/api/cad/health'), remoteRequestInit({
    cache: 'no-store',
  }))

  return normalizeCadHelperHealth(await parseJson(response), DEFAULT_CAD_HELPER_URL)
}

export async function createCadJob(
  request: CadHelperJobRequest,
): Promise<CadHelperJobCreateResponse> {
  const response = await fetch(toApiUrl('/api/cad/jobs'), remoteRequestInit({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  }))

  return normalizeCadJobCreateResponse(await parseJson(response))
}

export async function uploadImportStepFile(file: File): Promise<CadHelperJobCreateResponse> {
  const formData = new FormData()
  formData.append('type', 'import_step')
  formData.append('file', file, file.name)

  const response = await fetch(toApiUrl('/api/cad/jobs'), remoteRequestInit({
    method: 'POST',
    body: formData,
  }))

  return normalizeCadJobCreateResponse(await parseJson(response))
}

export async function fetchCadJob(jobId: string): Promise<CadHelperJobResult> {
  const response = await fetch(toApiUrl(`/api/cad/jobs/${jobId}`), remoteRequestInit({
    cache: 'no-store',
  }))

  return withRemoteArtifactUrls(normalizeCadJobResult(await parseJson(response)))
}
