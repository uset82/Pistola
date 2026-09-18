import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import {
  getInstalledAiConfigPublicView,
  readInstalledAiConfig,
  writeInstalledAiConfig,
  type InstalledAiConfig,
  DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
  DEFAULT_INSTALLED_OPENROUTER_MODEL,
} from '@/lib/installed-ai-config'

export const OPTIONS = pistolaCorsPreflight

export async function GET(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const config = readInstalledAiConfig()
    return withPistolaCors(
      request,
      NextResponse.json(
        {
          ...getInstalledAiConfigPublicView(config),
          defaults: {
            provider: 'openrouter',
            model: DEFAULT_INSTALLED_OPENROUTER_MODEL,
            baseUrl: DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
    )
  } catch (error) {
    return withPistolaCors(
      request,
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unable to read AI config.' },
        { status: 500 },
      ),
    )
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const body = (await request.json()) as Partial<InstalledAiConfig>
    const provider = body.provider === 'openai' ? 'openai' : 'openrouter'
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (!apiKey) {
      return withPistolaCors(request, NextResponse.json({ error: 'apiKey is required.' }, { status: 400 }))
    }

    const written = writeInstalledAiConfig({
      provider,
      apiKey,
      model:
        typeof body.model === 'string' && body.model.trim()
          ? body.model.trim()
          : DEFAULT_INSTALLED_OPENROUTER_MODEL,
      baseUrl:
        typeof body.baseUrl === 'string' && body.baseUrl.trim()
          ? body.baseUrl.trim()
          : DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
    })

    return withPistolaCors(
      request,
      NextResponse.json(
        {
          ok: true,
          path: written.path,
          ...getInstalledAiConfigPublicView(written.config),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      ),
    )
  } catch (error) {
    return withPistolaCors(
      request,
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unable to save AI config.' },
        { status: 500 },
      ),
    )
  }
}
