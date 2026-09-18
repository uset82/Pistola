'use client'

import { useScene } from '@pascal-app/core'
import { executeAgentTool } from '../../../../packages/editor/src/lib/assistant/agent-tools'
import { applySceneGraphToEditor, type SceneGraph } from '../../../../packages/editor/src/lib/scene'
import type {
  AssistantAction,
  AssistantTurnResult,
} from '../../../../packages/editor/src/lib/assistant/types'
import type {
  AgentMessage,
  AgentStepBudget,
  AgentStepRequest,
  AgentStepResponse,
  AgentToolCall,
  AgentToolResult,
} from './types'

export type AgentStepTimelineEvent = {
  round: number
  toolName: string
  arguments: Record<string, unknown>
  observation?: string
  status: 'running' | 'completed' | 'failed'
  actionsExecuted?: AssistantAction[]
}

export type RunAgentTurnOptions = {
  prompt: string
  chatMode?: string
  image?: any
  workspaceContext?: Record<string, unknown>
  budgets?: Partial<AgentStepBudget>
  signal?: AbortSignal
  reviewConfirmed?: boolean
  onTimelineEvent?: (event: AgentStepTimelineEvent) => void
}

export type RunAgentTurnResult = {
  turn: AssistantTurnResult
  roundsCompleted: number
  totalActionsExecuted: number
  timeline: AgentStepTimelineEvent[]
  undoSnapshot?: SceneGraph
}

const DEFAULT_BUDGETS: AgentStepBudget = {
  maxRounds: 12,
  maxActionsPerExecution: 25,
  maxTotalActions: 150,
  timeoutMs: 60000,
}

function cloneSceneGraph(): SceneGraph {
  return {
    nodes: structuredClone(useScene.getState().nodes) as SceneGraph['nodes'],
    rootNodeIds: [...useScene.getState().rootNodeIds],
  }
}

/**
 * Executes the agent loop client-side, making step requests to /api/assistant/agent/step
 * and fulfilling tool calls locally in the browser.
 */
export async function runAgentTurn(options: RunAgentTurnOptions): Promise<RunAgentTurnResult> {
  const budgets: AgentStepBudget = {
    ...DEFAULT_BUDGETS,
    ...options.budgets,
  }

  // 1. Capture snapshot at turn start for instant undo
  const undoSnapshot = cloneSceneGraph()

  const messages: AgentMessage[] = []
  let toolResults: AgentToolResult[] = []
  const timeline: AgentStepTimelineEvent[] = []
  let totalActionsExecuted = 0
  let round = 1

  while (round <= budgets.maxRounds) {
    if (options.signal?.aborted) {
      return {
        turn: {
          reply: 'Agent execution stopped by user.',
          mode: 'chat',
          assumptions: [],
          ambiguities: [],
          actions: [],
          requiresReview: false,
          destructiveActionCount: 0,
        },
        roundsCompleted: round,
        totalActionsExecuted,
        timeline,
        undoSnapshot,
      }
    }

    const stepRequest: AgentStepRequest = {
      prompt: options.prompt,
      chatMode: (options.chatMode as any) ?? 'create',
      messages,
      toolResults,
      workspaceContext: options.workspaceContext,
      image: options.image,
      round,
      budgets,
    }

    const res = await fetch('/api/assistant/agent/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stepRequest),
      signal: options.signal,
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Agent step failed (${res.status}): ${errorText}`)
    }

    const stepResponse = (await res.json()) as AgentStepResponse

    // Case A: Model declared completion or asked for user clarification
    if (stepResponse.kind === 'final') {
      return {
        turn: stepResponse.turn,
        roundsCompleted: round,
        totalActionsExecuted,
        timeline,
        undoSnapshot,
      }
    }

    // Case B: Model returned tool calls
    const currentCalls = stepResponse.calls
    const currentResults: AgentToolResult[] = []

    // Record the assistant's tool calls in the conversation history
    messages.push({
      role: 'assistant',
      content: stepResponse.thought ?? null,
      toolCalls: currentCalls,
    })

    for (const call of currentCalls) {
      const event: AgentStepTimelineEvent = {
        round,
        toolName: call.name,
        arguments: call.arguments,
        status: 'running',
      }
      options.onTimelineEvent?.(event)

      try {
        // Enforce reviewConfirmed flag on execute_actions if provided in options
        const callArgs = { ...call.arguments }
        if (call.name === 'execute_actions' && options.reviewConfirmed) {
          callArgs.reviewConfirmed = true
        }

        const output = await executeAgentTool(call.name, callArgs)

        let observation = 'Tool executed successfully.'
        let actionsExecuted: AssistantAction[] | undefined

        if (call.name === 'execute_actions') {
          const execRes = output as any
          if (execRes.errors && execRes.errors.length > 0) {
            observation = `Executed with errors: ${execRes.errors.join('; ')}`
          } else {
            const count = execRes.completedActionCount ?? 0
            totalActionsExecuted += count
            observation = `Executed ${count} action(s).`
          }
          if (Array.isArray(call.arguments.actions)) {
            actionsExecuted = call.arguments.actions as AssistantAction[]
          }
        } else if (call.name === 'inspect_scene') {
          const insp = output as any
          observation = `Found ${insp.total} node(s).`
        } else if (call.name === 'measure') {
          const meas = output as any
          if (meas.mode === 'distance') observation = `Distance: ${meas.distance} m`
          else if (meas.mode === 'zone_area') observation = `Measured area of ${Object.keys(meas.zones ?? {}).length} zone(s)`
          else observation = `Measurement mode: ${meas.mode}`
        } else if (call.name === 'search_catalog') {
          const cat = output as any
          observation = `Found ${cat.total} catalog item(s).`
        }

        event.status = 'completed'
        event.observation = observation
        event.actionsExecuted = actionsExecuted
        timeline.push(event)
        options.onTimelineEvent?.(event)

        currentResults.push({
          callId: call.id,
          name: call.name,
          output,
        })
      } catch (toolError) {
        const errorMsg = toolError instanceof Error ? toolError.message : 'Tool execution error'
        event.status = 'failed'
        event.observation = errorMsg
        timeline.push(event)
        options.onTimelineEvent?.(event)

        currentResults.push({
          callId: call.id,
          name: call.name,
          output: null,
          error: errorMsg,
        })
      }
    }

    toolResults = currentResults
    round += 1
  }

  // If budget exceeded without finish, return summary
  return {
    turn: {
      reply: `Reached maximum tool execution budget (${budgets.maxRounds} rounds).`,
      mode: 'chat',
      assumptions: [],
      ambiguities: [],
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
    roundsCompleted: budgets.maxRounds,
    totalActionsExecuted,
    timeline,
    undoSnapshot,
  }
}
