'use client'

import { useEffect, useRef } from 'react'
import { type CadBrief, useScene } from '@pascal-app/core'
import {
  createAssistantRuntime,
  executeAssistantPlan,
  getAssistantWorkspaceContext,
  useCad,
  useEditor,
  type AssistantAction,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { executeCadBrief } from '../../lib/cad-brief-executor'
import { generateMacPart } from '../../lib/mac-part-executor'
import { pistolaEventSource, pistolaFetch } from '../../lib/pistola-fetch'
import type { WorkspaceCommand } from '../../lib/workspace-bridge'

const SESSION_STORAGE_KEY = 'pistola-workspace-session-id'

const getOrCreateSessionId = () => {
  if (typeof window === 'undefined') return crypto.randomUUID()
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next)
  return next
}

const getCadParentId = () => {
  const { nodes, rootNodeIds } = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (levelId && nodes[levelId as keyof typeof nodes]) return levelId
  return rootNodeIds.find((rootId) => nodes[rootId as keyof typeof nodes]?.type === 'site') ?? null
}

const getRootSiteId = () => {
  const { nodes, rootNodeIds } = useScene.getState()
  return rootNodeIds.find((rootId) => nodes[rootId as keyof typeof nodes]?.type === 'site') ?? null
}

async function reportResult(
  sessionId: string,
  commandId: string,
  payload: Record<string, unknown>,
) {
  await pistolaFetch('/api/workspace/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, commandId, ...payload }),
  })
}

