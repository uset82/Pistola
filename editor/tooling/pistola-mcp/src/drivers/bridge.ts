import { spawn } from 'node:child_process'
import { resolveTarget } from '../targets.ts'
import type { PageDriver } from './types.ts'

export const baseUrl = () => new URL(process.env.PISTOLA_BASE_URL ?? 'http://127.0.0.1:3002').origin

export const headers = () => {
  const token = process.env.PISTOLA_LOCAL_API_TOKEN
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const commandTimeoutMs = () => Number(process.env.PISTOLA_BRIDGE_TIMEOUT_MS ?? 120_000)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type SessionSummary = { sessionId: string; streamConnected?: boolean; visible?: boolean | null }
type SessionPayload = { connected?: boolean; session?: SessionSummary; sessions?: SessionSummary[]; message?: string }

const requestJson = async (path: string, init: RequestInit = {}) => {
  let response: Response
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { ...headers(), ...(init.headers ?? {}) },
    })
  } catch {
    throw new Error(`The Pistola editor at ${baseUrl()} is not running. Start it with "bun run dev:editor" in the editor/ folder.`)
  }
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

const readSession = async (sessionId?: string) =>
  (await requestJson(
    sessionId ? `/api/workspace/session?sessionId=${encodeURIComponent(sessionId)}` : '/api/workspace/session',
  )) as SessionPayload

const openInBrowser = (url: string) => {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  spawn(command as string, args as string[], { detached: true, stdio: 'ignore' }).unref()
}

const waitForTab = async (timeoutMs: number) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const status = await readSession()
    if (status.connected) return status
    await sleep(1000)
  }
  return null
}

const waitForResult = async (sessionId: string, commandId: string) => {
  const started = Date.now()
  let polls = 0
  let disconnectedChecks = 0
  while (Date.now() - started < commandTimeoutMs()) {
    const payload = await requestJson(
      `/api/workspace/command?sessionId=${encodeURIComponent(sessionId)}&commandId=${encodeURIComponent(commandId)}&consume=1`,
    )
    if (payload.pending !== true) return payload.result ?? payload
    polls += 1
    if (polls % 20 === 0) {
      const status = await readSession(sessionId)
      const live = status.sessions?.find((item) => item.sessionId === sessionId)?.streamConnected
      disconnectedChecks = live === false ? disconnectedChecks + 1 : 0
      if (disconnectedChecks >= 2) {
        throw new Error('The Pistola tab closed or lost its connection while running this command. Reopen the workspace tab and retry.')
      }
    }
    await sleep(250)
  }
  throw new Error(
    `Timed out after ${commandTimeoutMs()} ms waiting for workspace command ${commandId}. If the tab reloaded, the command may not have run.`,
  )
}

const enqueue = async (body: Record<string, unknown>) => {
  const pinned = process.env.PISTOLA_SESSION_ID
  const enqueued = await requestJson('/api/workspace/command', {
    method: 'POST',
    body: JSON.stringify(pinned ? { ...body, sessionId: pinned } : body),
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

  const invoke = async (method: string, args?: unknown) => {
    const result = await enqueue({ type: 'api', method, args })
    const record = result as { ok?: boolean; errors?: string[]; data?: { apiVersion?: number }; output?: { apiVersion?: number } }
    if (record.ok === false) throw new Error(record.errors?.[0] ?? `Pistola could not run ${method}.`)
    const version = record.data?.apiVersion ?? record.output?.apiVersion
    if (typeof version === 'number') apiVersion = version
    return result
  }

  return {
    kind: 'bridge',
    target: { name: target.name, url: baseUrl() },
    get apiVersion() {
      return apiVersion
    },
    forbiddenCount: () => 0,
    forbiddenHits: () => [],
    open: async (options = {}) => {
      let status = await readSession()
      if (!status.connected && options.launch && process.env.PISTOLA_OPEN_BROWSER !== '0') {
        openInBrowser(`${baseUrl()}/workspace`)
        status = (await waitForTab(45_000)) ?? status
      }
      if (!status.connected) {
        throw new Error(`No Pistola tab is open. Open ${baseUrl()}/workspace in your browser, then retry.`)
      }
      const manual = (await invoke('manual').catch(() => null)) as { output?: { apiVersion?: number } } | null
      return {
        url: `${baseUrl()}/workspace`,
        apiVersion: manual?.output?.apiVersion ?? apiVersion ?? 0,
        signInRequired: false,
        tab: status.session,
        sessions: status.sessions,
      }
    },
    invoke,
    screenshot: async () => {
      const result = (await invoke('render', { width: 768, height: 768 })) as {
        output?: { mime?: string; dataUrl?: string }
        dataUrl?: string
        mime?: string
      }
      const dataUrl = result.output?.dataUrl ?? result.dataUrl ?? ''
      const comma = dataUrl.indexOf(',')
      if (comma < 0) throw new Error('The Pistola tab returned no image.')
      return { mime: result.output?.mime ?? result.mime ?? 'image/png', data: dataUrl.slice(comma + 1) }
    },
  }
}
