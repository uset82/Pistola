import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type InstalledAiProvider = 'openrouter' | 'openai'

export type InstalledAiConfig = {
  provider: InstalledAiProvider
  apiKey: string
  model: string
  baseUrl: string
}

export const DEFAULT_INSTALLED_OPENROUTER_MODEL = 'openrouter/free'
export const DEFAULT_INSTALLED_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_INSTALLED_OPENAI_BASE_URL = 'https://api.openai.com/v1'

const CONFIG_FILENAME = '.pistola-ai.local.json'

export const resolveInstalledAiConfigPath = (cwd = process.cwd()) => {
  const fromEnv = process.env.PISTOLA_AI_CONFIG_PATH?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const candidates = [
    path.resolve(cwd, CONFIG_FILENAME),
    path.resolve(cwd, 'apps', 'editor', CONFIG_FILENAME),
    path.resolve(cwd, '..', 'apps', 'editor', CONFIG_FILENAME),
    path.resolve(cwd, '..', '..', 'apps', 'editor', CONFIG_FILENAME),
  ]

  const existing = candidates.find((candidate) => existsSync(candidate))
  return existing || candidates[1] || candidates[0]!
}

export const readInstalledAiConfig = (
  cwd = process.cwd(),
): InstalledAiConfig | null => {
  const configPath = resolveInstalledAiConfigPath(cwd)
  if (!existsSync(configPath)) return null

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const provider =
      raw.provider === 'openai' || raw.provider === 'openrouter' ? raw.provider : null
    const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
    if (!provider || !apiKey) return null

    const model =
      typeof raw.model === 'string' && raw.model.trim()
        ? raw.model.trim()
        : provider === 'openrouter'
          ? DEFAULT_INSTALLED_OPENROUTER_MODEL
          : 'gpt-5.4'
    const baseUrl =
      typeof raw.baseUrl === 'string' && raw.baseUrl.trim()
        ? raw.baseUrl.trim().replace(/\/+$/u, '')
        : provider === 'openrouter'
          ? DEFAULT_INSTALLED_OPENROUTER_BASE_URL
          : DEFAULT_INSTALLED_OPENAI_BASE_URL

    return { provider, apiKey, model, baseUrl }
  } catch {
    return null
  }
}

export const writeInstalledAiConfig = (
  config: InstalledAiConfig,
  cwd = process.cwd(),
): { path: string; config: InstalledAiConfig } => {
  const configPath = resolveInstalledAiConfigPath(cwd)
  mkdirSync(path.dirname(configPath), { recursive: true })

  const normalized: InstalledAiConfig = {
    provider: config.provider,
    apiKey: config.apiKey.trim(),
    model:
      config.model.trim() ||
      (config.provider === 'openrouter'
        ? DEFAULT_INSTALLED_OPENROUTER_MODEL
        : 'gpt-5.4'),
    baseUrl:
      config.baseUrl.trim().replace(/\/+$/u, '') ||
      (config.provider === 'openrouter'
        ? DEFAULT_INSTALLED_OPENROUTER_BASE_URL
        : DEFAULT_INSTALLED_OPENAI_BASE_URL),
  }

  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return { path: configPath, config: normalized }
}

export const getInstalledAiConfigPublicView = (config: InstalledAiConfig | null) => {
  if (!config) {
    return {
      installed: false as const,
      provider: null,
      model: null,
      baseUrl: null,
      apiKeyConfigured: false,
      apiKeyPreview: null as string | null,
    }
  }

  const key = config.apiKey
  const preview =
    key.length <= 8 ? '********' : `${key.slice(0, 4)}…${key.slice(-4)}`

  return {
    installed: true as const,
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyConfigured: true,
    apiKeyPreview: preview,
  }
}

/**
 * Merge installed local config into a process-env-like map so shared AI
 * resolution can prefer it without rewriting every call site.
 */
export const applyInstalledAiConfigToEnv = (
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): Record<string, string | undefined> => {
  const installed = readInstalledAiConfig(cwd)
  if (!installed) return { ...env }

  const next = { ...env }

  if (installed.provider === 'openrouter') {
    next.OPENROUTER_API_KEY = installed.apiKey
    next.PISTOLA_AI_PROVIDER = next.PISTOLA_AI_PROVIDER || 'openrouter'
    next.PISTOLA_ASSISTANT_AI_PROVIDER =
      next.PISTOLA_ASSISTANT_AI_PROVIDER || 'openrouter'
    next.PISTOLA_CAD_AI_PROVIDER = next.PISTOLA_CAD_AI_PROVIDER || 'openrouter'
    // The installed file is the user's latest explicit choice from the panel,
    // so its model and base URL win over (possibly stale) env values.
    next.PISTOLA_ASSISTANT_MODEL = installed.model
    next.PISTOLA_CAD_MODEL = installed.model
    next.PISTOLA_MAC_MODEL = installed.model
    next.PISTOLA_ASSISTANT_AI_BASE_URL = installed.baseUrl
    next.PISTOLA_CAD_AI_BASE_URL = installed.baseUrl
    next.PISTOLA_MAC_AI_BASE_URL = installed.baseUrl
  }

  if (installed.provider === 'openai') {
    next.OPENAI_API_KEY = installed.apiKey
    next.PISTOLA_AI_PROVIDER = next.PISTOLA_AI_PROVIDER || 'openai'
    next.PISTOLA_ASSISTANT_MODEL = installed.model
    next.PISTOLA_CAD_MODEL = installed.model
    next.PISTOLA_ASSISTANT_AI_BASE_URL = `${installed.baseUrl}/responses`
    next.PISTOLA_CAD_AI_BASE_URL = `${installed.baseUrl}/responses`
  }

  return next
}
