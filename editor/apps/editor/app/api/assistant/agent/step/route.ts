import { NextResponse } from 'next/server'
import { AgentStepRequestSchema } from '@/lib/assistant-agent/types'
import { runAgentStep } from '@/lib/assistant-agent/step'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { classifyAiFailure, logAiFailure } from '@/lib/ai-provider-shared'
import { getAssistantAiConfig } from '@/lib/assistant-ai-provider'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'

export const runtime = 'nodejs'

export const OPTIONS = pistolaCorsPreflight

export async function POST(request: Request) {
  let provider = getAssistantAiConfig().provider
  let promptSnippet: string | null = null

  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const raw = await request.json()
    const body = AgentStepRequestSchema.parse(raw)

    promptSnippet = body.prompt.slice(0, 160)
    const result = await runAgentStep(body)

    return withPistolaCors(
      request,
      NextResponse.json(result, {
        headers: {
          'Cache-Control': 'no-store',
        },
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete agent step.'
    const kind = classifyAiFailure(error)
    const status =
      kind === 'config'
        ? 503
        : kind === 'timeout'
          ? 504
          : kind === 'provider'
            ? 502
            : 400

    logAiFailure('assistant-agent-step', error, {
      provider,
      prompt: promptSnippet,
      status,
    })

    return withPistolaCors(
      request,
      NextResponse.json(
        {
          error: message,
          provider,
          kind,
        },
        { status },
      ),
    )
  }
}
