import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import { fetchMacHelper, getMacHelperUrl } from '../_helper'
import { normalizeMacHelperHealth } from '@/lib/mac-contracts'

export const OPTIONS = pistolaCorsPreflight

export async function GET(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const response = await fetchMacHelper('/health')
    const payload = await response.json()
    const normalized = normalizeMacHelperHealth(payload, getMacHelperUrl())

    return withPistolaCors(request, NextResponse.json(normalized, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    }))
  } catch (error) {
    return withPistolaCors(request, NextResponse.json(
      normalizeMacHelperHealth(
        {
          status: 'error',
          runtime: 'unreachable',
          engine: 'mac-build123d',
          version: 'unknown',
          helperUrl: getMacHelperUrl(),
          error: error instanceof Error ? error.message : 'MAC helper unavailable',
        },
        getMacHelperUrl(),
      ),
      { status: 503 },
    ))
  }
}
