import { NextResponse } from 'next/server'
import {
  DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
  readInstalledAiConfig,
} from '@/lib/installed-ai-config'
import { pistolaCorsPreflight, withPistolaCors } from '@/lib/http/cors'
import {
  FALLBACK_OPENROUTER_MODELS,
  fetchOpenRouterModelCatalog,
  fetchOpenRouterModelCount,
  type OpenRouterModelOption,
} from '@/lib/openrouter-model-catalog'

export type ModelOption = OpenRouterModelOption

let openRouterCache: {
  models: ModelOption[]
  timestamp: number
  catalogCount: number
} | null = null

const CACHE_TTL_MS = 60 * 1000
const CACHE_REVALIDATE_MS = 10 * 60 * 1000
const CACHE_MAX_MS = 24 * 60 * 60 * 1000

const OPENAI_MODELS: ModelOption[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Flagship high-intelligence multimodal model for general tasks.',
    contextLength: 128000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast, lightweight and cost-effective model.',
    contextLength: 128000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'o1',
    name: 'o1',
    description: 'Advanced reasoning model for complex math, code, and CAD logic.',
    contextLength: 200000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    description: 'High-speed reasoning model tailored for math and coding.',
    contextLength: 200000,
    isFree: false,
    isRecommended: true,
  },
]

export const OPTIONS = pistolaCorsPreflight

export async function GET(request: Request) {
  const json = (body: unknown, init?: ResponseInit) =>
    withPistolaCors(request, NextResponse.json(body, init))

  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') || 'openrouter'
    const forceRefresh = searchParams.get('forceRefresh') === '1'

    if (provider === 'openai') {
      return json({
        ok: true,
        provider: 'openai',
        count: OPENAI_MODELS.length,
        freeCount: 0,
        models: OPENAI_MODELS,
      })
    }

    const now = Date.now()
    const installed = readInstalledAiConfig()
    const baseUrl = (installed?.baseUrl || DEFAULT_INSTALLED_OPENROUTER_BASE_URL)
      .trim()
      .replace(/\/+$/u, '')
    const apiKey = installed?.apiKey?.trim() || ''

    if (!forceRefresh && openRouterCache) {
      const age = now - openRouterCache.timestamp
      if (age < CACHE_TTL_MS) {
        return json({
          ok: true,
          provider: 'openrouter',
          cached: true,
          count: openRouterCache.models.length,
          freeCount: openRouterCache.models.filter((model) => model.isFree).length,
          updatedAt: openRouterCache.timestamp,
          models: openRouterCache.models,
        })
      }

      try {
        const liveCount = await fetchOpenRouterModelCount({
          baseUrl,
          apiKey,
          signal: AbortSignal.timeout(8_000),
        })
        if (liveCount === openRouterCache.catalogCount && age < CACHE_REVALIDATE_MS) {
          return json({
            ok: true,
            provider: 'openrouter',
            cached: true,
            count: openRouterCache.models.length,
            freeCount: openRouterCache.models.filter((model) => model.isFree).length,
            updatedAt: openRouterCache.timestamp,
            models: openRouterCache.models,
          })
        }
      } catch {
        if (age < CACHE_MAX_MS) {
          return json({
            ok: true,
            provider: 'openrouter',
            cached: true,
            count: openRouterCache.models.length,
            freeCount: openRouterCache.models.filter((model) => model.isFree).length,
            updatedAt: openRouterCache.timestamp,
            models: openRouterCache.models,
          })
        }
      }
    }

    try {
      const parsedModels = await fetchOpenRouterModelCatalog({
        baseUrl,
        apiKey,
        signal: AbortSignal.timeout(20_000),
      })
      const catalogCount = await fetchOpenRouterModelCount({
        baseUrl,
        apiKey,
        signal: AbortSignal.timeout(8_000),
      }).catch(() => parsedModels.length)

      openRouterCache = {
        models: parsedModels,
        timestamp: now,
        catalogCount,
      }

      return json({
        ok: true,
        provider: 'openrouter',
        cached: false,
        count: parsedModels.length,
        freeCount: parsedModels.filter((model) => model.isFree).length,
        updatedAt: now,
        models: parsedModels,
      })
    } catch (networkError) {
      console.warn('Failed to fetch live OpenRouter models, returning fallback list:', networkError)
      if (openRouterCache) {
        return json({
          ok: true,
          provider: 'openrouter',
          cached: true,
          count: openRouterCache.models.length,
          freeCount: openRouterCache.models.filter((model) => model.isFree).length,
          updatedAt: openRouterCache.timestamp,
          models: openRouterCache.models,
        })
      }
      return json({
        ok: true,
        provider: 'openrouter',
        cached: false,
        fallback: true,
        count: FALLBACK_OPENROUTER_MODELS.length,
        freeCount: FALLBACK_OPENROUTER_MODELS.filter((model) => model.isFree).length,
        models: FALLBACK_OPENROUTER_MODELS,
      })
    }
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve AI models.',
      },
      { status: 500 },
    )
  }
}
