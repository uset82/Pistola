#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import net from 'node:net'

const port = Number(process.argv[2] ?? 3002)

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

const describeOwner = () => {
  try {
    if (process.platform === 'win32') {
      const line = run('netstat', ['-ano', '-p', 'tcp'])
        .split(/\r?\n/)
        .find((row) => row.includes('LISTENING') && new RegExp(`:${port}\\s`).test(row))
      const pid = line?.trim().split(/\s+/).pop()
      if (!pid) return ''
      const name = run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).split(',')[0]?.replaceAll('"', '').trim()
      return ` by ${name || 'an unknown process'} (PID ${pid})`
    }
    const fields = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']).split('\n')
    const pid = fields.find((field) => field.startsWith('p'))?.slice(1)
    const name = fields.find((field) => field.startsWith('c'))?.slice(1)
    return pid ? ` by ${name ?? 'an unknown process'} (PID ${pid})` : ''
  } catch {
    return ''
  }
}

const server = net.createServer()
server.once('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error
  console.error(`Port ${port} is already in use${describeOwner()}.`)
  console.error(`If that is an earlier Pistola dev server, open http://localhost:${port}/workspace or stop it first.`)
  process.exit(1)
})
server.once('listening', () => server.close())
server.listen(port)
