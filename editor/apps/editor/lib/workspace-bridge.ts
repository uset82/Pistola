import { randomUUID } from 'node:crypto'

export type WorkspaceCommand =
  | {
      id: string
      type: 'actions'
      actions: unknown[]
      confirmDestructive?: boolean
      createdAt: number
    }
  | {
      id: string
      type: 'api'
      method: string
      args?: unknown
      createdAt: number
    }
  | {
      id: string
      type: 'assistant_prompt'
      prompt: string
      chatMode?: string
      createdAt: number
    }
  | {
      id: string
      type: 'generate_mac'
      prompt: string
      createdAt: number
    }
  | {
      id: string
      type: 'read'
      tool: string
      arguments: Record<string, unknown>
      createdAt: number
    }
  | {
      id: string
      type: 'agent'
      prompt: string
      chatMode?: string
      createdAt: number
    }

export type WorkspaceCommandInput =
  | {
      type: 'actions'
      actions: unknown[]
      confirmDestructive?: boolean
    }
  | {
      type: 'api'
      method: string
      args?: unknown
    }
  | {
      type: 'assistant_prompt'
      prompt: string
      chatMode?: string
    }
  | {
      type: 'generate_mac'
      prompt: string
    }
  | {
      type: 'read'
      tool: string
      arguments: Record<string, unknown>
    }
  | {
      type: 'agent'
      prompt: string
      chatMode?: string
    }

export type WorkspaceCommandResult = {
  commandId: string
  ok: boolean
  errors?: string[]
  bodyIds?: string[]
  sketchIds?: string[]
  createdNodeIds?: string[]
  output?: unknown
  turn?: unknown
  timeline?: unknown
  message?: string
  completedAt: number
}

export type WorkspaceSnapshot = {
  sessionId: string
  connectedAt: number
  lastSeenAt: number
  phase?: string | null
  mode?: string | null
  selectedIds?: string[]
  nodeCount?: number
  levelId?: string | null
  siteId?: string | null
  cadHelperStatus?: string | null
  macHelperStatus?: string | null
  installedModel?: {
    provider?: string | null
    model?: string | null
  } | null
  summary?: string | null
  visible?: boolean | null
  focusedAt?: number | null
}

export type WorkspaceSessionAccess = {
  ownerUserId: string
  isLocalOperator?: boolean
}

type WorkspaceSession = {
  ownerUserId: string
  snapshot: WorkspaceSnapshot
  pendingCommands: WorkspaceCommand[]
  results: WorkspaceCommandResult[]
  listeners: Set<(event: WorkspaceBridgeEvent) => void>
}

export type WorkspaceBridgeEvent =
  | { type: 'session'; snapshot: WorkspaceSnapshot }
  | { type: 'command'; command: WorkspaceCommand }
  | { type: 'result'; result: WorkspaceCommandResult }
  | { type: 'heartbeat'; at: number }

declare global {
  // eslint-disable-next-line no-var
  var __pistolaWorkspaceBridge: Map<string, WorkspaceSession> | undefined
}

const getStore = () => {
  if (!globalThis.__pistolaWorkspaceBridge) {
    globalThis.__pistolaWorkspaceBridge = new Map()
  }
  return globalThis.__pistolaWorkspaceBridge
}

const SESSION_TTL_MS = 30 * 60_000

const canAccessWorkspaceSession = (
  session: WorkspaceSession,
  access: WorkspaceSessionAccess,
) => session.ownerUserId === access.ownerUserId || access.isLocalOperator === true

const pruneExpired = () => {
  const store = getStore()
  const now = Date.now()
  for (const [sessionId, session] of store.entries()) {
    if (now - session.snapshot.lastSeenAt > SESSION_TTL_MS) {
      store.delete(sessionId)
    }
  }
}

