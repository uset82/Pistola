import { appendMcpLog, errorCodeFromText } from './log.ts'

export type McpTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<{
    content: { type: string; text?: string; data?: string; mimeType?: string }[]
    isError?: boolean
  }>
}

const jsonSchemaFromZodShape = (shape: Record<string, unknown> | undefined) => ({
  type: 'object',
  properties: Object.fromEntries(
    Object.entries(shape ?? {}).map(([key, value]) => [
      key,
      (value as { _def?: { typeName?: string } })?._def?.typeName === 'ZodBoolean'
        ? { type: 'boolean' }
        : (value as { _def?: { typeName?: string } })?._def?.typeName === 'ZodNumber'
          ? { type: 'number' }
          : (value as { _def?: { typeName?: string } })?._def?.typeName === 'ZodArray'
            ? { type: 'array', items: { type: 'object' } }
            : { type: 'object' },
    ]),
  ),
})

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

type JsonRpcMessage = {
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

export const createStdioServer = (tools: McpTool[]) => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  let buffer = Buffer.alloc(0)
  // MCP stdio is one JSON message per line; Content-Length framing is kept only for legacy clients.
  let framing: 'newline' | 'content-length' = 'newline'

  const write = (message: unknown) => {
    const json = JSON.stringify(message)
    if (framing === 'content-length') {
      process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`)
      return
    }
    process.stdout.write(`${json}\n`)
  }

  const handle = async (message: JsonRpcMessage) => {
    if (!message.method) return
    if (message.method === 'initialize') {
      const requested = String(message.params?.protocolVersion ?? '')
      const clientInfo = (message.params?.clientInfo ?? {}) as { name?: unknown; version?: unknown }
      await appendMcpLog({
        ts: new Date().toISOString(),
        tool: 'initialize',
        ok: true,
        error: null,
        code: null,
        ms: 0,
        client: `${String(clientInfo.name ?? 'unknown')}@${String(clientInfo.version ?? '?')} protocol=${requested || '?'} framing=${framing}`,
      })
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'pistola', version: '0.2.0' },
        },
      })
      return
    }
    if (message.method === 'ping') {
      write({ jsonrpc: '2.0', id: message.id, result: {} })
      return
    }
    if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) {
      return
    }
    if (message.method === 'tools/list') {
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      })
      return
    }
    if (message.method === 'tools/call') {
      const name = String(message.params?.name ?? '')
      const tool = byName.get(name)
      if (!tool) {
        await appendMcpLog({
          ts: new Date().toISOString(),
          tool: name,
          ok: false,
          error: `Unknown tool ${name}`,
          code: -32601,
          ms: 0,
        })
        write({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Unknown tool ${name}` },
        })
        return
      }
      const started = Date.now()
      try {
        const result = await tool.handler((message.params?.arguments ?? {}) as Record<string, unknown>)
        await appendMcpLog({
          ts: new Date().toISOString(),
          tool: name,
          ok: result.isError !== true,
          error: result.isError ? result.content.find((item) => item.type === 'text')?.text ?? 'ERROR' : null,
          code: errorCodeFromText(result.content.find((item) => item.type === 'text')?.text, result.isError === true),
          ms: Date.now() - started,
        })
        write({ jsonrpc: '2.0', id: message.id, result })
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        await appendMcpLog({
          ts: new Date().toISOString(),
          tool: name,
          ok: false,
          error: text,
          code: 'THROW',
          ms: Date.now() - started,
        })
        write({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            isError: true,
            content: [{ type: 'text', text }],
          },
        })
      }
      return
    }
    if (message.id !== undefined) {
      write({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Unknown method ${message.method}` },
      })
    }
  }

  const inflight = new Set<Promise<void>>()

  const dispatch = (body: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      return
    }
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      const pending = handle(message as JsonRpcMessage).finally(() => inflight.delete(pending))
      inflight.add(pending)
    }
  }

  const drain = () => {
    while (buffer.length > 0) {
      const lead = buffer.subarray(0, 32).toString('utf8').trimStart()
      if (/^content-length:/i.test(lead)) {
        framing = 'content-length'
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd < 0) return
        const match = buffer.subarray(0, headerEnd).toString('utf8').match(/Content-Length:\s*(\d+)/i)
        const start = headerEnd + 4
        const length = Number(match?.[1] ?? 0)
        if (buffer.length < start + length) return
        const body = buffer.subarray(start, start + length).toString('utf8')
        buffer = buffer.subarray(start + length)
        dispatch(body)
        continue
      }
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      const line = buffer.subarray(0, newline).toString('utf8').trim()
      buffer = buffer.subarray(newline + 1)
      if (line) dispatch(line)
    }
  }

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    drain()
  })
  process.stdin.on('end', () => {
    void Promise.allSettled([...inflight]).then(() => process.stdout.write('', () => process.exit(0)))
  })

  return { jsonSchemaFromZodShape }
}
