import type {
  MacHelperHealth,
  MacHelperJobCreateResponse,
  MacHelperJobResult,
} from '@/lib/mac-contracts'
import { normalizeMacHelperHealth, normalizeMacJobResult } from '@/lib/mac-contracts'

const MAC_API_BASE = '/api/mac'

export async function fetchMacHealth(): Promise<MacHelperHealth> {
  const response = await fetch(`${MAC_API_BASE}/health`, { cache: 'no-store' })
  const payload = await response.json()
  return normalizeMacHelperHealth(payload, MAC_API_BASE)
}

export async function createMacJob(input: {
  prompt: string
  mode?: 'part'
  sessionId?: string
}): Promise<MacHelperJobCreateResponse> {
  const response = await fetch(`${MAC_API_BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      mode: input.mode ?? 'part',
      sessionId: input.sessionId,
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : 'Unable to create MAC job.',
    )
  }
  return {
    jobId: String(payload.jobId || ''),
    status: payload.status || 'pending',
  }
}

export async function fetchMacJob(jobId: string): Promise<MacHelperJobResult> {
  const response = await fetch(`${MAC_API_BASE}/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : 'Unable to fetch MAC job.',
    )
  }
  return normalizeMacJobResult(payload)
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
