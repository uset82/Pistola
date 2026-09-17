import { NextResponse } from 'next/server'
import { normalizeCadJobCreateResponse } from '@pascal-app/editor/lib/cad/contracts'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { fetchCadHelper } from '../_helper'

export async function POST(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const contentType = request.headers.get('content-type') || ''
    const body = contentType.includes('multipart/form-data')
      ? await request.formData()
      : await request.text()
    const response = await fetchCadHelper('/v1/cad/jobs', {
      method: 'POST',
      body,
    })
    const payload = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            typeof payload?.error === 'string'
              ? payload.error
              : 'Unable to create CAD helper job.',
        },
        { status: response.status },
      )
    }

    return NextResponse.json(normalizeCadJobCreateResponse(payload), {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to create CAD helper job.',
      },
      { status: 503 },
    )
  }
}
