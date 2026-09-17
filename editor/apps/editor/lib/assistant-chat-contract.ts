import { z } from 'zod'

export const assistantChatModeValues = ['ask', 'create', 'refine'] as const

export const AssistantChatModeSchema = z.enum(assistantChatModeValues)

export type AssistantChatMode = z.infer<typeof AssistantChatModeSchema>

export const buildAssistantSessionId = () =>
  `assistant-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
