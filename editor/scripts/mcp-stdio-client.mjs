import { spawn } from 'node:child_process'

export const createMcpClient = (child) => {
  let nextId = 1
  let buffer = Buffer.alloc(0)
  const pending = new Map()

  const take = () => {
    while (true) {
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      const line = buffer.subarray(0, newline).toString('utf8').trim()
      buffer = buffer.subarray(newline + 1)
      if (!line) continue
      const message = JSON.parse(line)
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
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
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
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pistola-ide-e2e', version: '1.0.0' },
      })
      child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
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
