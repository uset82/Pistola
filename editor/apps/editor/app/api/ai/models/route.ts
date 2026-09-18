import { NextResponse } from 'next/server'
import {
  DEFAULT_INSTALLED_OPENROUTER_BASE_URL,
  readInstalledAiConfig,
} from '@/lib/installed-ai-config'

export type ModelOption = {
  id: string
  name: string
  description?: string
  contextLength?: number | null
  isFree: boolean
  isRecommended?: boolean
  pricing?: {
    prompt: string
    completion: string
  }
}

// In-memory cache for OpenRouter models (10 minutes)
let openRouterCache: {
  models: ModelOption[]
  timestamp: number
} | null = null

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Curated fallbacks in case OpenRouter is unreachable
const FALLBACK_OPENROUTER_MODELS: ModelOption[] = [
  {
    id: 'openrouter/free',
    name: 'OpenRouter: Free Models Router',
    description: 'Auto-routes requests to the best available free model on OpenRouter.',
    contextLength: 200000,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Meta: Llama 3.3 70B Instruct (free)',
    description: 'High quality open weights model by Meta, free on OpenRouter.',
    contextLength: 131072,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Google: Gemini 2.0 Flash Experimental (free)',
    description: 'Next-gen multimodal model by Google, fast and free.',
    contextLength: 1048576,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'deepseek/deepseek-chat:free',
    name: 'DeepSeek: DeepSeek V3 (free)',
    description: 'Powerful reasoning and coding model by DeepSeek.',
    contextLength: 64000,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek: DeepSeek R1 (free)',
    description: 'DeepSeek flagship reasoning model, free tier.',
    contextLength: 64000,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: 'Qwen: Qwen 2.5 Coder 32B (free)',
    description: 'Specialized code generation model by Alibaba.',
    contextLength: 32768,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'mistralai/mistral-small-24b-instruct-2501:free',
    name: 'Mistral: Mistral Small 24B (free)',
    description: 'Fast, efficient instruction-following model by Mistral.',
    contextLength: 32768,
    isFree: true,
    isRecommended: true,
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Anthropic: Claude 3.7 Sonnet',
    description: 'State of the art hybrid reasoning and coding model by Anthropic.',
    contextLength: 200000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Anthropic: Claude 3.5 Sonnet',
    description: 'Industry-leading code and CAD instruction execution model.',
    contextLength: 200000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'openai/gpt-4o',
    name: 'OpenAI: GPT-4o',
    description: 'Flagship multimodal high-speed model by OpenAI.',
    contextLength: 128000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o Mini',
    description: 'Fast, cost-efficient model for lightweight tasks.',
    contextLength: 128000,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Google: Gemini 2.5 Flash',
    description: 'Fast, low-latency reasoning and coding from Google.',
    contextLength: 1048576,
    isFree: false,
    isRecommended: true,
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek: DeepSeek V3',
    description: 'High performance coding and reasoning model at low cost.',
    contextLength: 64000,
    isFree: false,
    isRecommended: true,
  },
]

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

const RECOMMENDED_OPENROUTER_IDS = new Set([
  'openrouter/free',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-r1',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-coder-32b-instruct:free',
])

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider') || 'openrouter'
    const forceRefresh = searchParams.get('forceRefresh') === '1'

    if (provider === 'openai') {
      return NextResponse.json({
        ok: true,
        provider: 'openai',
        count: OPENAI_MODELS.length,
        freeCount: 0,
        models: OPENAI_MODELS,
      })
    }

    // OpenRouter models
    const now = Date.now()
    if (!forceRefresh && openRouterCache && now - openRouterCache.timestamp < CACHE_TTL_MS) {
      const freeCount = openRouterCache.models.filter((m) => m.isFree).length
      return NextResponse.json({
        ok: true,
        provider: 'openrouter',
        cached: true,
        count: openRouterCache.models.length,
        freeCount,
        models: openRouterCache.models,
      })
    }

    const installed = readInstalledAiConfig()
    const baseUrl = (
      installed?.baseUrl || DEFAULT_INSTALLED_OPENROUTER_BASE_URL
    )
      .trim()
      .replace(/\/+$/u, '')
    const apiKey = installed?.apiKey?.trim() || ''

    try {
      const headers: Record<string, string> = {}
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`
      }

      const response = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw new Error(`OpenRouter returned status ${response.status}`)
      }

      const raw = (await response.json()) as {
        data?: Array<{
          id: string
          name?: string
          description?: string
          context_length?: number
          pricing?: {
            prompt?: string
            completion?: string
          }
        }>
      }

      if (!Array.isArray(raw.data) || raw.data.length === 0) {
        throw new Error('Invalid or empty models data from OpenRouter')
      }

      // Map and sort models:
      // 1. openrouter/free first
      // 2. Free models
      // 3. Recommended models
      // 4. Other models alphabetically
      const parsedModels: ModelOption[] = raw.data.map((item) => {
        const id = item.id
        const isFree =
          id === 'openrouter/free' ||
          id.endsWith(':free') ||
          (item.pricing?.prompt === '0' && item.pricing?.completion === '0')

        return {
          id,
          name: item.name || id,
          description: item.description?.slice(0, 250) || '',
          contextLength: item.context_length || null,
          isFree,
          isRecommended: RECOMMENDED_OPENROUTER_IDS.has(id),
          pricing: item.pricing
            ? {
                prompt: item.pricing.prompt ?? '0',
                completion: item.pricing.completion ?? '0',
              }
            : undefined,
        }
      })

      // Sort: openrouter/free first, then free models, then recommended, then name
      parsedModels.sort((a, b) => {
        if (a.id === 'openrouter/free') return -1
        if (b.id === 'openrouter/free') return 1
        if (a.isFree && !b.isFree) return -1
        if (!a.isFree && b.isFree) return 1
        if (a.isRecommended && !b.isRecommended) return -1
        if (!a.isRecommended && b.isRecommended) return 1
        return a.name.localeCompare(b.name)
      })

      openRouterCache = {
        models: parsedModels,
        timestamp: now,
      }

      const freeCount = parsedModels.filter((m) => m.isFree).length

      return NextResponse.json({
        ok: true,
        provider: 'openrouter',
        cached: false,
        count: parsedModels.length,
        freeCount,
        models: parsedModels,
      })
    } catch (networkError) {
      console.warn('Failed to fetch live OpenRouter models, returning fallback list:', networkError)
      return NextResponse.json({
        ok: true,
        provider: 'openrouter',
        cached: false,
        fallback: true,
        count: FALLBACK_OPENROUTER_MODELS.length,
        freeCount: FALLBACK_OPENROUTER_MODELS.filter((m) => m.isFree).length,
        models: FALLBACK_OPENROUTER_MODELS,
      })
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve AI models.',
      },
      { status: 500 },
    )
  }
}
