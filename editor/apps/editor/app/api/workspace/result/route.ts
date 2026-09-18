import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import { reportWorkspaceCommandResult } from '@/lib/workspace-bridge'

export async function POST(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const access = {
      ownerUserId: auth.session.user.id,
      isLocalOperator: auth.isLocalOperator,
    }

    const body = (await request.json()) as Record<string, unknown>
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
    const commandId = typeof body.commandId === 'string' ? body.commandId : null
    if (!sessionId || !commandId) {
      return NextResponse.json(
        { error: 'sessionId and commandId are required.' },
        { status: 400 },
      )
    }

    const result = reportWorkspaceCommandResult(access, sessionId, {
      commandId,
      ok: body.ok !== false,
      errors: Array.isArray(body.errors)
        ? body.errors.filter((item): item is string => typeof item === 'string')
        : undefined,
      bodyIds: Array.isArray(body.bodyIds)
        ? body.bodyIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      sketchIds: Array.isArray(body.sketchIds)
        ? body.sketchIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      createdNodeIds: Array.isArray(body.createdNodeIds)
        ? body.createdNodeIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      output: body.output ?? body.data,
      turn: body.turn,
      timeline: body.timeline,
      message: typeof body.message === 'string' ? body.message : undefined,
    })

    return NextResponse.json(
      { ok: true, result },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to report workspace result.',
      },
      { status: 500 },
    )
  }
}