export const registerWorkspaceSession = (
  access: WorkspaceSessionAccess,
  input: Partial<WorkspaceSnapshot> & { sessionId?: string } = {},
): WorkspaceSnapshot => {
  pruneExpired()
  const store = getStore()
  const requestedSessionId = input.sessionId
  const requestedSession = requestedSessionId ? store.get(requestedSessionId) : null
  const sessionId =
    requestedSession && !canAccessWorkspaceSession(requestedSession, access)
      ? randomUUID()
      : requestedSessionId || randomUUID()
  const now = Date.now()
  const existing = store.get(sessionId)
  const snapshot: WorkspaceSnapshot = {
    sessionId,
    connectedAt: existing?.snapshot.connectedAt || now,
    lastSeenAt: now,
    phase: input.phase ?? existing?.snapshot.phase ?? null,
    mode: input.mode ?? existing?.snapshot.mode ?? null,
    selectedIds: input.selectedIds ?? existing?.snapshot.selectedIds ?? [],
    nodeCount: input.nodeCount ?? existing?.snapshot.nodeCount ?? 0,
    levelId: input.levelId ?? existing?.snapshot.levelId ?? null,
    siteId: input.siteId ?? existing?.snapshot.siteId ?? null,
    cadHelperStatus: input.cadHelperStatus ?? existing?.snapshot.cadHelperStatus ?? null,
    macHelperStatus: input.macHelperStatus ?? existing?.snapshot.macHelperStatus ?? null,
    installedModel: input.installedModel ?? existing?.snapshot.installedModel ?? null,
    summary: input.summary ?? existing?.snapshot.summary ?? null,
    visible: input.visible ?? existing?.snapshot.visible ?? null,
    focusedAt: input.focusedAt ?? existing?.snapshot.focusedAt ?? null,
  }

  if (existing) {
    existing.snapshot = snapshot
  } else {
    store.set(sessionId, {
      ownerUserId: access.ownerUserId,
      snapshot,
      pendingCommands: [],
      results: [],
      listeners: new Set(),
    })
  }

  const session = store.get(sessionId)!
  emit(session, { type: 'session', snapshot })
  return snapshot
}

export const touchWorkspaceSession = (
  access: WorkspaceSessionAccess,
  sessionId: string,
  patch: Partial<WorkspaceSnapshot> = {},
) => {
  const store = getStore()
  const session = store.get(sessionId)
  if (!session || !canAccessWorkspaceSession(session, access)) return null
  session.snapshot = {
    ...session.snapshot,
    ...patch,
    sessionId,
    lastSeenAt: Date.now(),
  }
  emit(session, { type: 'session', snapshot: session.snapshot })
  return session.snapshot
}

// A tab with a live event stream beats a stale one; then a visible tab; then the most recently focused.
const sessionRank = (session: WorkspaceSession) => [
  session.listeners.size > 0 ? 1 : 0,
  session.snapshot.visible === false ? 0 : 1,
  session.snapshot.focusedAt ?? 0,
  session.snapshot.lastSeenAt,
]

const outranks = (left: WorkspaceSession, right: WorkspaceSession) => {
  const a = sessionRank(left)
  const b = sessionRank(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) > (b[index] ?? 0)
  }
  return false
}

export const getActiveWorkspaceSession = (
  access: WorkspaceSessionAccess,
): WorkspaceSnapshot | null => {
  pruneExpired()
  const store = getStore()
  let best: WorkspaceSession | null = null
  for (const session of store.values()) {
    if (!canAccessWorkspaceSession(session, access)) continue
    if (!best || outranks(session, best)) best = session
  }
  return best?.snapshot ?? null
}

export const listWorkspaceSessions = (access: WorkspaceSessionAccess) => {
  pruneExpired()
  return [...getStore().values()]
    .filter((session) => canAccessWorkspaceSession(session, access))
    .map((session) => ({ ...session.snapshot, streamConnected: session.listeners.size > 0 }))
}

export const getWorkspaceSession = (access: WorkspaceSessionAccess, sessionId: string) => {
  pruneExpired()
  const session = getStore().get(sessionId)
  return session && canAccessWorkspaceSession(session, access) ? session.snapshot : null
}

export const WORKSPACE_COMMAND_TYPES = [
  'actions',
  'api',
  'assistant_prompt',
  'generate_mac',
  'read',
  'agent',
] as const

