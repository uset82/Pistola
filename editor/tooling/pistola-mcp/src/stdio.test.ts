import assert from 'node:assert/strict'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts')

const startServer = () => {
  const env = { ...process.env }
  delete env.PISTOLA_MCP_LOG
  return spawn(process.execPath, [serverPath], { env, stdio: ['pipe', 'pipe', 'pipe'] })
}

const readStdout = (child: ChildProcessWithoutNullStreams) => {
  let text = ''
  child.stdout.on('data', (chunk) => {
    text += chunk.toString('utf8')
  })
  return () => text
}

const waitFor = async <T>(probe: () => T | undefined, timeoutMs = 5000): Promise<T> => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = probe()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out after ${timeoutMs} ms`)
}

const newlineReply = (output: () => string, id: number) => () =>
  output()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { id?: number; result?: Record<string, unknown> })
    .find((message) => message.id === id)

const send = (child: ChildProcessWithoutNullStreams, message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stdio-test', version: '1' } },
}

const arraysWithoutItems = (schema: unknown, at = 'inputSchema'): string[] => {
  if (!schema || typeof schema !== 'object') return []
  const record = schema as Record<string, unknown>
  const own = record.type === 'array' && !record.items ? [at] : []
  return [
    ...own,
    ...Object.entries(record).flatMap(([key, value]) => arraysWithoutItems(value, `${at}.${key}`)),
  ]
}

test('answers newline-delimited initialize, tools/list and ping', async () => {
  const child = startServer()
  const output = readStdout(child)
  try {
    send(child, initialize)
    const init = await waitFor(newlineReply(output, 1))
    assert.equal((init.result?.serverInfo as { name?: string }).name, 'pistola')
    assert.equal(init.result?.protocolVersion, '2025-06-18')

    send(child, { jsonrpc: '2.0', method: 'notifications/initialized' })
    send(child, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const list = await waitFor(newlineReply(output, 2))
    const tools = list.result?.tools as { name: string; inputSchema: unknown }[]
    assert.ok(tools.length >= 30, `expected at least 30 tools, got ${tools.length}`)
    assert.deepEqual(
      tools.flatMap((tool) => arraysWithoutItems(tool.inputSchema, tool.name)),
      [],
      'every array schema declares items',
    )

    send(child, { jsonrpc: '2.0', id: 3, method: 'ping' })
    const ping = await waitFor(newlineReply(output, 3))
    assert.deepEqual(ping.result, {})
  } finally {
    child.kill()
  }
})

test('still answers a legacy Content-Length request in the same framing', async () => {
  const child = startServer()
  const output = readStdout(child)
  try {
    const body = JSON.stringify(initialize)
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
    const reply = await waitFor(() => (output().startsWith('Content-Length:') && output().includes('"id":1') ? output() : undefined))
    assert.match(reply, /"name":"pistola"/)
  } finally {
    child.kill()
  }
})

test('exits cleanly when stdin closes', async () => {
  const child = startServer()
  const exited = new Promise<number | null>((resolve) => child.on('exit', resolve))
  send(child, initialize)
  child.stdin.end()
  const code = await Promise.race([exited, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000))])
  assert.equal(code, 0)
})
