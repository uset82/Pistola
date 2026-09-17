import type { AssistantNodeSummary } from '@pascal-app/editor'

import type { AssistantChatMode } from './assistant-chat-contract'
import type { TaskPlan } from './assistant-task-plan'

export type AssistantPanelStatus =
  | 'idle'
  | 'planning'
  | 'clarify'
  | 'review'
  | 'executing'
  | 'executed'
  | 'error'
  | 'task-plan'

export type AssistantChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
}

export type TaskPlanSummary = {
  title: string
  stepCount: number
  completedAt: number
}

export type AssistantSessionMemory = {
  lastCreatedNodes: AssistantNodeSummary[]
  recentReferencedNodes: AssistantNodeSummary[]
  lastError: string | null
  codexThreadId: string | null
  recentSuccessfulPrompts: string[]
  failedPrompts: string[]
  taskPlans: TaskPlan[]
  taskPlanSummaries: TaskPlanSummary[]
  preferredComplexity: 'simple' | 'detailed'
  conversationHistory: { role: 'user' | 'assistant'; text: string }[]
}

export const createEmptyAssistantSessionMemory = (): AssistantSessionMemory => ({
  lastCreatedNodes: [],
  recentReferencedNodes: [],
  lastError: null,
  codexThreadId: null,
  recentSuccessfulPrompts: [],
  failedPrompts: [],
  taskPlans: [],
  taskPlanSummaries: [],
  preferredComplexity: 'simple',
  conversationHistory: [],
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isAssistantNodeSummary = (value: unknown): value is AssistantNodeSummary =>
  isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string'

const isTaskPlanLike = (value: unknown): value is TaskPlan =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  typeof value.prompt === 'string' &&
  typeof value.createdAt === 'number' &&
  Array.isArray(value.steps)

const isTaskPlanSummaryLike = (value: unknown): value is TaskPlanSummary =>
  isRecord(value) &&
  typeof value.title === 'string' &&
  typeof value.stepCount === 'number' &&
  typeof value.completedAt === 'number'

const isConversationTurn = (
  value: unknown,
): value is AssistantSessionMemory['conversationHistory'][number] =>
  isRecord(value) &&
  (value.role === 'user' || value.role === 'assistant') &&
  typeof value.text === 'string'

export const restoreAssistantSessionMemory = (
  value: unknown,
): AssistantSessionMemory => {
  const fallback = createEmptyAssistantSessionMemory()
  if (!isRecord(value)) return fallback

  return {
    lastCreatedNodes: Array.isArray(value.lastCreatedNodes)
      ? value.lastCreatedNodes.filter(isAssistantNodeSummary).slice(0, 8)
      : fallback.lastCreatedNodes,
    recentReferencedNodes: Array.isArray(value.recentReferencedNodes)
      ? value.recentReferencedNodes.filter(isAssistantNodeSummary).slice(0, 8)
      : fallback.recentReferencedNodes,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
    codexThreadId: typeof value.codexThreadId === 'string' && value.codexThreadId.trim()
      ? value.codexThreadId
      : null,
    recentSuccessfulPrompts: Array.isArray(value.recentSuccessfulPrompts)
      ? value.recentSuccessfulPrompts
          .filter((entry): entry is string => typeof entry === 'string')
          .slice(0, 6)
      : fallback.recentSuccessfulPrompts,
    failedPrompts: Array.isArray(value.failedPrompts)
      ? value.failedPrompts
          .filter((entry): entry is string => typeof entry === 'string')
          .slice(0, 6)
      : fallback.failedPrompts,
    taskPlans: Array.isArray(value.taskPlans)
      ? value.taskPlans.filter(isTaskPlanLike).slice(0, 4)
      : fallback.taskPlans,
    taskPlanSummaries: Array.isArray(value.taskPlanSummaries)
      ? value.taskPlanSummaries.filter(isTaskPlanSummaryLike).slice(0, 4)
      : fallback.taskPlanSummaries,
    preferredComplexity:
      value.preferredComplexity === 'detailed' ? 'detailed' : 'simple',
    conversationHistory: Array.isArray(value.conversationHistory)
      ? value.conversationHistory.filter(isConversationTurn).slice(-200)
      : fallback.conversationHistory,
  }
}

const mergeAssistantNodeSummaries = (
  current: AssistantNodeSummary[],
  next: AssistantNodeSummary[],
  maxNodes: number,
) => {
  const merged = [...next, ...current]
  const unique = new Map<string, AssistantNodeSummary>()

  for (const summary of merged) {
    const id = typeof summary?.id === 'string' ? summary.id : null
    if (!id || unique.has(id)) continue
    unique.set(id, summary)
    if (unique.size >= maxNodes) break
  }

  return Array.from(unique.values())
}

export const rememberSuccessfulAssistantPrompt = (
  memory: AssistantSessionMemory,
  prompt: string,
  maxPrompts = 3,
): AssistantSessionMemory => {
  const nextPrompt = prompt.trim()
  if (!nextPrompt) return memory

  return {
    ...memory,
    recentSuccessfulPrompts: [
      nextPrompt,
      ...memory.recentSuccessfulPrompts.filter((entry) => entry !== nextPrompt),
    ].slice(0, Math.max(1, maxPrompts)),
  }
}

export const rememberReferencedAssistantNodes = (
  memory: AssistantSessionMemory,
  nodes: AssistantNodeSummary[],
  maxNodes = 6,
): AssistantSessionMemory => ({
  ...memory,
  recentReferencedNodes: mergeAssistantNodeSummaries(
    memory.recentReferencedNodes,
    nodes,
    Math.max(1, maxNodes),
  ),
})

export type AssistantPanelSessionReset<
  TTurn = unknown,
  TExecutionStatus = unknown,
  TExecutionResult = unknown,
  TAttachedImage = unknown,
  TUndoSnapshot = unknown,
> = {
  status: AssistantPanelStatus
  messages: AssistantChatMessage[]
  turn: TTurn | null
  panelError: string | null
  executionEvents: TExecutionStatus[]
  executionResult: TExecutionResult | null
  lastPrompt: string | null
  lastPromptImageDataUrl: string | null
  attachedImage: TAttachedImage | null
  lastUndoSnapshot: TUndoSnapshot | null
  input: string
  assistantSessionId: string
  assistantSessionMemory: AssistantSessionMemory
  activeSuggestionIndex: number
  chatMode: AssistantChatMode
  isAutoContinuing: boolean
}

export const buildAssistantPanelSessionReset = <
  TTurn = unknown,
  TExecutionStatus = unknown,
  TExecutionResult = unknown,
  TAttachedImage = unknown,
  TUndoSnapshot = unknown,
>({
  currentChatMode,
  preserveChatMode = false,
  nextSessionId,
}: {
  currentChatMode: AssistantChatMode
  preserveChatMode?: boolean
  nextSessionId: string
}): AssistantPanelSessionReset<
  TTurn,
  TExecutionStatus,
  TExecutionResult,
  TAttachedImage,
  TUndoSnapshot
> => ({
  status: 'idle',
  messages: [],
  turn: null,
  panelError: null,
  executionEvents: [],
  executionResult: null,
  lastPrompt: null,
  lastPromptImageDataUrl: null,
  attachedImage: null,
  lastUndoSnapshot: null,
  input: '',
  assistantSessionId: nextSessionId,
  assistantSessionMemory: createEmptyAssistantSessionMemory(),
  activeSuggestionIndex: 0,
  chatMode: preserveChatMode ? currentChatMode : 'create',
  isAutoContinuing: false,
})

export const rememberFailedPrompt = (
  memory: AssistantSessionMemory,
  prompt: string,
  maxPrompts = 3,
): AssistantSessionMemory => {
  const nextPrompt = prompt.trim()
  if (!nextPrompt) return memory

  return {
    ...memory,
    failedPrompts: [
      nextPrompt,
      ...memory.failedPrompts.filter((entry) => entry !== nextPrompt),
    ].slice(0, Math.max(1, maxPrompts)),
  }
}

export const rememberCompletedTaskPlan = (
  memory: AssistantSessionMemory,
  plan: TaskPlan,
  maxPlans = 2,
): AssistantSessionMemory => {
  const nextTitle = plan.title.trim()
  const nextPrompt = plan.prompt.trim()
  const nextStepCount = plan.steps.length
  const nextCompletedAt = Date.now()

  const dedupedPlans = memory.taskPlans.filter(
    (entry) => !(entry.title.trim() === nextTitle && entry.prompt.trim() === nextPrompt),
  )
  const dedupedSummaries = memory.taskPlanSummaries.filter(
    (entry) => !(entry.title.trim() === nextTitle && entry.stepCount === nextStepCount),
  )

  return {
    ...memory,
    taskPlans: [{ ...plan, createdAt: nextCompletedAt }, ...dedupedPlans].slice(0, Math.max(1, maxPlans)),
    taskPlanSummaries: [
      { title: nextTitle, stepCount: nextStepCount, completedAt: nextCompletedAt },
      ...dedupedSummaries,
    ].slice(0, Math.max(1, maxPlans)),
  }
}

export const rememberConversationTurn = (
  memory: AssistantSessionMemory,
  userPrompt: string,
  assistantReply: string,
  maxPairs = 100, // 100 pairs = 200 messages
  fullDetailPairs = 40, // keep the last 40 pairs in full detail, compress older
): AssistantSessionMemory => {
  const userText = userPrompt.trim()
  const replyText = assistantReply.trim()
  
  if (!userText || !replyText) return memory

  const nextHistory = [
    ...memory.conversationHistory,
    { role: 'user' as const, text: userText },
    { role: 'assistant' as const, text: replyText },
  ]

  // If we exceed fullDetailPairs, we compress older messages into a single system-like context chunk
  if (nextHistory.length > fullDetailPairs * 2) {
    const splitIndex = nextHistory.length - (fullDetailPairs * 2)
    // Find a clean break point (always after an assistant message)
    const validSplit = splitIndex % 2 !== 0 ? splitIndex + 1 : splitIndex
    
    const olderMsgs = nextHistory.slice(0, validSplit)
    const recentMsgs = nextHistory.slice(validSplit)
    
    // Instead of dropping, combine older messages into one compressed digest
    const compressedText = olderMsgs
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
      .join('\n\n')
    
    nextHistory.length = 0 // clear
    nextHistory.push({
      role: 'user',
      text: `[Prior Conversation Summary]\n${compressedText}`
    })
    nextHistory.push({
      role: 'assistant',
      text: 'Understood. I have reviewed the prior conversation.'
    })
    nextHistory.push(...recentMsgs)
  }

  // Final cap at maxPairs
  return {
    ...memory,
    conversationHistory: nextHistory.slice(-(Math.max(1, maxPairs) * 2)),
  }
}
