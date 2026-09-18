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
