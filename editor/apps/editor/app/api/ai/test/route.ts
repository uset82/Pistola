import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import {
  DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
  readInstalledAiConfig,
} from '@/lib/installed-ai-config'

export async function POST(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const body = (await request.json().catch(() => ({}))) as {
      provider?: string
      apiKey?: string
      model?: string
      baseUrl?: string
    }

    const installed = readInstalledAiConfig()
    const provider =
      body.provider === 'openai' || body.provider === 'openrouter'
        ? body.provider
        : installed?.provider || 'openrouter'
    const apiKey = (body.apiKey || installed?.apiKey || '').trim()
    const model = (body.model || installed?.model || 'openrouter/free').trim()
    const baseUrl = (
      body.baseUrl ||
      installed?.baseUrl ||
      DEFAULT_INSTALLED_OPENROUTER_BASE_URL
    )
      .trim()
      .replace(/\/+$/u, '')

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'No API key configured.' },
        { status: 400 },
      )
    }

    if (provider === 'openrouter') {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        const text = await response.text()
        return NextResponse.json(
          {
            ok: false,
            error: text || `OpenRouter returned ${response.status}.`,
          },
          { status: 502 },
        )
      }
      return NextResponse.json({
        ok: true,
        provider,
        model,
        message: 'OpenRouter connection succeeded.',
      })
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json(
        { ok: false, error: text || `OpenAI returned ${response.status}.` },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      provider,
      model,
      message: 'OpenAI connection succeeded.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Connection test failed.',
      },
      { status: 500 },
    )
  }
}
