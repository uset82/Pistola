import { spawn } from 'node:child_process'

export const createMcpClient = (child) => {
  let nextId = 1
  let buffer = Buffer.alloc(0)
  const pending = new Map()

  const take = () => {
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
      const message = JSON.parse(body)
      const waiter = pending.get(message.id)
      if (waiter) {
        pending.delete(message.id)
        if (message.error) waiter.reject(new Error(message.error.message ?? JSON.stringify(message.error)))
        else waiter.resolve(message.result)
      }
    }
  }

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    take()
  })
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  const send = (method, params) => {
    const id = nextId
    nextId += 1
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }), 'utf8')
    child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`)
    child.stdin.write(payload)
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`MCP timeout: ${method}`))
        }
      }, 180_000)
    })
  }

  return {
    initialize: async () => {
      await send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'pistola-ide-e2e', version: '1.0.0' },
      })
      child.stdin.write(
        `Content-Length: ${Buffer.byteLength('{"jsonrpc":"2.0","method":"notifications/initialized"}')}\r\n\r\n{"jsonrpc":"2.0","method":"notifications/initialized"}`,
      )
    },
    listTools: () => send('tools/list', {}),
    callTool: (name, arguments_) => send('tools/call', { name, arguments: arguments_ ?? {} }),
  }
}

export const parseToolJson = (result) => {
  const text = result?.content?.find((item) => item.type === 'text')?.text
  if (!text) return result
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export const spawnMcpServer = (indexPath, env) =>
  spawn('node', [indexPath], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
