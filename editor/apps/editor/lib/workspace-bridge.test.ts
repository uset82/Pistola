import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enqueueWorkspaceCommand,
  getActiveWorkspaceSession,
  getWorkspaceCommandResult,
  getWorkspaceSession,
  listWorkspaceSessions,
  registerWorkspaceSession,
  reportWorkspaceCommandResult,
  subscribeWorkspaceSession,
  takePendingWorkspaceCommands,
  touchWorkspaceSession,
} from './workspace-bridge'

test('the active session prefers a connected, visible, recently focused tab', () => {
  const local = { ownerUserId: 'local-mcp', isLocalOperator: true }
  globalThis.__pistolaWorkspaceBridge = undefined
  try {
    const hiddenTab = registerWorkspaceSession(local, { visible: false, focusedAt: 50 })
    const staleTab = registerWorkspaceSession(local, { visible: true, focusedAt: 100 })
    const liveTab = registerWorkspaceSession(local, { visible: true, focusedAt: 10 })
    const unsubscribeLive = subscribeWorkspaceSession(local, liveTab.sessionId, () => undefined)
    const unsubscribeHidden = subscribeWorkspaceSession(local, hiddenTab.sessionId, () => undefined)

    assert.equal(getActiveWorkspaceSession(local)?.sessionId, liveTab.sessionId)
    assert.equal(
      listWorkspaceSessions(local).find((session) => session.sessionId === staleTab.sessionId)?.streamConnected,
      false,
    )

    touchWorkspaceSession(local, hiddenTab.sessionId, { visible: true, focusedAt: 500 })
    assert.equal(getActiveWorkspaceSession(local)?.sessionId, hiddenTab.sessionId)
    unsubscribeLive()
    unsubscribeHidden()
  } finally {
    globalThis.__pistolaWorkspaceBridge = undefined
  }
})

test('consumed results are removed and streamed results omit large payloads', () => {
  const local = { ownerUserId: 'local-mcp', isLocalOperator: true }
  globalThis.__pistolaWorkspaceBridge = undefined
  try {
    const tab = registerWorkspaceSession(local, {})
    const streamed: unknown[] = []
    const unsubscribe = subscribeWorkspaceSession(local, tab.sessionId, (event) => {
      if (event.type === 'result') streamed.push(event.result)
    })
    reportWorkspaceCommandResult(local, tab.sessionId, { commandId: 'c1', ok: true, output: { dataUrl: 'data:image/png;base64,AAAA' } })

    assert.equal((streamed[0] as { output?: unknown }).output, undefined)
    assert.deepEqual(getWorkspaceCommandResult(local, tab.sessionId, 'c1')?.output, { dataUrl: 'data:image/png;base64,AAAA' })
    assert.ok(getWorkspaceCommandResult(local, tab.sessionId, 'c1', { consume: true }))
    assert.equal(getWorkspaceCommandResult(local, tab.sessionId, 'c1'), null)
    unsubscribe()
  } finally {
    globalThis.__pistolaWorkspaceBridge = undefined
  }
})

test('workspace sessions stay isolated by owner while local operators retain local access', () => {
  const ownerA = { ownerUserId: 'user-a' }
  const ownerB = { ownerUserId: 'user-b' }
  const localOperator = { ownerUserId: 'local-mcp', isLocalOperator: true }

  globalThis.__pistolaWorkspaceBridge = undefined
  try {
    const sessionA = registerWorkspaceSession(ownerA, { phase: 'cad' })
    registerWorkspaceSession(ownerB, { phase: 'site' })

    assert.equal(getActiveWorkspaceSession(ownerA)?.sessionId, sessionA.sessionId)
    assert.equal(getWorkspaceSession(ownerB, sessionA.sessionId), null)
    assert.equal(touchWorkspaceSession(ownerB, sessionA.sessionId, { phase: 'site' }), null)
    assert.throws(
      () =>
        enqueueWorkspaceCommand(ownerB, {
          sessionId: sessionA.sessionId,
          type: 'actions',
          actions: [],
        }),
      /Workspace session .* not found/,
    )

    const recoveredSessionB = registerWorkspaceSession(ownerB, { sessionId: sessionA.sessionId })
    assert.notEqual(recoveredSessionB.sessionId, sessionA.sessionId)
    assert.equal(getWorkspaceSession(ownerB, recoveredSessionB.sessionId)?.sessionId, recoveredSessionB.sessionId)

    const enqueued = enqueueWorkspaceCommand(ownerA, {
      sessionId: sessionA.sessionId,
      type: 'actions',
      actions: [],
    })
    assert.equal(enqueued.sessionId, sessionA.sessionId)
    assert.equal(takePendingWorkspaceCommands(ownerA, sessionA.sessionId).length, 1)
    assert.equal(getWorkspaceSession(localOperator, sessionA.sessionId)?.sessionId, sessionA.sessionId)
  } finally {
    globalThis.__pistolaWorkspaceBridge = undefined
  }
})
