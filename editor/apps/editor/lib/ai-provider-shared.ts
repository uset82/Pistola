import OpenAI from 'openai'
import { applyInstalledAiConfigToEnv } from './installed-ai-config'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_OPENROUTER_RESPONSES_URL = 'https://openrouter.ai/api/v1/responses'

export type SharedAiProvider = 'fallback' | 'openai' | 'openrouter'
export type SharedRemoteAiProvider = Exclude<SharedAiProvider, 'fallback'>
export type AiProviderName = SharedRemoteAiProvider | 'codex'
export type AiFailureKind = 'config' | 'timeout' | 'validation' | 'provider' | 'execution' | 'unknown'

type SharedAiFallbackConfig = {
  provider: 'fallback'
}

export type SharedOpenAiConfig = {
  provider: 'openai'
  apiKey: string
  model: string
  responsesUrl: string
}

export type SharedOpenRouterConfig = {
  provider: 'openrouter'
  apiKey: string
  model: string
  serverUrl?: string
  httpReferer?: string
  title?: string
}

export type SharedAiConfig =
  | SharedAiFallbackConfig
  | SharedOpenAiConfig
  | SharedOpenRouterConfig

type SharedAiConfigOptions = {
  modelEnvVar: string
  baseUrlEnvVar: string
  providerEnvVar?: string
  httpRefererEnvVar?: string
  titleEnvVar?: string
  legacyOpenRouterApiKeyEnvVar?: string
  openAiModelDefault: string
  openRouterModelDefault: string
  openRouterTitleDefault: string
}

export class AiProviderError extends Error {
  provider: AiProviderName
  kind: AiFailureKind

  constructor(provider: AiProviderName, message: string, kind: AiFailureKind = 'provider') {
    super(message)
    this.name = 'AiProviderError'
    this.provider = provider
    this.kind = kind
  }
}

const isTimeoutLikeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /timeout|timed out|aborted/i.test(message)
}

const getProviderFailureMessage = (label: string, timeoutMs: number, error: unknown) => {
  if (isTimeoutLikeError(error)) {
    return `${label} timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`
  }

  return error instanceof Error && error.message ? error.message : `${label} request failed.`
}

export const classifyAiFailure = (error: unknown): AiFailureKind => {
  if (error instanceof AiProviderError) return error.kind

  const message = error instanceof Error ? error.message : String(error)
  if (/not configured/i.test(message)) return 'config'
  if (isTimeoutLikeError(error)) return 'timeout'
  if (/validation|invalid|malformed json|schema/i.test(message)) return 'validation'
  if (/request failed|provider|openai|openrouter|codex/i.test(message)) return 'provider'
  if (error instanceof Error) return 'execution'
  return 'unknown'
}

export const logAiFailure = (
  scope: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
) => {
  const failurePayload = {
    scope,
    kind: classifyAiFailure(error),
    message: error instanceof Error ? error.message : String(error),
    ...metadata,
  }

  console.warn(`[ai] ${scope} failure`, failurePayload)
}

export const readEnvValue = (value?: string | null) => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

const normalizeOpenRouterServerUrl = (serverUrl?: string) => {
  const normalized = readEnvValue(serverUrl)
  if (!normalized) return undefined
  return normalized.replace(/\/responses\/?$/i, '')
}

const normalizeOpenAiBaseUrl = (responsesUrl?: string) => {
  const normalized = readEnvValue(responsesUrl)
  if (!normalized) return undefined
  return normalized.replace(/\/responses\/?$/i, '')
}

const getOpenRouterResponsesUrl = (serverUrl?: string) => {
  const normalized = normalizeOpenRouterServerUrl(serverUrl)
  if (!normalized) return DEFAULT_OPENROUTER_RESPONSES_URL
  return `${normalized.replace(/\/+$/u, '')}/responses`
}

const getRequestedProvider = (
  env: Record<string, string | undefined>,
  options: SharedAiConfigOptions,
): SharedAiProvider | undefined => {
  const requestedProvider = readEnvValue(
    (options.providerEnvVar ? env[options.providerEnvVar] : undefined) ?? env.PISTOLA_AI_PROVIDER,
  )
  if (!requestedProvider) return undefined

  const normalized = requestedProvider.toLowerCase()
  if (normalized === 'openai' || normalized === 'openrouter' || normalized === 'fallback') {
    return normalized as SharedAiProvider
  }

  return undefined
}

