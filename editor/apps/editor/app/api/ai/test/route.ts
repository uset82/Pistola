import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { formatOpenRouterErrorMessage } from '@/lib/ai-provider-shared'
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
      // /models is public, so it cannot validate a key; /key requires a valid one
      // and reports its label and free-model quota.
      const response = await fetch(`${baseUrl}/key`, {
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
            error: formatOpenRouterErrorMessage(response.status, text, 'OpenRouter key check'),
          },
          { status: 502 },
        )
      }
      const keyInfo = ((await response.json().catch(() => null)) as {
        data?: {
          label?: unknown
          is_free_tier?: unknown
          free_model_daily_requests?: { used?: unknown; remaining?: unknown }
        }
      } | null)?.data
      const label = typeof keyInfo?.label === 'string' ? keyInfo.label : null
      const dailyUsed = keyInfo?.free_model_daily_requests?.used
      const dailyRemaining = keyInfo?.free_model_daily_requests?.remaining
      const quota =
        typeof dailyUsed === 'number' && typeof dailyRemaining === 'number'
          ? ` Free-model requests today: ${dailyUsed} used, ${dailyRemaining} remaining.`
          : keyInfo?.is_free_tier === true
            ? ' No credits purchased: free models are limited to 50 requests/day.'
            : ''
      return json({
        ok: true,
        provider,
        model,
        keyLabel: label,
        message: `OpenRouter key${label ? ` "${label}"` : ''} is valid.${quota}`,
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
