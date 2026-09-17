import type { AssistantAction, AssistantTurnResult } from '../../../packages/editor/src/lib/assistant/types'
import type {
  AssistantExecutionResult,
  AssistantExecutionStatus,
} from '@pascal-app/editor'
import type { CadBrief } from '@pascal-app/core'

type ExecuteAssistantPlan = typeof import('@pascal-app/editor').executeAssistantPlan

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPlanStepStatus = 'pending' | 'running' | 'done' | 'error'

export type TaskPlanAgentDomain = 'structure' | 'furnish' | 'cad' | 'layout' | 'general'

export type TaskPlanStep = {
  id: string
  description: string
  actions: AssistantAction[]
  status: TaskPlanStepStatus
  error?: string
  agent?: TaskPlanAgentDomain
}

export type TaskPlan = {
  id: string
  title: string
  steps: TaskPlanStep[]
  prompt: string
  createdAt: number
}

export type TaskPlanProgress = {
  completed: number
  total: number
  activeStep: number | null
  hasError: boolean
}

export type TaskPlanExecutionCallbacks = {
  onStepStart?: (stepIndex: number, step: TaskPlanStep) => void
  onStepComplete?: (
    stepIndex: number,
    step: TaskPlanStep,
    result: AssistantExecutionResult,
  ) => void
  onStepError?: (stepIndex: number, step: TaskPlanStep, error: string) => void
  onPlanComplete?: (plan: TaskPlan) => void
  onExecutionStatus?: (event: AssistantExecutionStatus, stepIndex: number, step: TaskPlanStep) => void
  shouldStop?: () => boolean
  runtime?: {
    executeCadBrief?: (brief: CadBrief) => Promise<{ bodyIds: string[]; sketchIds: string[] }>
    runCadPrompt?: (prompt: string) => Promise<{ bodyIds: string[]; sketchIds: string[] }>
  }
  executePlan?: ExecuteAssistantPlan
}

const yieldToEventLoop = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

// ---------------------------------------------------------------------------
// Parse a task-plan mode turn into a TaskPlan
// ---------------------------------------------------------------------------

export const parseTaskPlanFromTurn = (
  turn: AssistantTurnResult,
  prompt: string,
): TaskPlan | null => {
  if (turn.mode !== 'task-plan') return null

  const rawSteps = (turn as Record<string, unknown>).steps
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    // Fall back: wrap all actions into a single step
    if (turn.actions.length === 0) return null
    return {
      id: `task-plan-${Date.now()}`,
      title: turn.reply || prompt,
      steps: [
        {
          id: 'step-0',
          description: turn.reply || 'Execute all actions',
          actions: turn.actions,
          status: 'pending',
          agent: 'general',
        },
      ],
      prompt,
      createdAt: Date.now(),
    }
  }

  const steps: TaskPlanStep[] = rawSteps.map((raw: unknown, index: number) => {
    const record = raw as Record<string, unknown>
    return {
      id: `step-${index}`,
      description: typeof record.description === 'string' ? record.description : `Step ${index + 1}`,
      actions: Array.isArray(record.actions) ? (record.actions as AssistantAction[]) : [],
      status: 'pending' as TaskPlanStepStatus,
      agent:
        typeof record.agent === 'string' &&
        ['structure', 'furnish', 'cad', 'layout', 'general'].includes(record.agent)
          ? (record.agent as TaskPlanAgentDomain)
          : 'general',
    }
  })

  return {
    id: `task-plan-${Date.now()}`,
    title: turn.reply || prompt,
    steps,
    prompt,
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Execute a task plan step-by-step
// ---------------------------------------------------------------------------

export const executeTaskPlan = async (
  plan: TaskPlan,
  callbacks: TaskPlanExecutionCallbacks = {},
): Promise<TaskPlan> => {
  const executePlan =
    callbacks.executePlan ??
    (await import('@pascal-app/editor')).executeAssistantPlan
  const updatedSteps = [...plan.steps]

  for (let i = 0; i < updatedSteps.length; i++) {
    const step = updatedSteps[i]
    if (!step || step.status === 'done') continue

    if (callbacks.shouldStop?.()) {
      break
    }

    // Mark running
    updatedSteps[i] = { ...step, status: 'running', error: undefined }
    callbacks.onStepStart?.(i, updatedSteps[i]!)
    await yieldToEventLoop()

    try {
      const result = await executePlan(step.actions, {
        reviewConfirmed: true,
        runtime: callbacks.runtime
          ? {
              executeCadBrief: callbacks.runtime.executeCadBrief,
              runCadPrompt: callbacks.runtime.runCadPrompt,
            }
          : undefined,
        onStatus: (event) => callbacks.onExecutionStatus?.(event, i, updatedSteps[i]!),
      })

      if (!result.ok) {
        const errorMessage = result.errors[0] ?? 'Step execution failed.'
        updatedSteps[i] = { ...step, status: 'error', error: errorMessage }
        callbacks.onStepError?.(i, updatedSteps[i]!, errorMessage)
        break
      }

      updatedSteps[i] = { ...step, status: 'done', error: undefined }
      callbacks.onStepComplete?.(i, updatedSteps[i]!, result)
      await yieldToEventLoop()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unexpected step failure.'
      updatedSteps[i] = { ...step, status: 'error', error: errorMessage }
      callbacks.onStepError?.(i, updatedSteps[i]!, errorMessage)
      break
    }
  }

  const updatedPlan = { ...plan, steps: updatedSteps }
  const progress = getTaskPlanProgress(updatedPlan)
  if (progress.completed === progress.total) {
    callbacks.onPlanComplete?.(updatedPlan)
  }

  return updatedPlan
}

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------

export const getTaskPlanProgress = (plan: TaskPlan): TaskPlanProgress => {
  let completed = 0
  let activeStep: number | null = null
  let hasError = false

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    if (!step) continue

    if (step.status === 'done') {
      completed++
    } else if (step.status === 'running') {
      activeStep = i
    } else if (step.status === 'error') {
      hasError = true
      activeStep = i
    }
  }

  if (activeStep === null && completed < plan.steps.length) {
    // Find the first pending step
    const pendingIndex = plan.steps.findIndex((s) => s.status === 'pending')
    if (pendingIndex >= 0) activeStep = pendingIndex
  }

  return {
    completed,
    total: plan.steps.length,
    activeStep,
    hasError,
  }
}
