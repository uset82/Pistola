import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import {
  getInstalledAiConfigPublicView,
  mergeInstalledAiConfigUpdate,
  readInstalledAiConfig,
  writeInstalledAiConfig,
  type InstalledAiConfigUpdate,
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

    const body = (await request.json().catch(() => ({}))) as InstalledAiConfigUpdate
    const merged = mergeInstalledAiConfigUpdate(readInstalledAiConfig(), body)
    if ('error' in merged) {
      return withPistolaCors(request, NextResponse.json({ error: merged.error }, { status: 400 }))
    }

    const written = writeInstalledAiConfig(merged)

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
