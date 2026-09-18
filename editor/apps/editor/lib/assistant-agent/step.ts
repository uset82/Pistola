import {
  type AgentMessage,
  type AgentStepRequest,
  type AgentStepResponse,
  type AgentToolCall,
} from './types'
import { getOpenAiToolDefinitions, getGeminiFunctionDeclarations } from './tools'
import { getAssistantAiConfig } from '../assistant-ai-provider'
import {
  type SharedOpenAiConfig,
  type SharedOpenRouterConfig,
} from '../ai-provider-shared'
import { getGeminiApiKey, isGeminiAvailable } from '../gemini-shared'
import { AssistantTurnResultSchema } from '../../../../packages/editor/src/lib/assistant/types'

const AGENT_SYSTEM_PROMPT = `You are the Pistola 3D Editor Agentic Operator.
You have FULL control over a 3D architectural, CAD, and interior design workspace.

You operate via an interactive tool loop:
1. Observe the scene: Use "inspect_scene", "get_nodes", and "measure" to inspect walls, rooms, items, floor areas, dimensions, and selection state.
2. Search & plan: Use "search_catalog" to find appropriate furniture/appliance assets, or "list_capabilities" to inspect available operations.
3. Act: Use "execute_actions" to run up to 25 mutating actions at a time (create walls/slabs/zones, place items, CAD extrusions/booleans, transforms).
4. Verify: Observe the returned created node IDs. If further steps are needed, run them.
5. Complete: When the goal is achieved, call the "finish" tool with a concise, helpful summary reply and any assumptions made.
6. If the request is critically ambiguous or missing essential dimensions, call "ask_user".

Rules:
- NEVER guess node IDs. Always inspect or look them up first.
- Always use metric units (meters).
- Prefer existing catalog assets or parametric structure actions.
- Call "finish" when complete.`

/**
 * Execute one step of the agent loop.
 */
