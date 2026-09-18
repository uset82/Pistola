import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import {
  DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
  readInstalledAiConfig,
} from '@/lib/installed-ai-config'

export const OPTIONS = pistolaCorsPreflight

export async function POST(request: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withPistolaCors(request, NextResponse.json(body, init))

  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
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
      return json(
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
        return json(
          {
            ok: false,
            error: text || `OpenRouter returned ${response.status}.`,
          },
          { status: 502 },
        )
      }
      return json({
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
      return json(
        { ok: false, error: text || `OpenAI returned ${response.status}.` },
        { status: 502 },
      )
    }

    return json({
      ok: true,
      provider,
      model,
      message: 'OpenAI connection succeeded.',
    })
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Connection test failed.',
      },
      { status: 500 },
    )
  }
}
