import { resolveTarget } from '../targets.ts'
import type { PageDriver } from './types.ts'

const baseUrl = () => (process.env.PISTOLA_BASE_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '')

const headers = () => {
  const token = process.env.PISTOLA_LOCAL_API_TOKEN
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const requestJson = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof (payload as { error?: string }).error === 'string'
        ? (payload as { error: string }).error
        : `Workspace bridge ${path} failed (${response.status}).`,
    )
  }
  return payload as Record<string, unknown>
}

const waitForResult = async (sessionId: string, commandId: string, timeoutMs = 60_000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const payload = await requestJson(
      `/api/workspace/command?sessionId=${encodeURIComponent(sessionId)}&commandId=${encodeURIComponent(commandId)}`,
    )
    if (payload.pending !== true) return payload.result ?? payload
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for workspace command ${commandId}.`)
}

const enqueue = async (body: Record<string, unknown>) => {
  const enqueued = await requestJson('/api/workspace/command', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const sessionId = String(enqueued.sessionId ?? '')
  const commandId = String((enqueued.command as { id?: string } | undefined)?.id ?? '')
  if (!sessionId || !commandId) {
    throw new Error('Workspace bridge did not return a command id.')
  }
  return waitForResult(sessionId, commandId)
}

export const createBridgeDriver = async (): Promise<PageDriver> => {
  const target = resolveTarget(process.env.PISTOLA_TARGET ?? 'local')
  let apiVersion: number | null = null

  return {
    kind: 'bridge',
    target: { name: target.name, url: baseUrl() },
    get apiVersion() {
      return apiVersion
    },
    forbiddenCount: () => 0,
    forbiddenHits: () => [],
    open: async () => {
      const status = await requestJson('/api/workspace/session')
      return { url: baseUrl(), apiVersion: apiVersion ?? 0, signInRequired: false, status }
    },
    invoke: async (method, args) => {
      const result = await enqueue({ type: 'api', method, args })
      const record = result as { data?: { apiVersion?: number }; output?: { apiVersion?: number } }
      const version = record.data?.apiVersion ?? record.output?.apiVersion
      if (typeof version === 'number') apiVersion = version
      return result
    },
    screenshot: async () => {
      throw new Error('Bridge transport cannot capture a viewport screenshot. Use PISTOLA_TRANSPORT=browser.')
    },
  }
}
