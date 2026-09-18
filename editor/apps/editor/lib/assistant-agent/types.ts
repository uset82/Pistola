import { z } from 'zod'
import { AssistantTurnResultSchema } from '../../../../packages/editor/src/lib/assistant/types'
import { AssistantChatModeSchema } from '../assistant-chat-contract'
import { AssistantImageAttachmentSchema } from '../assistant-image-contract'

export const AgentToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
})
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>

export const AgentToolResultSchema = z.object({
  callId: z.string(),
  name: z.string(),
  output: z.unknown(),
  error: z.string().optional(),
})
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>

export const AgentMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().nullable().optional(),
  toolCalls: z.array(AgentToolCallSchema).optional(),
  toolCallId: z.string().optional(),
})
export type AgentMessage = z.infer<typeof AgentMessageSchema>

export const AgentStepBudgetSchema = z.object({
  maxRounds: z.number().int().min(1).max(20).default(12),
  maxActionsPerExecution: z.number().int().min(1).max(25).default(25),
  maxTotalActions: z.number().int().min(1).max(200).default(150),
  timeoutMs: z.number().int().min(5000).max(300000).default(60000),
})
export type AgentStepBudget = z.infer<typeof AgentStepBudgetSchema>

export const defaultAgentStepBudget: AgentStepBudget = {
  maxRounds: 12,
  maxActionsPerExecution: 25,
  maxTotalActions: 150,
  timeoutMs: 60000,
}

export const AgentStepRequestSchema = z.object({
  prompt: z.string().min(1),
  chatMode: AssistantChatModeSchema.default('create'),
  messages: z.array(AgentMessageSchema).default([]),
  toolResults: z.array(AgentToolResultSchema).default([]),
  workspaceContext: z.record(z.string(), z.unknown()).optional(),
  image: AssistantImageAttachmentSchema.optional(),
  round: z.number().int().min(1).default(1),
  budgets: AgentStepBudgetSchema.default(defaultAgentStepBudget),
})
export type AgentStepRequest = z.infer<typeof AgentStepRequestSchema>

export const AgentStepToolCallsSchema = z.object({
  kind: z.literal('tool_calls'),
  round: z.number().int().min(1),
  calls: z.array(AgentToolCallSchema).min(1),
  thought: z.string().optional(),
})

export const AgentStepFinalSchema = z.object({
  kind: z.literal('final'),
  round: z.number().int().min(1),
  turn: AssistantTurnResultSchema,
})

export const AgentStepResponseSchema = z.discriminatedUnion('kind', [
  AgentStepToolCallsSchema,
  AgentStepFinalSchema,
])
export type AgentStepResponse = z.infer<typeof AgentStepResponseSchema>
