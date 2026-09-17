import {
  AssistantPlanRequestSchema,
  AssistantTurnResultSchema,
  createAssistantTurnResult,
  getAssistantAiConfig,
} from '@/lib/assistant-ai-provider'
import { AssistantAiProviderError } from '@/lib/assistant-ai-provider'
import { classifyAiFailure, logAiFailure } from '@/lib/ai-provider-shared'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let provider = getAssistantAiConfig().provider
  let promptSnippet: string | null = null

  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const body = AssistantPlanRequestSchema.parse(await request.json())
    if (!body.prompt.trim()) {
      return NextResponse.json(
        { error: 'Assistant prompt is required.', provider, kind: 'validation' },
        { status: 400 },
      )
    }

    promptSnippet = body.prompt.slice(0, 160)
    provider = getAssistantAiConfig().provider
    const result = await createAssistantTurnResult(body)
    const turn = AssistantTurnResultSchema.parse(result.turn)

    return NextResponse.json(turn, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to create an assistant response.'
    const errorProvider = error instanceof AssistantAiProviderError ? error.provider : provider
    const kind = classifyAiFailure(error)
    const status =
      kind === 'config'
        ? 503
        : kind === 'timeout'
          ? 504
          : kind === 'provider' ||
              (kind === 'validation' && /planner|response|action/i.test(message))
            ? 502
            : 400

    logAiFailure('assistant-plan', error, {
      provider: errorProvider,
      prompt: promptSnippet,
      status,
    })

    return NextResponse.json(
      {
        error: message,
        provider: errorProvider,
        kind,
      },
      { status },
    )
  }
}