export async function runAgentStep(request: AgentStepRequest): Promise<AgentStepResponse> {
  const config = getAssistantAiConfig()

  // Prefer OpenAI or OpenRouter if configured, otherwise Gemini
  if (config.provider === 'openai' && config.apiKey) {
    return runOpenAiAgentStep(request, config)
  }

  if (config.provider === 'openrouter' && config.apiKey) {
    return runOpenRouterAgentStep(request, config)
  }

  if (isGeminiAvailable()) {
    return runGeminiAgentStep(request)
  }

  // Fallback: convert directly to final response with clarification
  return {
    kind: 'final',
    round: request.round,
    turn: {
      reply: 'No AI provider is configured for the agentic operator loop. Please configure an OpenAI, OpenRouter, or Gemini API key.',
      mode: 'clarify',
      assumptions: [],
      ambiguities: ['AI provider configuration missing.'],
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  }
}

async function runOpenAiAgentStep(
  request: AgentStepRequest,
  config: SharedOpenAiConfig,
): Promise<AgentStepResponse> {
  const endpoint = 'https://api.openai.com/v1/chat/completions'
  const model = config.model || 'gpt-5.4'
  return runChatCompletionsAgentStep(request, endpoint, config.apiKey, model)
}

async function runOpenRouterAgentStep(
  request: AgentStepRequest,
  config: SharedOpenRouterConfig,
): Promise<AgentStepResponse> {
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions'
  const model = config.model || 'openai/gpt-5.4'
  return runChatCompletionsAgentStep(request, endpoint, config.apiKey, model, {
    'HTTP-Referer': 'https://pistola.app',
    'X-Title': 'Pistola',
  })
}

async function runChatCompletionsAgentStep(
  request: AgentStepRequest,
  endpoint: string,
  apiKey: string,
  model: string,
  extraHeaders: Record<string, string> = {},
): Promise<AgentStepResponse> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
  ]

  if (request.workspaceContext) {
    messages.push({
      role: 'system',
      content: `Current Workspace Context: ${JSON.stringify(request.workspaceContext)}`,
    })
  }

  // User original prompt
  messages.push({ role: 'user', content: request.prompt })

  // Append conversation transcript / previous turns & tool calls
  for (const msg of request.messages) {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      })
    } else if (msg.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content ?? '',
      })
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content ?? '',
      })
    }
  }

  // Append results from the most recent tool execution round
  for (const res of request.toolResults) {
    messages.push({
      role: 'tool',
      tool_call_id: res.callId,
      content: JSON.stringify(res.error ? { error: res.error } : res.output),
    })
  }

  const payload = {
    model,
    messages,
    tools: getOpenAiToolDefinitions(),
    tool_choice: 'auto',
    temperature: 0.2,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(request.budgets.timeoutMs),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Provider HTTP error ${res.status}: ${errorText}`)
  }

  const json = (await res.json()) as any
  const choice = json.choices?.[0]
  if (!choice) {
    throw new Error('Provider returned no choices.')
  }

  const message = choice.message
  const toolCalls = message?.tool_calls

  if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    const parsedCalls: AgentToolCall[] = []

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments
      } catch {
        args = {}
      }

      // Check if finish tool was called
      if (tc.function.name === 'finish') {
        return {
          kind: 'final',
          round: request.round,
          turn: {
            reply: String(args.reply ?? 'Request completed successfully.'),
            mode: 'chat',
            assumptions: Array.isArray(args.assumptions) ? args.assumptions.map(String) : [],
            ambiguities: [],
            actions: [],
            requiresReview: false,
            destructiveActionCount: 0,
          },
        }
      }

      // Check if ask_user tool was called
      if (tc.function.name === 'ask_user') {
        return {
          kind: 'final',
          round: request.round,
          turn: {
            reply: String(args.question ?? 'Could you provide more details?'),
            mode: 'clarify',
            assumptions: [],
            ambiguities: [String(args.question ?? '')],
            actions: [],
            requiresReview: false,
            destructiveActionCount: 0,
          },
        }
      }

      parsedCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      })
    }

    return {
      kind: 'tool_calls',
      round: request.round,
      calls: parsedCalls,
      thought: message.content ?? undefined,
    }
  }

  // Model replied with plain text without tool call
  return {
    kind: 'final',
    round: request.round,
    turn: {
      reply: message.content ?? 'I have analyzed your request.',
      mode: 'chat',
      assumptions: [],
      ambiguities: [],
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  }
}

async function runGeminiAgentStep(request: AgentStepRequest): Promise<AgentStepResponse> {
  const apiKey = getGeminiApiKey()
  const model = 'gemini-2.5-flash-preview-05-20'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const contents: Array<Record<string, unknown>> = []

  // Add initial user request with workspace context
  let initialText = request.prompt
  if (request.workspaceContext) {
    initialText = `Workspace Context: ${JSON.stringify(request.workspaceContext)}\n\nUser Request: ${request.prompt}`
  }
  contents.push({ role: 'user', parts: [{ text: initialText }] })

  // Previous messages & tool interactions
  for (const msg of request.messages) {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      contents.push({
        role: 'model',
        parts: msg.toolCalls.map((tc) => ({
          functionCall: {
            name: tc.name,
            args: tc.arguments,
          },
        })),
      })
    } else if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.toolCallId ?? 'unknown',
              response: { output: msg.content },
            },
          },
        ],
      })
    }
  }

  // Most recent tool execution results
  if (request.toolResults.length > 0) {
    contents.push({
      role: 'user',
      parts: request.toolResults.map((res) => ({
        functionResponse: {
          name: res.name,
          response: { output: res.error ? { error: res.error } : res.output },
        },
      })),
    })
  }

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: AGENT_SYSTEM_PROMPT }],
    },
    tools: [
      {
        functionDeclarations: getGeminiFunctionDeclarations(),
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(request.budgets.timeoutMs),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errorText}`)
  }

  const json = (await res.json()) as any
  const candidate = json.candidates?.[0]
  const parts = candidate?.content?.parts ?? []

  const toolCalls: AgentToolCall[] = []
  let textContent = ''

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.text) {
      textContent += part.text
    }
    if (part.functionCall) {
      const fc = part.functionCall
      const callId = `call_${request.round}_${i}`

      if (fc.name === 'finish') {
        const args = fc.args ?? {}
        return {
          kind: 'final',
          round: request.round,
          turn: {
            reply: String(args.reply ?? 'Request completed successfully.'),
            mode: 'chat',
            assumptions: Array.isArray(args.assumptions) ? args.assumptions.map(String) : [],
            ambiguities: [],
            actions: [],
            requiresReview: false,
            destructiveActionCount: 0,
          },
        }
      }

      if (fc.name === 'ask_user') {
        const args = fc.args ?? {}
        return {
          kind: 'final',
          round: request.round,
          turn: {
            reply: String(args.question ?? 'Could you provide more details?'),
            mode: 'clarify',
            assumptions: [],
            ambiguities: [String(args.question ?? '')],
            actions: [],
            requiresReview: false,
            destructiveActionCount: 0,
          },
        }
      }

      toolCalls.push({
        id: callId,
        name: fc.name,
        arguments: fc.args ?? {},
      })
    }
  }

  if (toolCalls.length > 0) {
    return {
      kind: 'tool_calls',
      round: request.round,
      calls: toolCalls,
      thought: textContent || undefined,
    }
  }

  return {
    kind: 'final',
    round: request.round,
    turn: {
      reply: textContent || 'I have completed your request.',
      mode: 'chat',
      assumptions: [],
      ambiguities: [],
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  }
}
