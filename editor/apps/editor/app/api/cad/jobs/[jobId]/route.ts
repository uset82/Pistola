import { NextResponse } from 'next/server'
import { normalizeCadJobResult } from '@pascal-app/editor/lib/cad/contracts'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import { fetchCadHelper } from '../../_helper'

export const OPTIONS = pistolaCorsPreflight

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const { jobId } = await context.params
    const response = await fetchCadHelper(`/v1/cad/jobs/${jobId}`)
    const payload = await response.json()

    if (!response.ok) {
      return withPistolaCors(request, NextResponse.json(
        {
          error:
            typeof payload?.error === 'string'
              ? payload.error
              : 'Unable to fetch CAD helper job.',
        },
        { status: response.status },
      ))
    }

    return withPistolaCors(request, NextResponse.json(normalizeCadJobResult(payload), {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    }))
  } catch (error) {
    return withPistolaCors(request, NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to fetch CAD helper job.',
      },
      { status: 503 },
    ))
  }
}