export const assertWorkspaceCommandType = (type: string) => {
  if (!WORKSPACE_COMMAND_TYPES.includes(type as (typeof WORKSPACE_COMMAND_TYPES)[number])) {
    throw new Error(`Unknown workspace command type "${type}".`)
  }
}

export const enqueueWorkspaceCommand = (
  access: WorkspaceSessionAccess,
  command: WorkspaceCommandInput & { sessionId?: string },
): { sessionId: string; command: WorkspaceCommand } => {
  pruneExpired()
  const store = getStore()
  const sessionId = command.sessionId || getActiveWorkspaceSession(access)?.sessionId
  if (!sessionId) {
    throw new Error(
      'No live editor workspace session is registered. Open the Pistola editor tab, then retry.',
    )
  }
  const session = store.get(sessionId)
  if (!session || !canAccessWorkspaceSession(session, access)) {
    throw new Error(`Workspace session ${sessionId} was not found.`)
  }

  const { sessionId: _ignored, ...rest } = command as typeof command & { sessionId?: string }
  assertWorkspaceCommandType(rest.type)
  const fullCommand = {
    ...rest,
    id: randomUUID(),
    createdAt: Date.now(),
  } as WorkspaceCommand

  session.pendingCommands.push(fullCommand)
  session.snapshot.lastSeenAt = Date.now()
  emit(session, { type: 'command', command: fullCommand })
  // If any SSE listener is attached, drop from pending so reconnect flushes don't double-run.
  if (session.listeners.size > 0) {
    session.pendingCommands = session.pendingCommands.filter((item) => item.id !== fullCommand.id)
  }
  return { sessionId, command: fullCommand }
}

export const takePendingWorkspaceCommands = (
  access: WorkspaceSessionAccess,
  sessionId: string,
): WorkspaceCommand[] => {
  const session = getStore().get(sessionId)
  if (!session || !canAccessWorkspaceSession(session, access)) return []
  const commands = [...session.pendingCommands]
  session.pendingCommands = []
  session.snapshot.lastSeenAt = Date.now()
  return commands
}

export const reportWorkspaceCommandResult = (
  access: WorkspaceSessionAccess,
  sessionId: string,
  result: Omit<WorkspaceCommandResult, 'completedAt'> & { completedAt?: number },
) => {
  const session = getStore().get(sessionId)
  if (!session || !canAccessWorkspaceSession(session, access)) {
    throw new Error(`Workspace session ${sessionId} was not found.`)
  }
  const fullResult: WorkspaceCommandResult = {
    ...result,
    completedAt: result.completedAt || Date.now(),
  }
  session.results = [...session.results.slice(-40), fullResult]
  session.snapshot.lastSeenAt = Date.now()
  // Results can carry large payloads such as rendered images; the stream only needs the outcome.
  const { output: _output, turn: _turn, timeline: _timeline, ...summary } = fullResult
  emit(session, { type: 'result', result: summary })
  return fullResult
}

export const getWorkspaceCommandResult = (
  access: WorkspaceSessionAccess,
  sessionId: string,
  commandId: string,
  options: { consume?: boolean } = {},
) => {
  const session = getStore().get(sessionId)
  if (!session || !canAccessWorkspaceSession(session, access)) return null
  const result = session.results.find((item) => item.commandId === commandId) || null
  if (result && options.consume) {
    session.results = session.results.filter((item) => item.commandId !== commandId)
  }
  return result
}

export const subscribeWorkspaceSession = (
  access: WorkspaceSessionAccess,
  sessionId: string,
  listener: (event: WorkspaceBridgeEvent) => void,
) => {
  const session = getStore().get(sessionId)
  if (!session || !canAccessWorkspaceSession(session, access)) {
    throw new Error(`Workspace session ${sessionId} was not found.`)
  }
  session.listeners.add(listener)
  return () => {
    session.listeners.delete(listener)
  }
}

const emit = (session: WorkspaceSession, event: WorkspaceBridgeEvent) => {
  for (const listener of session.listeners) {
    try {
      listener(event)
    } catch {
      // Ignore listener failures.
    }
  }
}
