import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { applyInstalledAiConfigToEnv } from './installed-ai-config'

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
