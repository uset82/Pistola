import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, test } from 'node:test'
import { createBridgeDriver } from './bridge.ts'

const state = { connected: true, streamConnected: true, result: null as unknown }
let server: Server

const reply = (response: import('node:http').ServerResponse, body: unknown) => {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

before(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fake')
    if (url.pathname === '/api/workspace/session') {
      return reply(response, {
        connected: state.connected,
        session: state.connected ? { sessionId: 's1' } : undefined,
        sessions: [{ sessionId: 's1', streamConnected: state.streamConnected }],
      })
    }
    if (url.pathname === '/api/workspace/command' && request.method === 'POST') {
      return reply(response, { ok: true, sessionId: 's1', command: { id: 'c1' } })
    }
    if (url.pathname === '/api/workspace/command') {
      return reply(response, state.result ? { pending: false, result: state.result } : { pending: true })
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.PISTOLA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.PISTOLA_OPEN_BROWSER = '0'
})

after(() => server.close())

beforeEach(() => {
  state.connected = true
  state.streamConnected = true
  state.result = null
})

test('open fails with instructions when no tab is registered', async () => {
  state.connected = false
  const driver = await createBridgeDriver()
  await assert.rejects(driver.open({ launch: true }), /No Pistola tab is open\. Open http:\/\/127\.0\.0\.1:\d+\/workspace/)
})

test('screenshot returns the image the tab reported under output', async () => {
  state.result = { ok: true, output: { mime: 'image/png', dataUrl: 'data:image/png;base64,QUJD' } }
  const driver = await createBridgeDriver()
  assert.deepEqual(await driver.screenshot(), { mime: 'image/png', data: 'QUJD' })
})

test('a failed page command surfaces its error', async () => {
  state.result = { ok: false, errors: ['Unknown pistola method "nope".'] }
  const driver = await createBridgeDriver()
  await assert.rejects(driver.invoke('nope'), /Unknown pistola method "nope"/)
})

test('a command fails fast when the tab loses its stream', { timeout: 30_000 }, async () => {
  state.streamConnected = false
  const driver = await createBridgeDriver()
  await assert.rejects(driver.invoke('manual'), /closed or lost its connection/)
})

test('an unreachable editor points at dev:editor', async () => {
  const previous = process.env.PISTOLA_BASE_URL
  process.env.PISTOLA_BASE_URL = 'http://127.0.0.1:9'
  try {
    const driver = await createBridgeDriver()
    await assert.rejects(driver.open(), /bun run dev:editor/)
  } finally {
    process.env.PISTOLA_BASE_URL = previous
  }
})
