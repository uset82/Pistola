import assert from 'node:assert/strict'
import test from 'node:test'

import {
  enqueueWorkspaceCommand,
  getActiveWorkspaceSession,
  getWorkspaceSession,
  registerWorkspaceSession,
  takePendingWorkspaceCommands,
  touchWorkspaceSession,
} from './workspace-bridge'

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
