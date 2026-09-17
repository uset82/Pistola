import { NextResponse } from 'next/server'
import { normalizeCadHelperHealth } from '@pascal-app/editor/lib/cad/contracts'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { fetchCadHelper, getCadHelperUrl } from '../_helper'

export async function GET() {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const response = await fetchCadHelper('/health')
    const payload = await response.json()
    const normalized = normalizeCadHelperHealth(payload, getCadHelperUrl())

    return NextResponse.json(
      normalized,
      {
        status: response.status,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    return NextResponse.json(
      normalizeCadHelperHealth(
        {
        status: 'error',
        runtime: 'unreachable',
        engine: 'cad-helper',
        version: 'unknown',
        helperUrl: getCadHelperUrl(),
        error: error instanceof Error ? error.message : 'CAD helper unavailable',
        },
        getCadHelperUrl(),
      ),
      { status: 503 },
    )
  }
}
