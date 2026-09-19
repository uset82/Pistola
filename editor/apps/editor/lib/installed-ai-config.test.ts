import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  applyInstalledAiConfigToEnv,
  mergeInstalledAiConfigUpdate,
  type InstalledAiConfig,
} from './installed-ai-config'

test('applyInstalledAiConfigToEnv lets the installed model override stale env models', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pistola-ai-config-'))
  try {
    writeFileSync(
      path.join(dir, '.pistola-ai.local.json'),
      JSON.stringify({
        provider: 'openrouter',
        apiKey: 'sk-or-test',
        model: 'openrouter/free',
        baseUrl: 'https://openrouter.ai/api/v1',
      }),
    )

    const env = applyInstalledAiConfigToEnv(
      {
        PISTOLA_ASSISTANT_MODEL: 'stealth/union-alpha',
        PISTOLA_CAD_MODEL: 'stealth/union-alpha',
        PISTOLA_ASSISTANT_AI_BASE_URL: 'https://example.invalid/v1',
      },
      dir,
    )

    assert.equal(env.OPENROUTER_API_KEY, 'sk-or-test')
    assert.equal(env.PISTOLA_ASSISTANT_MODEL, 'openrouter/free')
    assert.equal(env.PISTOLA_CAD_MODEL, 'openrouter/free')
    assert.equal(env.PISTOLA_ASSISTANT_AI_BASE_URL, 'https://openrouter.ai/api/v1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const stored: InstalledAiConfig = {
  provider: 'openrouter',
  apiKey: 'sk-or-v1-stored',
  model: 'openrouter/free',
  baseUrl: 'https://gateway.example.com/api/v1',
}

test('switching model keeps the stored key and custom base URL', () => {
  const merged = mergeInstalledAiConfigUpdate(stored, { model: 'deepseek/deepseek-chat' }, {})
  assert.deepEqual(merged, { ...stored, model: 'deepseek/deepseek-chat' })
})

test('sending the same provider without a key keeps the stored key', () => {
  const merged = mergeInstalledAiConfigUpdate(
    stored,
    { provider: 'openrouter', model: 'openai/gpt-4o', baseUrl: '' },
    {},
  )
  assert.deepEqual(merged, { ...stored, model: 'openai/gpt-4o' })
})

test('switching provider drops the previous provider settings', () => {
  const merged = mergeInstalledAiConfigUpdate(stored, { provider: 'openai', apiKey: 'sk-openai' }, {})
  assert.deepEqual(merged, { provider: 'openai', apiKey: 'sk-openai', model: '', baseUrl: '' })
})

test('switching provider without a key uses only that provider env key', () => {
  assert.deepEqual(
    mergeInstalledAiConfigUpdate(stored, { provider: 'openai' }, { OPENROUTER_API_KEY: 'sk-or-env' }),
    { error: 'apiKey is required.' },
  )
  const merged = mergeInstalledAiConfigUpdate(stored, { provider: 'openai' }, { OPENAI_API_KEY: 'sk-env' })
  assert.equal('error' in merged ? null : merged.apiKey, 'sk-env')
})

test('first save without any key is rejected', () => {
  assert.deepEqual(mergeInstalledAiConfigUpdate(null, { model: 'openrouter/free' }, {}), {
    error: 'apiKey is required.',
  })
})
