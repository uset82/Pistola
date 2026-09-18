import assert from 'node:assert/strict'
import test from 'node:test'

import { mapOpenRouterModels } from './openrouter-model-catalog'

test('maps OpenRouter models and puts free router first', () => {
  const models = mapOpenRouterModels([
    { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '1', completion: '1' } },
    { id: 'openrouter/free', name: 'Free Router' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama free' },
  ])

  assert.equal(models[0]?.id, 'openrouter/free')
  assert.equal(models.find((model) => model.id.endsWith(':free'))?.isFree, true)
  assert.equal(models.find((model) => model.id === 'openai/gpt-4o')?.isFree, false)
})
