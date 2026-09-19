import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import {
  enqueueWorkspaceCommand,
  getWorkspaceCommandResult,
} from '@/lib/workspace-bridge'

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
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined

    if (body.type === 'api' || typeof body.method === 'string') {
      const method = String(body.method || '')
      if (!method) {
        return NextResponse.json({ error: 'api commands require method.' }, { status: 400 })
      }
      const enqueued = enqueueWorkspaceCommand(access, {
        sessionId,
        type: 'api',
        method,
        args: body.args,
      })
      return NextResponse.json(
        { ok: true, sessionId: enqueued.sessionId, command: enqueued.command },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (Array.isArray(body.actions)) {
      const enqueued = enqueueWorkspaceCommand(access, {
        sessionId,
        type: 'actions',
        actions: body.actions,
        confirmDestructive: body.confirmDestructive === true,
      })
      return NextResponse.json(
        { ok: true, sessionId: enqueued.sessionId, command: enqueued.command },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (body.type === 'read' || typeof body.tool === 'string') {
      const tool = String(body.tool || '')
      const args = (
        typeof body.arguments === 'object' && body.arguments !== null
          ? body.arguments
          : {}
      ) as Record<string, unknown>
      const enqueued = enqueueWorkspaceCommand(access, {
        sessionId,
        type: 'read',
        tool,
        arguments: args,
      })
      return NextResponse.json(
        { ok: true, sessionId: enqueued.sessionId, command: enqueued.command },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    if (typeof body.prompt === 'string' && body.prompt.trim()) {
      const prompt = body.prompt.trim()
      const isAgent = body.type === 'agent' || body.agent === true
      const enqueued =
        body.generateMac === true
          ? enqueueWorkspaceCommand(access, { sessionId, type: 'generate_mac', prompt })
          : isAgent
            ? enqueueWorkspaceCommand(access, {
                sessionId,
                type: 'agent',
                prompt,
                ...(typeof body.chatMode === 'string' ? { chatMode: body.chatMode } : {}),
              })
            : enqueueWorkspaceCommand(access, {
                sessionId,
                type: 'assistant_prompt',
                prompt,
                ...(typeof body.chatMode === 'string' ? { chatMode: body.chatMode } : {}),
              })
      return NextResponse.json(
        { ok: true, sessionId: enqueued.sessionId, command: enqueued.command },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return NextResponse.json(
      { error: 'Provide actions[], prompt, or tool for read.' },
      { status: 400 },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to enqueue workspace command.',
      },
      { status: 409 },
    )
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireRouteAuthSession()
    if (auth.response) {
      return auth.response
    }

    const access = {
      ownerUserId: auth.session.user.id,
      isLocalOperator: auth.isLocalOperator,
    }

    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    const commandId = url.searchParams.get('commandId')
    if (!sessionId || !commandId) {
      return NextResponse.json(
        { error: 'sessionId and commandId are required.' },
        { status: 400 },
      )
    }

    const result = getWorkspaceCommandResult(access, sessionId, commandId)
    if (!result) {
      return NextResponse.json(
        { pending: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return NextResponse.json(
      { pending: false, result },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to read command result.',
      },
      { status: 500 },
    )
  }
}
