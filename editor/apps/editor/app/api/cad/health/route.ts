import { NextResponse } from 'next/server'
import { normalizeCadHelperHealth } from '@pascal-app/editor/lib/cad/contracts'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import { fetchCadHelper, getCadHelperUrl } from '../_helper'

export const OPTIONS = pistolaCorsPreflight

export async function GET(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const response = await fetchCadHelper('/health')
    const payload = await response.json()
    const normalized = normalizeCadHelperHealth(payload, getCadHelperUrl())

    return withPistolaCors(request, NextResponse.json(
      normalized,
      {
        status: response.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    ))
  } catch (error) {
    const rawError = error instanceof Error ? error.message : 'CAD helper unavailable'
    const cleanError =
      rawError === 'fetch failed'
        ? `CAD helper at ${getCadHelperUrl()} is unreachable`
        : rawError

    return withPistolaCors(request, NextResponse.json(
      normalizeCadHelperHealth(
        {
          status: 'error',
          runtime: 'unreachable',
          engine: 'cad-helper',
          version: 'unknown',
          helperUrl: getCadHelperUrl(),
          error: cleanError,
        },
        getCadHelperUrl(),
      ),
      { status: 503 },
    ))
  }
}
