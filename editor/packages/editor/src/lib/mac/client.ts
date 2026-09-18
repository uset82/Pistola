import { pistolaApiUrl, pistolaRemoteInit } from '../api-base'
import {
  normalizeMacHelperHealth,
  normalizeMacJobCreateResponse,
  normalizeMacJobResult,
  type MacHelperHealth,
  type MacHelperJobCreateResponse,
  type MacHelperJobResult,
} from './contracts'

export type { MacHelperHealth, MacHelperJobCreateResponse, MacHelperJobResult }

const toRemoteArtifactUrl = (value: string | null | undefined) =>
  value?.startsWith('/api/mac/artifacts/') ? pistolaApiUrl(value) : value || null

const withRemoteArtifactUrls = (job: MacHelperJobResult): MacHelperJobResult => {
  if (!job.result?.artifacts) return job
  const artifacts = job.result.artifacts
  return {
    ...job,
    result: {
      ...job.result,
      artifacts: {
        ...artifacts,
        previewUrl: toRemoteArtifactUrl(artifacts.previewUrl),
        cadUrl: toRemoteArtifactUrl(artifacts.cadUrl),
        stlUrl: toRemoteArtifactUrl(artifacts.stlUrl),
        codeUrl: toRemoteArtifactUrl(artifacts.codeUrl),
        measurementsUrl: toRemoteArtifactUrl(artifacts.measurementsUrl),
        previewArtifactRef: toRemoteArtifactUrl(artifacts.previewArtifactRef),
        cadArtifactRef: toRemoteArtifactUrl(artifacts.cadArtifactRef),
      },
    },
  }
}

const readJson = async (response: Response): Promise<unknown> => {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `MAC request failed: ${response.status}`
    throw new Error(message)
  }
  return payload
}

export async function fetchMacHealth(): Promise<MacHelperHealth> {
  const response = await fetch(
    pistolaApiUrl('/api/mac/health'),
    pistolaRemoteInit({ cache: 'no-store' }),
  )
  const payload = await response.json().catch(() => null)
  return normalizeMacHelperHealth(payload, pistolaApiUrl('/api/mac'))
}

export async function createMacJob(input: {
  prompt: string
  mode?: 'part'
  sessionId?: string
}): Promise<MacHelperJobCreateResponse> {
  const response = await fetch(
    pistolaApiUrl('/api/mac/jobs'),
    pistolaRemoteInit({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt,
        mode: input.mode ?? 'part',
        sessionId: input.sessionId,
      }),
    }),
  )
  return normalizeMacJobCreateResponse(await readJson(response))
}

export async function fetchMacJob(jobId: string): Promise<MacHelperJobResult> {
  const response = await fetch(
    pistolaApiUrl(`/api/mac/jobs/${encodeURIComponent(jobId)}`),
    pistolaRemoteInit({ cache: 'no-store' }),
  )
  return withRemoteArtifactUrls(normalizeMacJobResult(await readJson(response)))
}

export async function waitForMacJob(
  jobId: string,
  options?: { timeoutMs?: number; pollMs?: number; onStatus?: (status: string) => void },
): Promise<MacHelperJobResult> {
  const timeoutMs = options?.timeoutMs ?? 1_800_000
  const pollMs = options?.pollMs ?? 2_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const job = await fetchMacJob(jobId)
    options?.onStatus?.(job.status)
    if (job.status === 'succeeded' || job.status === 'failed') {
      return job
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  throw new Error('MAC helper timed out while waiting for a job result.')
}
