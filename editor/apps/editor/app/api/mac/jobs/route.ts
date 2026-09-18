import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import { fetchMacHelper } from '../_helper'
import { normalizeMacJobCreateResponse } from '@/lib/mac-contracts'

export const OPTIONS = pistolaCorsPreflight

export async function POST(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const body = await request.text()
    const response = await fetchMacHelper('/v1/mac/jobs', {
      method: 'POST',
      body,
    })
    const payload = await response.json()

    if (!response.ok) {
      return withPistolaCors(request, NextResponse.json(
        {
          error:
            typeof payload?.error === 'string'
              ? payload.error
              : typeof payload?.detail === 'string'
                ? payload.detail
                : 'Unable to create MAC helper job.',
        },
        { status: response.status },
      ))
    }

    return withPistolaCors(request, NextResponse.json(normalizeMacJobCreateResponse(payload), {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    }))
  } catch (error) {
    return withPistolaCors(request, NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to create MAC helper job.',
      },
      { status: 503 },
    ))
  }
}