export const getSharedAiConfig = (
  env: Record<string, string | undefined> = process.env,
  options: SharedAiConfigOptions,
): SharedAiConfig => {
  // Prefer user-installed local model config (.pistola-ai.local.json) over bare env.
  const effectiveEnv = applyInstalledAiConfigToEnv(env)

  const requestedProvider = getRequestedProvider(effectiveEnv, options)
  const openRouterApiKey =
    readEnvValue(effectiveEnv.OPENROUTER_API_KEY) ??
    (options.legacyOpenRouterApiKeyEnvVar
      ? readEnvValue(effectiveEnv[options.legacyOpenRouterApiKeyEnvVar])
      : undefined)

  const openRouterConfig = openRouterApiKey
    ? ({
        provider: 'openrouter',
        apiKey: openRouterApiKey,
        model: readEnvValue(effectiveEnv[options.modelEnvVar]) ?? options.openRouterModelDefault,
        serverUrl: normalizeOpenRouterServerUrl(effectiveEnv[options.baseUrlEnvVar]),
        httpReferer: options.httpRefererEnvVar
          ? readEnvValue(effectiveEnv[options.httpRefererEnvVar])
          : undefined,
        title: options.titleEnvVar
          ? readEnvValue(effectiveEnv[options.titleEnvVar]) ?? options.openRouterTitleDefault
          : options.openRouterTitleDefault,
      } satisfies SharedOpenRouterConfig)
    : null

  const openAiApiKey = readEnvValue(effectiveEnv.OPENAI_API_KEY)
  const openAiConfig = openAiApiKey
    ? ({
        provider: 'openai',
        apiKey: openAiApiKey,
        model: readEnvValue(effectiveEnv[options.modelEnvVar]) ?? options.openAiModelDefault,
        responsesUrl: readEnvValue(effectiveEnv[options.baseUrlEnvVar]) ?? DEFAULT_OPENAI_RESPONSES_URL,
      } satisfies SharedOpenAiConfig)
    : null

  if (requestedProvider === 'fallback') {
    return { provider: 'fallback' }
  }

  if (requestedProvider === 'openrouter') {
    return openRouterConfig ?? { provider: 'fallback' }
  }

  if (requestedProvider === 'openai') {
    return openAiConfig ?? { provider: 'fallback' }
  }

  if (openRouterConfig) {
    return openRouterConfig
  }

  if (openAiConfig) {
    return openAiConfig
  }

  return { provider: 'fallback' }
}

export const cleanJsonString = (raw: string): string => {
  let trimmed = raw.trim()

  // Strip reasoning / thinking tags from DeepSeek R1/V3/V4, Qwen, etc.
  trimmed = trimmed
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()

  const codeBlockMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim()
  }

  const innerCodeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (innerCodeBlock?.[1]) {
    const candidate = innerCodeBlock[1].trim()
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      return candidate
    }
  }

  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim()
  }

  const firstBracket = trimmed.indexOf('[')
  const lastBracket = trimmed.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1).trim()
  }

  return trimmed
}

export const extractResponseText = (response: any): string => {
  const output = Array.isArray(response?.output) ? response.output : []

  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue

    for (const content of item.content) {
      if (content?.type === 'refusal' && typeof content.refusal === 'string') {
        throw new Error(content.refusal)
      }

      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text
      }
    }
  }

  // Also support OpenAI / OpenRouter chat completions format
  if (Array.isArray(response?.choices) && response.choices.length > 0) {
    const choice = response.choices[0]
    if (typeof choice?.message?.content === 'string') {
      return choice.message.content
    }
  }

  throw new Error('The planner did not return a structured response.')
}

export const requestOpenAiResponses = async (
  config: SharedOpenAiConfig,
  requestBody: Record<string, unknown>,
  timeoutMs: number,
  label: string,
) => {
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: normalizeOpenAiBaseUrl(config.responsesUrl) ?? DEFAULT_OPENAI_BASE_URL,
      timeout: timeoutMs,
      maxRetries: 0,
    })
    const response = await client.responses.create(requestBody as never)
    return extractResponseText(response)
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError(
      'openai',
      getProviderFailureMessage(label, timeoutMs, error),
      isTimeoutLikeError(error) ? 'timeout' : 'provider',
    )
  }
}

const normalizeOpenRouterInputContentPart = (part: unknown) => {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return part
  const record = { ...(part as Record<string, unknown>) }
  if (record.type !== 'input_image') return record

  const imageUrl =
    typeof record.imageUrl === 'string'
      ? record.imageUrl
      : typeof record.image_url === 'string'
        ? record.image_url
        : undefined

  delete record.image_url
  if (imageUrl) {
    record.imageUrl = imageUrl
  }
  if (typeof record.detail !== 'string') {
    record.detail = 'auto'
  }

  return record
}

export const normalizeOpenRouterResponsesRequest = (requestBody: Record<string, unknown>) => {
  const result: Record<string, unknown> = { ...requestBody }
  const input = result.input
  if (Array.isArray(input)) {
    result.input = input.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item
      const record = item as Record<string, unknown>
      if (!Array.isArray(record.content)) return record
      return {
        ...record,
        content: record.content.map(normalizeOpenRouterInputContentPart),
      }
    })
  }

  if (result.text && typeof result.text === 'object') {
    const textRecord = result.text as Record<string, unknown>
    if (textRecord.format && typeof textRecord.format === 'object') {
      result.text = {
        format: {
          type: 'json_object',
        },
      }
    }
  }

  return result
}

export const requestOpenRouterResponses = async (
  config: SharedOpenRouterConfig,
  requestBody: Record<string, unknown>,
  timeoutMs: number,
  label: string,
) => {
  try {
    const response = await fetch(getOpenRouterResponsesUrl(config.serverUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.httpReferer ? { 'HTTP-Referer': config.httpReferer } : {}),
        ...(config.title ? { 'X-Title': config.title } : {}),
      },
      body: JSON.stringify(normalizeOpenRouterResponsesRequest(requestBody)),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new AiProviderError('openrouter', errorBody || `${label} request failed.`, 'provider')
    }

    return extractResponseText(await response.json())
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError(
      'openrouter',
      getProviderFailureMessage(label, timeoutMs, error),
      isTimeoutLikeError(error) ? 'timeout' : 'provider',
    )
  }
}
