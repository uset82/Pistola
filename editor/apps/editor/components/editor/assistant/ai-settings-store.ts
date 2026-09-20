'use client'

import { create } from 'zustand'
import { FREE_ROUTER_MODEL_ID } from '../../../lib/assistant-model-display'
import {
  FALLBACK_OPENROUTER_MODELS,
  fetchOpenRouterModelCatalog,
  type OpenRouterModelOption,
} from '../../../lib/openrouter-model-catalog'
import { pistolaFetch } from '../../../lib/pistola-fetch'

export type AiProvider = 'openrouter' | 'openai'

export type AiConfigView = {
  installed: boolean
  provider: AiProvider | null
  model: string | null
  baseUrl: string | null
  apiKeyConfigured: boolean
  apiKeyPreview: string | null
}

export type AiSettingsResult = { ok: true; message: string } | { ok: false; error: string }

export type AiProviderInput = {
  provider: AiProvider
  apiKey?: string
  model?: string
  baseUrl?: string
}

export const AI_PROVIDERS: Record<
  AiProvider,
  { label: string; initials: string; baseUrl: string; model: string; keyPlaceholder: string }
> = {
  openrouter: {
    label: 'OpenRouter',
    initials: 'OR',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: FREE_ROUTER_MODEL_ID,
    keyPlaceholder: 'sk-or-v1-…',
  },
  openai: {
    label: 'OpenAI',
    initials: 'OA',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    keyPlaceholder: 'sk-…',
  },
}

const PINNED_MODELS_STORAGE_KEY = 'pistola:assistant-pinned-models'
const CATALOG_CLIENT_TTL_MS = 60 * 1000

const readPinnedModelIds = () => {
  if (typeof window === 'undefined') return [FREE_ROUTER_MODEL_ID]
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PINNED_MODELS_STORAGE_KEY) ?? 'null')
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
      ? (parsed as string[])
      : [FREE_ROUTER_MODEL_ID]
  } catch {
    return [FREE_ROUTER_MODEL_ID]
  }
}

