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

export const createStdioServer = (tools: McpTool[]) => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  let buffer = Buffer.alloc(0)

  const write = (message: unknown) => {
    const payload = Buffer.from(JSON.stringify(message), 'utf8')
    process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`)
    process.stdout.write(payload)
  }

  const handle = async (message: {
    id?: number | string
    method?: string
    params?: Record<string, unknown>
  }) => {
    if (!message.method) return
    if (message.method === 'initialize') {
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'pistola', version: '0.2.0' },
        },
      })
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

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = buffer.subarray(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const start = headerEnd + 4
      if (buffer.length < start + length) return
      const body = buffer.subarray(start, start + length).toString('utf8')
      buffer = buffer.subarray(start + length)
      void handle(JSON.parse(body))
    }
  })

  return { jsonSchemaFromZodShape }
}
