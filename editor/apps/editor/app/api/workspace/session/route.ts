import { NextResponse } from 'next/server'
import { requireRouteAuthSession } from '@/lib/auth/route'
import {
  getActiveWorkspaceSession,
  getWorkspaceSession,
  listWorkspaceSessions,
  registerWorkspaceSession,
  touchWorkspaceSession,
} from '@/lib/workspace-bridge'
import {
  getInstalledAiConfigPublicView,
  readInstalledAiConfig,
} from '@/lib/installed-ai-config'

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

    const sessionId = new URL(request.url).searchParams.get('sessionId')
    const snapshot = sessionId
      ? getWorkspaceSession(access, sessionId)
      : getActiveWorkspaceSession(access)
    const installed = getInstalledAiConfigPublicView(readInstalledAiConfig())

    if (!snapshot) {
      return NextResponse.json(
        {
          connected: false,
          message:
            'No live editor workspace session. Open the Pistola editor in a browser tab.',
          installedModel: installed,
          sessions: listWorkspaceSessions(access),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    return NextResponse.json(
      {
        connected: true,
        session: snapshot,
        installedModel: installed,
        sessions: listWorkspaceSessions(access),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to read workspace session.' },
      { status: 500 },
    )
  }
}

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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const snapshot = registerWorkspaceSession(access, {
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      phase: typeof body.phase === 'string' ? body.phase : null,
      mode: typeof body.mode === 'string' ? body.mode : null,
      selectedIds: Array.isArray(body.selectedIds)
        ? body.selectedIds.filter((id): id is string => typeof id === 'string')
        : [],
      nodeCount: typeof body.nodeCount === 'number' ? body.nodeCount : 0,
      levelId: typeof body.levelId === 'string' ? body.levelId : null,
      siteId: typeof body.siteId === 'string' ? body.siteId : null,
      cadHelperStatus: typeof body.cadHelperStatus === 'string' ? body.cadHelperStatus : null,
      macHelperStatus: typeof body.macHelperStatus === 'string' ? body.macHelperStatus : null,
      installedModel:
        body.installedModel && typeof body.installedModel === 'object'
          ? (body.installedModel as { provider?: string | null; model?: string | null })
          : getInstalledAiConfigPublicView(readInstalledAiConfig()),
      summary: typeof body.summary === 'string' ? body.summary : null,
      visible: typeof body.visible === 'boolean' ? body.visible : null,
      focusedAt: typeof body.focusedAt === 'number' ? body.focusedAt : null,
    })

    return NextResponse.json(
      { ok: true, session: snapshot },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to register workspace session.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
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
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    }

    const snapshot = touchWorkspaceSession(access, sessionId, {
      phase: typeof body.phase === 'string' ? body.phase : undefined,
      mode: typeof body.mode === 'string' ? body.mode : undefined,
      selectedIds: Array.isArray(body.selectedIds)
        ? body.selectedIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      nodeCount: typeof body.nodeCount === 'number' ? body.nodeCount : undefined,
      levelId: typeof body.levelId === 'string' ? body.levelId : undefined,
      siteId: typeof body.siteId === 'string' ? body.siteId : undefined,
      cadHelperStatus:
        typeof body.cadHelperStatus === 'string' ? body.cadHelperStatus : undefined,
      macHelperStatus:
        typeof body.macHelperStatus === 'string' ? body.macHelperStatus : undefined,
      summary: typeof body.summary === 'string' ? body.summary : undefined,
      visible: typeof body.visible === 'boolean' ? body.visible : undefined,
      focusedAt: typeof body.focusedAt === 'number' ? body.focusedAt : undefined,
    })

    if (!snapshot) {
      return NextResponse.json({ error: 'Workspace session not found.' }, { status: 404 })
    }

    return NextResponse.json(
      { ok: true, session: snapshot },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update workspace session.' },
      { status: 500 },
    )
  }
}
