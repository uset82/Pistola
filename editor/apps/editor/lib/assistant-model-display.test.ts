import assert from 'node:assert/strict'
import test from 'node:test'

import {
  describeModelName,
  formatContextLength,
  formatModelPrice,
  groupAssistantModels,
} from './assistant-model-display'
import type { OpenRouterModelOption } from './openrouter-model-catalog'

const models: OpenRouterModelOption[] = [
  { id: 'openrouter/free', name: 'Free Models Router', isFree: true, isRecommended: true },
  { id: 'cohere/north-mini-code:free', name: 'Cohere: North Mini Code (free)', isFree: true },
  {
    id: 'openai/gpt-4o',
    name: 'OpenAI: GPT-4o',
    isFree: false,
    isRecommended: true,
    pricing: { prompt: '0.0000025', completion: '0.00001' },
  },
  { id: 'acme/paid-model', name: 'Acme: Paid Model', isFree: false },
]

test('describeModelName splits vendor prefixes and drops the free suffix', () => {
  assert.deepEqual(describeModelName(models[1]!), { title: 'North Mini Code', vendor: 'Cohere' })
  assert.deepEqual(describeModelName(models[0]!), { title: 'Free router', vendor: 'OpenRouter' })
  assert.deepEqual(describeModelName({ id: 'custom/some-model' }), {
    title: 'some-model',
    vendor: null,
  })
})

test('formatContextLength rounds to k and M', () => {
  assert.equal(formatContextLength(200_000), '200k')
  assert.equal(formatContextLength(1_048_576), '1M')
  assert.equal(formatContextLength(null), null)
})

test('formatModelPrice shows dollars per million tokens', () => {
  assert.equal(formatModelPrice(models[0]!), 'free')
  assert.equal(formatModelPrice(models[2]!), '$2.5/$10')
  assert.equal(formatModelPrice(models[3]!), 'paid')
})

test('groupAssistantModels keeps pinned models first and filters the rest', () => {
  const free = groupAssistantModels({
    models,
    filter: 'free',
    query: '',
    pinnedIds: ['openrouter/free'],
  })
  assert.deepEqual(
    free.map((group) => [group.id, group.models.map((model) => model.id)]),
    [
      ['pinned', ['openrouter/free']],
      ['free', ['cohere/north-mini-code:free']],
    ],
  )

  const all = groupAssistantModels({ models, filter: 'all', query: 'acme', pinnedIds: [] })
  assert.deepEqual(
    all.map((group) => [group.id, group.models.map((model) => model.id)]),
    [['paid', ['acme/paid-model']]],
  )

  const recommended = groupAssistantModels({
    models,
    filter: 'recommended',
    query: '',
    pinnedIds: ['openrouter/free'],
  })
  assert.deepEqual(
    recommended.map((group) => group.id),
    ['pinned', 'recommended'],
  )
  assert.deepEqual(
    recommended[1]?.models.map((model) => model.id),
    ['openai/gpt-4o'],
  )
})
