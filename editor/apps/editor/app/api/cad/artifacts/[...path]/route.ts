import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { fetchCadHelper } from '../../_helper'

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const { path } = await context.params
    const joinedPath = path.map(encodeURIComponent).join('/')
    const response = await fetchCadHelper(`/v1/cad/artifacts/${joinedPath}${new URL(request.url).search}`)

    if (!response.ok) {
      return NextResponse.json(
        {
          error: await response.text(),
        },
        { status: response.status },
      )
    }

    const headers = new Headers()
    headers.set('Cache-Control', 'no-store')

    const contentType = response.headers.get('content-type')
    if (contentType) headers.set('Content-Type', contentType)

    const contentDisposition = response.headers.get('content-disposition')
    if (contentDisposition) headers.set('Content-Disposition', contentDisposition)

    return new Response(response.body, {
      status: response.status,
      headers,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to fetch CAD artifact.',
      },
      { status: 503 },
    )
  }
}
