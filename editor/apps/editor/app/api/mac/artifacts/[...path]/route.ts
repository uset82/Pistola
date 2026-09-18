import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import { fetchMacHelper } from '../../_helper'

export const OPTIONS = pistolaCorsPreflight

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return withPistolaCors(request, auth.response)
    }

    const { path } = await context.params
    const joinedPath = path.map(encodeURIComponent).join('/')
    const response = await fetchMacHelper(
      `/v1/mac/artifacts/${joinedPath}${new URL(request.url).search}`,
    )

    if (!response.ok) {
      return withPistolaCors(request, NextResponse.json(
        { error: await response.text() },
        { status: response.status },
      ))
    }

    const headers = new Headers()
    headers.set('Cache-Control', 'no-store')

    const contentType = response.headers.get('content-type')
    if (contentType) headers.set('Content-Type', contentType)

    const contentDisposition = response.headers.get('content-disposition')
    if (contentDisposition) headers.set('Content-Disposition', contentDisposition)

    return withPistolaCors(request, new Response(response.body, {
      status: response.status,
      headers,
    }))
  } catch (error) {
    return withPistolaCors(request, NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to fetch MAC artifact.',
      },
      { status: 503 },
    ))
  }
}
