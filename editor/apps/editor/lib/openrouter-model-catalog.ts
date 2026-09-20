export type OpenRouterModelOption = {
  id: string
  name: string
  description?: string
  contextLength?: number | null
  isFree: boolean
  isRecommended?: boolean
  intelligenceIndex?: number | null
  pricing?: {
    prompt: string
    completion: string
  }
}

type OpenRouterCatalogItem = {
  id: string
  name?: string
  description?: string
  context_length?: number
  pricing?: {
    prompt?: string
    completion?: string
  }
  benchmarks?: {
    artificial_analysis?: {
      intelligence_index?: number
    }
  }
}

type OpenRouterModelsResponse = {
  data?: OpenRouterCatalogItem[]
  total_count?: number
  links?: { next?: string | null }
}

type OpenRouterCountResponse = {
  data?: { count?: number }
  count?: number
}

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const CATALOG_PAGE_SIZE = 1000
const CATALOG_PAGE_LIMIT = 25

/** Full catalog, not the default text-only list. */
export const OPENROUTER_CATALOG_QUERY = `output_modalities=all&limit=${CATALOG_PAGE_SIZE}`
export const OPENROUTER_FREE_VARIANT_QUERY = `output_modalities=all&q=free&limit=${CATALOG_PAGE_SIZE}`
export const OPENROUTER_CATALOG_COUNT_QUERY = 'output_modalities=all'

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

const FREE_ROUTER_FALLBACK: OpenRouterCatalogItem = {
  id: 'openrouter/free',
  name: 'OpenRouter: Free Models Router',
  description: 'Auto-routes requests to the best available free model on OpenRouter.',
  context_length: 200000,
  pricing: { prompt: '0', completion: '0' },
}

/** OpenRouter "Free variant" entries, not $0 token prices on billed image/video models. */
export const isFreeOpenRouterModel = (id: string, name?: string) =>
  id === 'openrouter/free' || id.endsWith(':free') || /\(\s*free\s*\)\s*$/i.test(name ?? '')

const readIntelligenceIndex = (item: OpenRouterCatalogItem) => {
  const value = item.benchmarks?.artificial_analysis?.intelligence_index
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const resolveOpenRouterCatalogUrl = (pathOrUrl: string, baseUrl: string) => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const origin = new URL(baseUrl).origin
  return new URL(pathOrUrl, origin).toString()
}

export const mapOpenRouterModels = (items: OpenRouterCatalogItem[]): OpenRouterModelOption[] => {
  const parsedModels = items.map((item) => {
    const id = item.id
    return {
      id,
      name: item.name || id,
      description: item.description?.slice(0, 250) || '',
      contextLength: item.context_length || null,
      isFree: isFreeOpenRouterModel(id, item.name),
      isRecommended: RECOMMENDED_OPENROUTER_IDS.has(id),
      intelligenceIndex: readIntelligenceIndex(item),
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

const catalogHeaders = (apiKey?: string) => {
  const headers: Record<string, string> = {}
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }
  return headers
}

const readModelsResponse = async (response: Response): Promise<OpenRouterModelsResponse> => {
  if (!response.ok) {
    throw new Error(`OpenRouter returned status ${response.status}`)
  }
  return (await response.json()) as OpenRouterModelsResponse
}

const collectCatalogItems = async ({
  startUrl,
  baseUrl,
  headers,
  signal,
  fetcher,
}: {
  startUrl: string
  baseUrl: string
  headers: Record<string, string>
  signal?: AbortSignal
  fetcher: typeof fetch
}) => {
  const collected = new Map<string, OpenRouterCatalogItem>()
  let url = startUrl
  let expected: number | null = null

  for (let page = 0; page < CATALOG_PAGE_LIMIT; page += 1) {
    const raw = await readModelsResponse(
      await fetcher(url, { headers, cache: 'no-store', signal }),
    )
    if (!Array.isArray(raw.data)) {
      throw new Error('Invalid or empty models data from OpenRouter')
    }
    if (typeof raw.total_count === 'number') expected = raw.total_count
    for (const item of raw.data) {
      if (item?.id) collected.set(item.id, item)
    }
    if (!raw.links?.next) break
    url = resolveOpenRouterCatalogUrl(raw.links.next, baseUrl)
  }

  return { collected, expected }
}

export const fetchOpenRouterModelCount = async ({
  baseUrl = DEFAULT_OPENROUTER_BASE_URL,
  apiKey,
  signal,
  fetcher = fetch,
}: {
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
  fetcher?: typeof fetch
} = {}): Promise<number> => {
  const normalized = (baseUrl || DEFAULT_OPENROUTER_BASE_URL).trim().replace(/\/+$/u, '')
  const response = await fetcher(`${normalized}/models/count?${OPENROUTER_CATALOG_COUNT_QUERY}`, {
    headers: catalogHeaders(apiKey),
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    throw new Error(`OpenRouter returned status ${response.status}`)
  }
  const raw = (await response.json()) as OpenRouterCountResponse
  const count = raw.data?.count ?? raw.count
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
    throw new Error('Invalid model count from OpenRouter')
  }
  return count
}

export const fetchOpenRouterModelCatalog = async ({
  baseUrl = DEFAULT_OPENROUTER_BASE_URL,
  apiKey,
  signal,
  fetcher = fetch,
}: {
  baseUrl?: string
  apiKey?: string
  signal?: AbortSignal
  fetcher?: typeof fetch
} = {}): Promise<OpenRouterModelOption[]> => {
  const normalized = (baseUrl || DEFAULT_OPENROUTER_BASE_URL).trim().replace(/\/+$/u, '')
  const headers = catalogHeaders(apiKey)

  const { collected } = await collectCatalogItems({
    startUrl: `${normalized}/models?${OPENROUTER_CATALOG_QUERY}`,
    baseUrl: normalized,
    headers,
    signal,
    fetcher,
  })

  try {
    const freePage = await collectCatalogItems({
      startUrl: `${normalized}/models?${OPENROUTER_FREE_VARIANT_QUERY}`,
      baseUrl: normalized,
      headers,
      signal,
      fetcher,
    })
    for (const [id, item] of freePage.collected) {
      collected.set(id, item)
    }
  } catch {
    // The full catalog is enough when the free-variant query is unavailable.
  }

  if (!collected.has('openrouter/free')) {
    collected.set('openrouter/free', FREE_ROUTER_FALLBACK)
  }

  if (collected.size === 0) {
    throw new Error('Invalid or empty models data from OpenRouter')
  }

  return mapOpenRouterModels([...collected.values()])
}
