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

test('runtime mode defaults to python on local loopback helper URLs', () => {
  assert.equal(
    getCadHelperRuntimeMode({
      NODE_ENV: 'test',
      PISTOLA_CAD_HELPER_URL: 'http://127.0.0.1:7878',
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
