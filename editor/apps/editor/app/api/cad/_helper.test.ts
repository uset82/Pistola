import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  getCadHelperRuntimeMode,
  isLoopbackCadHelperUrl,
  resolveBundledCadHelperScript,
  resolvePythonCadHelperDirectory,
  shouldAutoStartManagedCadHelper,
} from './_helper'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(currentDirectory, '..', '..', '..', '..', '..')

test('loopback helper URLs are treated as locally managed candidates', () => {
  assert.equal(isLoopbackCadHelperUrl('http://127.0.0.1:7878'), true)
  assert.equal(isLoopbackCadHelperUrl('http://localhost:7878'), true)
  assert.equal(isLoopbackCadHelperUrl('https://cad.example.com'), false)
})

test('runtime mode defaults to mock on local loopback when FreeCAD is missing', () => {
  assert.equal(
    getCadHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_CAD_HELPER_URL: 'http://127.0.0.1:7878',
      FREECAD_PATH: 'D:\\missing-freecad\\FreeCADCmd.exe',
    } as NodeJS.ProcessEnv),
    'mock',
  )
})

test('runtime mode stays python on local loopback when FreeCADCmd is configured', () => {
  assert.equal(
    getCadHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_CAD_HELPER_URL: 'http://127.0.0.1:7878',
      PISTOLA_CAD_HELPER_RUNTIME: 'python',
    } as NodeJS.ProcessEnv),
    'python',
  )
})

test('runtime mode defaults to external for remote helper URLs', () => {
  assert.equal(
    getCadHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_CAD_HELPER_URL: 'https://cad.example.com',
    } as NodeJS.ProcessEnv),
    'external',
  )
})

test('explicit mock and external runtime modes override the default selection', () => {
  assert.equal(
    getCadHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_CAD_HELPER_URL: 'http://127.0.0.1:7878',
      PISTOLA_CAD_HELPER_RUNTIME: 'mock',
    } as NodeJS.ProcessEnv),
    'mock',
  )
  assert.equal(
    shouldAutoStartManagedCadHelper({
      NODE_ENV: 'test',
      PISTOLA_CAD_HELPER_URL: 'http://127.0.0.1:7878',
      PISTOLA_CAD_HELPER_RUNTIME: 'external',
    } as NodeJS.ProcessEnv),
    false,
  )
})

test('helper discovery resolves the canonical python helper and optional bundled mock helper', () => {
  const pythonHelperDirectory = resolvePythonCadHelperDirectory(workspaceRoot)
  const bundledHelperScript = resolveBundledCadHelperScript(workspaceRoot)

  assert.equal(
    pythonHelperDirectory,
    path.resolve(workspaceRoot, 'tooling', 'freecad-helper'),
  )
  assert.equal(
    bundledHelperScript,
    path.join(workspaceRoot, 'tooling', 'cad-helper', 'server.mjs'),
  )
})

test('in-process mock CAD helper handles health check and jobs without child process', async () => {
  const { fetchCadHelper } = await import('./_helper')
  const previousRuntime = process.env.PISTOLA_CAD_HELPER_RUNTIME
  process.env.PISTOLA_CAD_HELPER_RUNTIME = 'mock'

  try {
    const healthResponse = await fetchCadHelper('/health')
    assert.equal(healthResponse.status, 200)
    const healthPayload = await healthResponse.json()
    assert.equal(healthPayload.status, 'ready')
    assert.equal(healthPayload.runtime, 'mock')
    assert.equal(healthPayload.engine, 'mock-freecad')

    const createJobResponse = await fetchCadHelper('/v1/cad/jobs', {
      method: 'POST',
      body: JSON.stringify({
        type: 'sketch_to_solid',
        payload: {
          sketch: { id: 'sketch-1', entities: [] },
          depth: 2.5,
        },
      }),
    })
    assert.equal(createJobResponse.status, 200)
    const jobPayload = await createJobResponse.json()
    assert.ok(jobPayload.jobId)

    const getJobResponse = await fetchCadHelper(`/v1/cad/jobs/${jobPayload.jobId}`)
    assert.equal(getJobResponse.status, 200)
    const jobDetail = await getJobResponse.json()
    assert.equal(jobDetail.status, 'succeeded')
    assert.equal(jobDetail.result.preview.primitive, 'box')
  } finally {
    process.env.PISTOLA_CAD_HELPER_RUNTIME = previousRuntime
  }
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

async function withRecordingHelper(
  run: (helperUrl: string, received: Array<string | undefined>) => Promise<void>,
) {
  const { createServer } = await import('node:http')
  const received: Array<string | undefined> = []
  const server = createServer((request, response) => {
    received.push(request.headers.authorization)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        status: 'ready',
        runtime: 'python',
        engine: 'solidcraft',
        version: 'test',
        helperUrl: '',
      }),
    )
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  try {
    await run(`http://127.0.0.1:${port}`, received)
  } finally {
    server.closeAllConnections?.()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('helper requests carry the shared bearer token when one is configured', async () => {
  const { fetchCadHelper } = await import('./_helper')
  const previous = {
    url: process.env.PISTOLA_CAD_HELPER_URL,
    runtime: process.env.PISTOLA_CAD_HELPER_RUNTIME,
    token: process.env.PISTOLA_CAD_HELPER_TOKEN,
  }

  await withRecordingHelper(async (helperUrl, received) => {
    process.env.PISTOLA_CAD_HELPER_URL = helperUrl
    process.env.PISTOLA_CAD_HELPER_RUNTIME = 'external'
    process.env.PISTOLA_CAD_HELPER_TOKEN = 'test-token'

    try {
      const response = await fetchCadHelper('/v1/cad/jobs', {
        method: 'POST',
        body: JSON.stringify({ type: 'list_commands', payload: {} }),
      })

      assert.equal(response.status, 200)
      // The reachability probe hits /health unauthenticated; the proxied
      // request must carry the token.
      assert.deepEqual(received, [undefined, 'Bearer test-token'])
    } finally {
      restoreEnv('PISTOLA_CAD_HELPER_URL', previous.url)
      restoreEnv('PISTOLA_CAD_HELPER_RUNTIME', previous.runtime)
      restoreEnv('PISTOLA_CAD_HELPER_TOKEN', previous.token)
    }
  })
})

test('helper requests stay unauthenticated when no token is configured', async () => {
  const { fetchCadHelper } = await import('./_helper')
  const previous = {
    url: process.env.PISTOLA_CAD_HELPER_URL,
    runtime: process.env.PISTOLA_CAD_HELPER_RUNTIME,
    token: process.env.PISTOLA_CAD_HELPER_TOKEN,
  }

  await withRecordingHelper(async (helperUrl, received) => {
    process.env.PISTOLA_CAD_HELPER_URL = helperUrl
    process.env.PISTOLA_CAD_HELPER_RUNTIME = 'external'
    delete process.env.PISTOLA_CAD_HELPER_TOKEN

    try {
      const response = await fetchCadHelper('/v1/cad/jobs/cadjob_1')

      assert.equal(response.status, 200)
      assert.deepEqual(received, [undefined, undefined])
    } finally {
      restoreEnv('PISTOLA_CAD_HELPER_URL', previous.url)
      restoreEnv('PISTOLA_CAD_HELPER_RUNTIME', previous.runtime)
      restoreEnv('PISTOLA_CAD_HELPER_TOKEN', previous.token)
    }
  })
})

