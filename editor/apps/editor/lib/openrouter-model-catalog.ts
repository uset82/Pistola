export type OpenRouterModelOption = {
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

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const RECOMMENDED_OPENROUTER_IDS = new Set([
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

export const FALLBACK_OPENROUTER_MODELS: OpenRouterModelOption[] = [
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

const isFreeOpenRouterModel = (
  id: string,
  pricing?: { prompt?: string; completion?: string },
) =>
  id === 'openrouter/free' ||
  id.endsWith(':free') ||
  (pricing?.prompt === '0' && pricing?.completion === '0')

export const mapOpenRouterModels = (
  items: Array<{
    id: string
    name?: string
    description?: string
    context_length?: number
    pricing?: {
      prompt?: string
      completion?: string
    }
  }>,
): OpenRouterModelOption[] => {
  const parsedModels = items.map((item) => {
    const id = item.id
    return {
      id,
      name: item.name || id,
      description: item.description?.slice(0, 250) || '',
      contextLength: item.context_length || null,
      isFree: isFreeOpenRouterModel(id, item.pricing),
      isRecommended: RECOMMENDED_OPENROUTER_IDS.has(id),
      pricing: item.pricing
        ? {
            prompt: item.pricing.prompt ?? '0',
            completion: item.pricing.completion ?? '0',
          }
        : undefined,
    }
  })

  parsedModels.sort((a, b) => {
    if (a.id === 'openrouter/free') return -1
    if (b.id === 'openrouter/free') return 1
    if (a.isFree && !b.isFree) return -1
    if (!a.isFree && b.isFree) return 1
    if (a.isRecommended && !b.isRecommended) return -1
    if (!a.isRecommended && b.isRecommended) return 1
    return a.name.localeCompare(b.name)
  })

  return parsedModels
}

export const fetchOpenRouterModelCatalog = async ({
  baseUrl = DEFAULT_OPENROUTER_BASE_URL,
  apiKey,
  signal,
}: {
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
} = {}): Promise<OpenRouterModelOption[]> => {
  const normalized = (baseUrl || DEFAULT_OPENROUTER_BASE_URL).trim().replace(/\/+$/u, '')
  const headers: Record<string, string> = {}
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  const response = await fetch(`${normalized}/models`, {
    headers,
    cache: 'no-store',
    signal,
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

  return mapOpenRouterModels(raw.data)
}