const writePinnedModelIds = (ids: string[]) => {
  try {
    window.localStorage.setItem(PINNED_MODELS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage can be blocked; pins then last for this session only.
  }
}

const readJson = async (response: Response) =>
  (await response.json().catch(() => null)) as Record<string, unknown> | null

const readError = (payload: Record<string, unknown> | null, fallback: string) =>
  typeof payload?.error === 'string' && payload.error ? payload.error : fallback

const toConfigView = (payload: Record<string, unknown> | null): AiConfigView | null => {
  if (!payload) return null
  const provider =
    payload.provider === 'openai' || payload.provider === 'openrouter' ? payload.provider : null
  return {
    installed: payload.installed === true,
    provider,
    model: typeof payload.model === 'string' ? payload.model : null,
    baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl : null,
    apiKeyConfigured: payload.apiKeyConfigured === true,
    apiKeyPreview: typeof payload.apiKeyPreview === 'string' ? payload.apiKeyPreview : null,
  }
}

type AiSettingsState = {
  config: AiConfigView | null
  configStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  activeProvider: AiProvider
  activeModel: string
  catalog: OpenRouterModelOption[]
  catalogProvider: AiProvider | null
  catalogStatus: 'idle' | 'loading' | 'ready'
  catalogIsFallback: boolean
  catalogFetchedAt: number | null
  pinnedIds: string[]
  loadConfig: () => Promise<void>
  loadCatalog: (options?: { force?: boolean }) => Promise<void>
  selectModel: (modelId: string) => Promise<AiSettingsResult>
  saveProvider: (input: AiProviderInput) => Promise<AiSettingsResult>
  testConnection: (input: AiProviderInput) => Promise<AiSettingsResult>
  togglePin: (modelId: string) => void
}

/**
 * Single owner of `/api/ai/*` on the client. The composer's model chip, the
 * model picker and the providers sheet all read this store, so they cannot
 * disagree about which provider and model are active.
 */
export const useAiSettings = create<AiSettingsState>((set, get) => ({
  config: null,
  configStatus: 'idle',
  activeProvider: 'openrouter',
  activeModel: FREE_ROUTER_MODEL_ID,
  catalog: [],
  catalogProvider: null,
  catalogStatus: 'idle',
  catalogIsFallback: false,
  catalogFetchedAt: null,
  pinnedIds: readPinnedModelIds(),

  loadConfig: async () => {
    set({ configStatus: 'loading' })
    try {
      const response = await pistolaFetch('/api/ai/config', { cache: 'no-store' })
      const config = response.ok ? toConfigView(await readJson(response)) : null
      if (!config) {
        set({ configStatus: 'unavailable' })
        return
      }
      const activeProvider = config.provider ?? 'openrouter'
      set({
        config,
        configStatus: 'ready',
        activeProvider,
        activeModel: config.model ?? AI_PROVIDERS[activeProvider].model,
      })
    } catch {
      set({ configStatus: 'unavailable' })
    }
  },

  loadCatalog: async ({ force = false } = {}) => {
    const { activeProvider, catalogProvider, catalogStatus, catalogFetchedAt, catalogIsFallback, config } =
      get()
    if (catalogStatus === 'loading' && !force) return
    const catalogIsFresh =
      !catalogIsFallback &&
      catalogProvider === activeProvider &&
      catalogStatus === 'ready' &&
      catalogFetchedAt != null &&
      Date.now() - catalogFetchedAt < CATALOG_CLIENT_TTL_MS
    if (!force && catalogIsFresh) return

    set({ catalogStatus: 'loading', catalogProvider: activeProvider })
    const finish = (models: OpenRouterModelOption[], isFallback: boolean) => {
      // A provider switch while loading makes this response stale.
      if (get().catalogProvider !== activeProvider) return
      set({
        catalog: models,
        catalogStatus: 'ready',
        catalogIsFallback: isFallback,
        catalogFetchedAt: Date.now(),
      })
    }

    try {
      const query = new URLSearchParams({
        provider: activeProvider,
        ...(force ? { forceRefresh: '1' } : {}),
      })
      const response = await pistolaFetch(`/api/ai/models?${query.toString()}`, {
        cache: 'no-store',
      })
      const payload = response.ok ? await readJson(response) : null
      if (payload?.ok && Array.isArray(payload.models) && payload.models.length > 0) {
        finish(payload.models as OpenRouterModelOption[], payload.fallback === true)
        return
      }
    } catch {
      // Hosted builds may not expose the catalog route; fall through to a direct fetch.
    }

    if (activeProvider === 'openai') {
      finish([], false)
      return
    }
    try {
      finish(
        await fetchOpenRouterModelCatalog({
          baseUrl: config?.baseUrl ?? AI_PROVIDERS.openrouter.baseUrl,
        }),
        false,
      )
    } catch {
      finish(FALLBACK_OPENROUTER_MODELS, true)
    }
  },

  selectModel: async (modelId) => {
    const previous = get().activeModel
    if (modelId === previous) return { ok: true, message: 'Model unchanged.' }

    set({ activeModel: modelId })
    try {
      // The route merges partial updates, so the stored key and base URL stay.
      const response = await pistolaFetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      })
      const payload = await readJson(response)
      if (!response.ok) {
        set({ activeModel: previous })
        return { ok: false, error: readError(payload, 'Could not save the model.') }
      }
      set({ config: toConfigView(payload) ?? get().config })
      return { ok: true, message: `Model switched to ${modelId}.` }
    } catch (error) {
      set({ activeModel: previous })
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save the model.',
      }
    }
  },

  saveProvider: async (input) => {
    try {
      const response = await pistolaFetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: input.provider,
          apiKey: input.apiKey?.trim() || undefined,
          model: input.model?.trim() || undefined,
          baseUrl: input.baseUrl?.trim() || undefined,
        }),
      })
      const payload = await readJson(response)
      const config = response.ok ? toConfigView(payload) : null
      if (!config) {
        return { ok: false, error: readError(payload, 'Could not save the provider.') }
      }

      const providerChanged = config.provider !== get().activeProvider
      const activeProvider = config.provider ?? input.provider
      set({
        config,
        configStatus: 'ready',
        activeProvider,
        activeModel: config.model ?? AI_PROVIDERS[activeProvider].model,
        ...(providerChanged
          ? {
              catalog: [],
              catalogProvider: null,
              catalogStatus: 'idle' as const,
              catalogFetchedAt: null,
            }
          : {}),
      })
      void get().loadCatalog({ force: true })
      return {
        ok: true,
        message: `Saved. The Assistant, CAD and MAC now use ${AI_PROVIDERS[activeProvider].label}.`,
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not save the provider.',
      }
    }
  },

  testConnection: async (input) => {
    try {
      const response = await pistolaFetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: input.provider,
          apiKey: input.apiKey?.trim() || undefined,
          model: input.model?.trim() || undefined,
          baseUrl: input.baseUrl?.trim() || undefined,
        }),
      })
      const payload = await readJson(response)
      if (!response.ok || payload?.ok !== true) {
        return { ok: false, error: readError(payload, 'Connection test failed.') }
      }
      return {
        ok: true,
        message: typeof payload.message === 'string' ? payload.message : 'Connection OK.',
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Connection test failed.',
      }
    }
  },

  togglePin: (modelId) => {
    const current = get().pinnedIds
    const pinnedIds = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId]
    set({ pinnedIds })
    writePinnedModelIds(pinnedIds)
  },
}))
