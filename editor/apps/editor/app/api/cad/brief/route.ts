import { CadAiProviderError, createCadBriefResult, getCadAiConfig, type CadBriefRequest } from '@/lib/cad-ai-provider'
import { classifyAiFailure, logAiFailure } from '@/lib/ai-provider-shared'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  let provider = getCadAiConfig().provider
  let promptSnippet: string | null = null

  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const body = (await request.json()) as CadBriefRequest
    if (!body.prompt?.trim()) {
      return NextResponse.json(
        { error: 'CAD prompt is required.', provider, kind: 'validation' },
        { status: 400 },
      )
    }

    promptSnippet = body.prompt.slice(0, 160)
    provider = getCadAiConfig().provider
    const result = await createCadBriefResult(body)

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate a CAD brief.'
    const errorProvider = error instanceof CadAiProviderError ? error.provider : provider
    const kind = classifyAiFailure(error)
    const status =
      kind === 'config'
        ? 503
        : kind === 'timeout'
          ? 504
          : kind === 'validation'
            ? 400
            : 502

    logAiFailure('cad-brief', error, {
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
