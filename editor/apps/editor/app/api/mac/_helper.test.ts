import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  getMacHelperRuntimeMode,
  resolveBundledMacHelperScript,
  shouldAutoStartManagedMacHelper,
} from './_helper'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(currentDirectory, '..', '..', '..', '..', '..')

test('MAC runtime defaults to mock on loopback when Multi-Agent-CAD is not installed', () => {
  assert.equal(
    getMacHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_MAC_HELPER_URL: 'http://127.0.0.1:7879',
    } as NodeJS.ProcessEnv),
    'mock',
  )
})

test('MAC runtime stays python when a MAC clone is configured', () => {
  assert.equal(
    getMacHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_MAC_HELPER_URL: 'http://127.0.0.1:7879',
      PISTOLA_MAC_HELPER_RUNTIME: 'python',
    } as NodeJS.ProcessEnv),
    'python',
  )
})

test('bundled mock MAC helper is discoverable for hosted Sites/Canner', () => {
  assert.equal(
    resolveBundledMacHelperScript(workspaceRoot),
    path.join(workspaceRoot, 'tooling', 'mac-helper', 'server.mjs'),
  )
  assert.equal(
    shouldAutoStartManagedMacHelper({
      NODE_ENV: 'test',
      PISTOLA_MAC_HELPER_URL: 'http://127.0.0.1:7879',
    } as NodeJS.ProcessEnv),
    true,
  )
})

test('in-process mock MAC helper handles health check and part generation', async () => {
  const { fetchMacHelper } = await import('./_helper')
  const previousRuntime = process.env.PISTOLA_MAC_HELPER_RUNTIME
  process.env.PISTOLA_MAC_HELPER_RUNTIME = 'mock'

  try {
    const healthResponse = await fetchMacHelper('/health')
    assert.equal(healthResponse.status, 200)
    const healthPayload = await healthResponse.json()
    assert.equal(healthPayload.status, 'ready')
    assert.equal(healthPayload.runtime, 'mock')
    assert.equal(healthPayload.engine, 'mac-mock')

    const createJobResponse = await fetchMacHelper('/v1/mac/jobs', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'gear with 12 teeth',
      }),
    })
    assert.equal(createJobResponse.status, 200)
    const jobPayload = await createJobResponse.json()
    assert.ok(jobPayload.jobId)

    const getJobResponse = await fetchMacHelper(`/v1/mac/jobs/${jobPayload.jobId}`)
    assert.equal(getJobResponse.status, 200)
    const jobDetail = await getJobResponse.json()
    assert.equal(jobDetail.status, 'succeeded')
    assert.ok(jobDetail.result.artifacts.cadUrl)
  } finally {
    process.env.PISTOLA_MAC_HELPER_RUNTIME = previousRuntime
  }
})

