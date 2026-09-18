import { requireRouteAuthSession } from '@/lib/auth/route'
import {
  getWorkspaceSession,
  subscribeWorkspaceSession,
  takePendingWorkspaceCommands,
} from '@/lib/workspace-bridge'

export async function GET(request: Request) {
  const auth = await requireRouteAuthSession()
  if (auth.response) {
    return auth.response
  }

  const access = {
    ownerUserId: auth.session.user.id,
    isLocalOperator: auth.isLocalOperator,
  }

  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!getWorkspaceSession(access, sessionId)) {
    return new Response(JSON.stringify({ error: 'Workspace session not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      for (const command of takePendingWorkspaceCommands(access, sessionId)) {
        send('command', command)
      }

      send('ready', { sessionId, at: Date.now() })

      const seenCommandIds = new Set<string>()
      const unsubscribe = subscribeWorkspaceSession(access, sessionId, (event) => {
        if (event.type === 'command') {
          if (seenCommandIds.has(event.command.id)) return
          seenCommandIds.add(event.command.id)
          send('command', event.command)
          return
        }
        if (event.type === 'session') {
          send('session', event.snapshot)
          return
        }
        if (event.type === 'result') {
          send('result', event.result)
          return
        }
        send('heartbeat', { at: Date.now() })
      })

      const heartbeat = setInterval(() => {
        send('heartbeat', { at: Date.now() })
      }, 15_000)

      const close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      request.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
