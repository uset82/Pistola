import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fetchOpenRouterModelCatalog,
  fetchOpenRouterModelCount,
  isFreeOpenRouterModel,
  mapOpenRouterModels,
  resolveOpenRouterCatalogUrl,
} from './openrouter-model-catalog'

test('maps OpenRouter models and puts free router first', () => {
  const models = mapOpenRouterModels([
    { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '1', completion: '1' } },
    { id: 'openrouter/free', name: 'Free Router' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama free' },
    {
      id: 'anthropic/claude-fable-5.1',
      name: 'Claude Fable 5.1',
      benchmarks: { artificial_analysis: { intelligence_index: 53.4 } },
    },
  ])

  assert.equal(models[0]?.id, 'openrouter/free')
  assert.equal(models.find((model) => model.id.endsWith(':free'))?.isFree, true)
  assert.equal(models.find((model) => model.id === 'openai/gpt-4o')?.isFree, false)
  assert.equal(
    models.find((model) => model.id === 'anthropic/claude-fable-5.1')?.intelligenceIndex,
    53.4,
  )
})

test('treats OpenRouter free variants as free, not zero-priced billed models', () => {
  assert.equal(isFreeOpenRouterModel('inclusionai/ling-3.0-flash-vl:free'), true)
  assert.equal(isFreeOpenRouterModel('openrouter/free'), true)
  assert.equal(isFreeOpenRouterModel('google/lyria-3-pro-preview', 'Google: Lyria 3 Pro Preview'), false)
  assert.equal(
    isFreeOpenRouterModel('black-forest-labs/flux-video-edit', 'Black Forest Labs: FLUX Video Edit'),
    false,
  )
  assert.deepEqual(
    mapOpenRouterModels([
      {
        id: 'black-forest-labs/flux-video-edit',
        name: 'Black Forest Labs: FLUX Video Edit',
        pricing: { prompt: '0', completion: '0' },
      },
      {
        id: 'liquid/lfm-2.5-embedding-350m:free',
        name: 'Liquid: LFM 2.5 Embedding 350M (free)',
        pricing: { prompt: '0', completion: '0' },
      },
    ]).filter((model) => model.isFree).map((model) => model.id),
    ['liquid/lfm-2.5-embedding-350m:free'],
  )
})

test('resolves relative OpenRouter pagination links against the API origin', () => {
  assert.equal(
    resolveOpenRouterCatalogUrl(
      '/api/v1/models?offset=1000&limit=1000&output_modalities=all',
      'https://openrouter.ai/api/v1',
    ),
    'https://openrouter.ai/api/v1/models?offset=1000&limit=1000&output_modalities=all',
  )
})

test('pages through the full OpenRouter catalog and merges free variants', async () => {
  const requests: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.includes('/models/count')) {
      return Response.json({ data: { count: 3 } })
    }
    if (url.includes('q=free')) {
      return Response.json({
        data: [
          { id: 'liquid/lfm-2.5-embedding-350m:free', name: 'Embedding (free)' },
          { id: 'openrouter/free', name: 'Free Router' },
        ],
        total_count: 2,
        links: { next: null },
      })
    }
    if (url.includes('offset=1000')) {
      return Response.json({
        data: [{ id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '1', completion: '1' } }],
        total_count: 2,
        links: { next: null },
      })
    }
    return Response.json({
      data: [{ id: 'acme/text-only', name: 'Text Only', pricing: { prompt: '1', completion: '1' } }],
      total_count: 2,
      links: { next: '/api/v1/models?offset=1000&limit=1000&output_modalities=all' },
    })
  }

  const models = await fetchOpenRouterModelCatalog({
    baseUrl: 'https://openrouter.ai/api/v1',
    fetcher,
  })

  assert.ok(requests.some((url) => url.includes('output_modalities=all')))
  assert.ok(requests.some((url) => url.includes('offset=1000')))
  assert.ok(requests.some((url) => url.includes('q=free')))
  assert.deepEqual(
    models.map((model) => model.id),
    ['openrouter/free', 'liquid/lfm-2.5-embedding-350m:free', 'openai/gpt-4o', 'acme/text-only'],
  )
  assert.equal(await fetchOpenRouterModelCount({ fetcher }), 3)
})