export function WorkspaceBridge() {
  const sessionIdRef = useRef<string>(getOrCreateSessionId())
  const phase = useEditor((state) => state.phase)
  const mode = useEditor((state) => state.mode)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodeCount = useScene((state) => Object.keys(state.nodes).length)
  const helperStatus = useCad((state) => state.helperStatus)

  useEffect(() => {
    let sessionId = sessionIdRef.current
    let closed = false
    let eventSource: EventSource | null = null

    const buildSnapshot = () => {
      const context = getAssistantWorkspaceContext()
      return {
        sessionId,
        phase,
        mode,
        selectedIds,
        nodeCount,
        levelId: useViewer.getState().selection.levelId,
        siteId: getRootSiteId(),
        cadHelperStatus: helperStatus,
        summary: `phase=${phase}; nodes=${nodeCount}; selected=${selectedIds.length}`,
        installedModel: null,
      }
    }

    const register = async () => {
      const response = await pistolaFetch('/api/workspace/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSnapshot()),
      })
      if (!response.ok) {
        throw new Error('Unable to register the live workspace session.')
      }

      const payload = (await response.json()) as { session?: { sessionId?: string } }
      const registeredSessionId = payload.session?.sessionId
      if (registeredSessionId && registeredSessionId !== sessionId) {
        sessionId = registeredSessionId
        sessionIdRef.current = registeredSessionId
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, registeredSessionId)
      }
    }

    const executeCadBriefAction = async (brief: CadBrief) => {
      const parentId = getCadParentId()
      if (!parentId) {
        throw new Error('Select a site or level before creating CAD geometry.')
      }
      return executeCadBrief(brief, parentId)
    }

    const generateMacPartAction = async (prompt: string) => {
      const result = await generateMacPart(prompt)
      return { bodyIds: result.bodyIds, jobId: result.jobId }
    }

    const handleCommand = async (command: WorkspaceCommand) => {
      try {
        if (command.type === 'generate_mac') {
          const result = await generateMacPart(command.prompt)
          await reportResult(sessionId, command.id, {
            ok: true,
            bodyIds: result.bodyIds,
            message: `MAC part imported (${result.jobId}).`,
          })
          return
        }

        if (command.type === 'actions') {
          const result = await executeAssistantPlan(command.actions as AssistantAction[], {
            reviewConfirmed: true,
            runtime: {
              ...createAssistantRuntime(),
              executeCadBrief: executeCadBriefAction,
              generateMacPart: generateMacPartAction,
            },
          })
          await reportResult(sessionId, command.id, {
            ok: result.ok,
            errors: result.errors,
            bodyIds: result.bodyIds,
            sketchIds: result.sketchIds,
            createdNodeIds: result.createdNodeIds,
            message: result.ok ? 'Workspace actions executed.' : result.errors[0],
          })
          return
        }

        if (command.type === 'read') {
          const { executeAgentTool } = await import('@pascal-app/editor')
          const data = await executeAgentTool(command.tool, command.arguments)
          await reportResult(sessionId, command.id, {
            ok: true,
            data,
            output: data,
            message: `Tool ${command.tool} executed successfully.`,
          })
          return
        }

        if (command.type === 'agent') {
          const { runAgentTurn } = await import('../../lib/assistant-agent/run-agent-turn')
          const result = await runAgentTurn({
            prompt: command.prompt,
            chatMode: command.chatMode,
            workspaceContext: getAssistantWorkspaceContext(),
            reviewConfirmed: true,
          })
          await reportResult(sessionId, command.id, {
            ok: true,
            turn: result.turn,
            roundsCompleted: result.roundsCompleted,
            totalActionsExecuted: result.totalActionsExecuted,
            timeline: result.timeline,
            output: {
              turn: result.turn,
              timeline: result.timeline,
              roundsCompleted: result.roundsCompleted,
              totalActionsExecuted: result.totalActionsExecuted,
            },
            message: result.turn.reply,
          })
          return
        }

        // Prompt: plan via assistant API then execute.
        const planResponse = await pistolaFetch('/api/assistant/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: command.prompt,
            chatMode: command.chatMode || 'create',
            context: getAssistantWorkspaceContext(),
          }),
        })
        const planPayload = await planResponse.json()
        if (!planResponse.ok) {
          throw new Error(
            typeof planPayload.error === 'string'
              ? planPayload.error
              : 'Assistant planning failed.',
          )
        }

        const actions = Array.isArray(planPayload.actions) ? planPayload.actions : []
        if (actions.length === 0) {
          await reportResult(sessionId, command.id, {
            ok: true,
            message: planPayload.reply || 'No executable actions returned.',
          })
          return
        }

        const result = await executeAssistantPlan(actions as AssistantAction[], {
          reviewConfirmed: true,
          runtime: {
            executeCadBrief: executeCadBriefAction,
            generateMacPart: generateMacPartAction,
          },
        })
        await reportResult(sessionId, command.id, {
          ok: result.ok,
          errors: result.errors,
          bodyIds: result.bodyIds,
          sketchIds: result.sketchIds,
          createdNodeIds: result.createdNodeIds,
          message: result.ok
            ? planPayload.reply || 'Prompt executed.'
            : result.errors[0],
        })
      } catch (error) {
        await reportResult(sessionId, command.id, {
          ok: false,
          errors: [error instanceof Error ? error.message : 'Workspace command failed.'],
        })
      }
    }

    const connectEvents = () => {
      eventSource = pistolaEventSource(
        `/api/workspace/events?sessionId=${encodeURIComponent(sessionId)}`,
      )
      eventSource.addEventListener('command', (event) => {
        try {
          const command = JSON.parse((event as MessageEvent).data) as WorkspaceCommand
          void handleCommand(command)
        } catch {
          // ignore malformed events
        }
      })
      eventSource.onerror = () => {
        eventSource?.close()
        if (!closed) {
          window.setTimeout(() => {
            if (!closed) connectEvents()
          }, 2000)
        }
      }
    }

    void register()
      .then(() => {
        if (!closed) connectEvents()
      })
      .catch(() => {
        // Static Sites has no local API. The editor still renders.
      })

    const heartbeat = window.setInterval(() => {
      void pistolaFetch('/api/workspace/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSnapshot()),
      })
    }, 10_000)

    return () => {
      closed = true
      window.clearInterval(heartbeat)
      eventSource?.close()
    }
  }, [phase, mode, selectedIds, nodeCount, helperStatus])

  return null
}
