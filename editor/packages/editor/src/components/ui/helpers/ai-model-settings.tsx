'use client'

import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { pistolaApiUrl, pistolaRemoteInit } from '../../../lib/api-base'
import { cn } from '../../../lib/utils'

type AiConfigView = {
  installed: boolean
  provider: string | null
  model: string | null
  baseUrl: string | null
  apiKeyConfigured: boolean
  apiKeyPreview: string | null
  defaults?: {
    provider: string
    model: string
    baseUrl: string
  }
}

type ModelOption = {
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

const QUICK_PRESETS: Array<{ id: string; label: string; isFree?: boolean }> = [
  { id: 'openrouter/free', label: '⭐ Free Router', isFree: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', isFree: true },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5' },
  { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
]

export function AiModelSettings() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [config, setConfig] = useState<AiConfigView | null>(null)
  const [provider, setProvider] = useState('openrouter')
  const [model, setModel] = useState('openrouter/free')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1')

  // Real OpenRouter models state
  const [models, setModels] = useState<ModelOption[]>([])
  const [filterMode, setFilterMode] = useState<'free' | 'recommended' | 'all'>('free')
  const [searchQuery, setSearchQuery] = useState('')
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isCustomModel, setIsCustomModel] = useState(false)

  const loadConfig = async () => {
    try {
      const response = await fetch(
        pistolaApiUrl('/api/ai/config'),
        pistolaRemoteInit({ cache: 'no-store' }),
      )
      const payload = (await response.json()) as AiConfigView & { error?: string }
      if (!response.ok) {
        setStatus(payload.error || 'Unable to load AI config.')
        return
      }
      setConfig(payload)
      if (payload.provider) setProvider(payload.provider)
      if (payload.model) setModel(payload.model)
      if (payload.baseUrl) setBaseUrl(payload.baseUrl)
      if (!payload.installed && payload.defaults) {
        setProvider(payload.defaults.provider)
        setModel(payload.defaults.model)
        setBaseUrl(payload.defaults.baseUrl)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load AI config.')
    }
  }

  const loadModels = async (prov = provider, forceRefresh = false) => {
    setLoadingModels(true)
    try {
      const query = new URLSearchParams({
        provider: prov,
        ...(forceRefresh ? { forceRefresh: '1' } : {}),
      })
      const response = await fetch(
        pistolaApiUrl(`/api/ai/models?${query.toString()}`),
        pistolaRemoteInit({ cache: 'no-store' }),
      )
      if (response.ok) {
        const payload = (await response.json()) as {
          ok: boolean
          models?: ModelOption[]
        }
        if (payload.ok && Array.isArray(payload.models)) {
          setModels(payload.models)
        }
      }
    } catch (err) {
      console.warn('Failed to load real AI models:', err)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  useEffect(() => {
    if (open) {
      void loadModels(provider)
    }
  }, [open, provider])

  const freeCount = useMemo(() => models.filter((m) => m.isFree).length, [models])

  const filteredModels = useMemo(() => {
    let list = models
    if (filterMode === 'free') {
      list = list.filter((m) => m.isFree)
    } else if (filterMode === 'recommended') {
      list = list.filter((m) => m.isRecommended || m.isFree)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)),
      )
    }
    return list
  }, [models, filterMode, searchQuery])

  const selectedModelObj = useMemo(
    () => models.find((m) => m.id === model),
    [models, model],
  )

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    if (newProvider === 'openrouter') {
      setModel('openrouter/free')
      setBaseUrl('https://openrouter.ai/api/v1')
    } else {
      setModel('gpt-4o')
      setBaseUrl('https://api.openai.com/v1')
    }
    void loadModels(newProvider)
  }

  const handleSelectModel = (chosenId: string) => {
    setModel(chosenId)
    setIsCustomModel(false)
    setIsPickerOpen(false)
  }

  const handleSave = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const response = await fetch(
        pistolaApiUrl('/api/ai/config'),
        pistolaRemoteInit({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, apiKey, baseUrl }),
        }),
      )
      const payload = await response.json()
      if (!response.ok) {
        setStatus(typeof payload.error === 'string' ? payload.error : 'Save failed.')
        return
      }
      setApiKey('')
      setStatus('Model installed. Assistant, CAD, and MAC will use it.')
      await loadConfig()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const response = await fetch(
        pistolaApiUrl('/api/ai/test'),
        pistolaRemoteInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            model,
            baseUrl,
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          }),
        }),
      )
      const payload = await response.json()
      if (!response.ok || !payload.ok) {
        setStatus(typeof payload.error === 'string' ? payload.error : 'Connection test failed.')
        return
      }
      setStatus(typeof payload.message === 'string' ? payload.message : 'Connection OK.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connection test failed.')
    } finally {
      setLoading(false)
    }
  }

  const formatContextLength = (len?: number | null) => {
    if (!len) return null
    if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(1)}M`
    if (len >= 1_000) return `${Math.round(len / 1_000)}k`
    return `${len}`
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-black/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              AI Model
            </span>
            {config?.installed && (
              <span className="inline-flex items-center rounded bg-emerald-500/10 px-1 py-0.2 text-[9px] font-medium text-emerald-400 border border-emerald-500/20">
                ACTIVE
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={model}>
            {config?.installed
              ? `${config.provider} • ${config.model}`
              : 'Not installed — default to OpenRouter free'}
          </div>
        </div>
        <button
          className="rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? 'Hide' : 'Configure'}
        </button>
      </div>

      {open && (
        <div className="space-y-2.5 pt-1">
          {/* Provider selector */}
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Provider</span>
            <select
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => handleProviderChange(event.target.value)}
              value={provider}
            >
              <option value="openrouter">OpenRouter (440+ Models, Free & Paid)</option>
              <option value="openai">OpenAI (Direct API)</option>
            </select>
          </label>

          {/* Model selection section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span>Model</span>
                {provider === 'openrouter' && models.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/70">
                    ({models.length} available, {freeCount} free)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                {provider === 'openrouter' && (
                  <button
                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                    disabled={loadingModels}
                    onClick={() => void loadModels(provider, true)}
                    title="Refresh real model catalog from OpenRouter"
                    type="button"
                  >
                    <RefreshCw
                      className={cn('h-2.5 w-2.5', loadingModels && 'animate-spin')}
                    />
                    <span>Refresh</span>
                  </button>
                )}
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted"
                  onClick={() => setIsCustomModel((v) => !v)}
                  type="button"
                >
                  {isCustomModel ? 'Pick from list' : 'Custom ID'}
                </button>
              </div>
            </div>

            {/* If custom model input is toggled */}
            {isCustomModel ? (
              <input
                className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 font-mono text-[11px] text-foreground"
                onChange={(event) => setModel(event.target.value)}
                placeholder="e.g. meta-llama/llama-3.3-70b-instruct:free"
                value={model}
              />
            ) : (
              /* Selected Model Card / Dropdown Trigger */
              <div className="space-y-1.5">
                <button
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border/70 bg-[#2C2C2E] px-2.5 py-1.5 text-left text-foreground hover:border-cyan-500/50 hover:bg-[#353538] transition-colors"
                  onClick={() => setIsPickerOpen((v) => !v)}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="truncate text-[11px] font-medium">
                        {selectedModelObj?.name || model}
                      </span>
                      {selectedModelObj?.isFree && (
                        <span className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-semibold text-emerald-300 border border-emerald-500/30">
                          FREE
                        </span>
                      )}
                      {selectedModelObj?.contextLength && (
                        <span className="shrink-0 rounded bg-white/5 px-1 py-0.2 text-[9px] text-muted-foreground">
                          {formatContextLength(selectedModelObj.contextLength)} ctx
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground/80">
                      {model}
                    </div>
                  </div>
                  {isPickerOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {/* Interactive Model Browser Dropdown */}
                {isPickerOpen && (
                  <div className="space-y-2 rounded-md border border-border/80 bg-[#1F1F22] p-2 shadow-xl">
                    {/* Search bar */}
                    <div className="relative">
                      <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                      <input
                        autoFocus
                        className="w-full rounded border border-border/50 bg-[#2C2C2E] py-1 pl-7 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-cyan-500 focus:outline-none"
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Search ${models.length || ''} models (e.g. llama, deepseek, free)...`}
                        value={searchQuery}
                      />
                    </div>

                    {/* Filter tabs */}
                    {provider === 'openrouter' && (
                      <div className="flex gap-1 border-b border-border/40 pb-1.5 text-[10px]">
                        <button
                          className={cn(
                            'flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors',
                            filterMode === 'free'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          onClick={() => setFilterMode('free')}
                          type="button"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          <span>Free Only ({freeCount})</span>
                        </button>
                        <button
                          className={cn(
                            'flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors',
                            filterMode === 'recommended'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          onClick={() => setFilterMode('recommended')}
                          type="button"
                        >
                          <Zap className="h-2.5 w-2.5" />
                          <span>Recommended</span>
                        </button>
                        <button
                          className={cn(
                            'rounded px-1.5 py-0.5 font-medium transition-colors',
                            filterMode === 'all'
                              ? 'bg-white/10 text-foreground border border-white/20'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                          onClick={() => setFilterMode('all')}
                          type="button"
                        >
                          All ({models.length})
                        </button>
                      </div>
                    )}

                    {/* Quick presets chips */}
                    {provider === 'openrouter' && (
                      <div className="flex flex-wrap gap-1">
                        {QUICK_PRESETS.map((preset) => (
                          <button
                            className={cn(
                              'rounded border px-1.5 py-0.5 text-[9px] transition-colors',
                              model === preset.id
                                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                                : 'border-border/40 bg-[#2C2C2E] text-muted-foreground hover:border-border hover:text-foreground',
                            )}
                            key={preset.id}
                            onClick={() => handleSelectModel(preset.id)}
                            type="button"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Scrollable Model List */}
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                      {loadingModels ? (
                        <div className="flex items-center justify-center py-4 text-[11px] text-muted-foreground gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                          <span>Loading real models from OpenRouter...</span>
                        </div>
                      ) : filteredModels.length === 0 ? (
                        <div className="py-3 text-center text-[11px] text-muted-foreground">
                          No models found matching &quot;{searchQuery}&quot;
                        </div>
                      ) : (
                        filteredModels.map((item) => {
                          const isSelected = model === item.id
                          return (
                            <button
                              className={cn(
                                'flex w-full items-start justify-between gap-1.5 rounded p-1.5 text-left transition-colors',
                                isSelected
                                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-foreground'
                                  : 'hover:bg-[#2C2C2E] text-muted-foreground hover:text-foreground',
                              )}
                              key={item.id}
                              onClick={() => handleSelectModel(item.id)}
                              type="button"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'truncate text-[11px] font-medium',
                                      isSelected && 'text-cyan-200',
                                    )}
                                  >
                                    {item.name}
                                  </span>
                                  {item.isFree && (
                                    <span className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.1 text-[8px] font-semibold text-emerald-300 border border-emerald-500/30">
                                      FREE
                                    </span>
                                  )}
                                  {item.contextLength && (
                                    <span className="shrink-0 text-[9px] text-muted-foreground/80">
                                      {formatContextLength(item.contextLength)}
                                    </span>
                                  )}
                                </div>
                                <div className="truncate font-mono text-[9px] text-muted-foreground/70">
                                  {item.id}
                                </div>
                                {item.description && (
                                  <div className="line-clamp-1 text-[9px] text-muted-foreground/60">
                                    {item.description}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* API Key */}
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>
              API key{' '}
              {provider === 'openrouter' && (
                <span className="text-[10px] text-muted-foreground/70">
                  (Required for paid models; free models work with any OpenRouter key)
                </span>
              )}
            </span>
            <input
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={config?.apiKeyPreview || (provider === 'openrouter' ? 'sk-or-v1-...' : 'sk-...')}
              type="password"
              value={apiKey}
            />
          </label>

          {/* Base URL */}
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Base URL</span>
            <input
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => setBaseUrl(event.target.value)}
              value={baseUrl}
            />
          </label>

          {/* Action buttons */}
          <div className="flex gap-1.5 pt-1">
            <button
              className={cn(
                'flex-1 rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-[11px]',
                loading ? 'opacity-60' : 'hover:bg-[#3e3e3e]',
              )}
              disabled={loading}
              onClick={() => void handleTest()}
              type="button"
            >
              Test
            </button>
            <button
              className={cn(
                'flex-1 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2 py-1.5 text-[11px] text-cyan-100',
                loading ? 'opacity-60' : 'hover:bg-cyan-400/20',
              )}
              disabled={loading || (!apiKey.trim() && !config?.apiKeyConfigured)}
              onClick={() => void handleSave()}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {status && (
        <div
          className={cn(
            'text-[11px] p-1.5 rounded',
            status.includes('OK') || status.includes('installed')
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : 'text-muted-foreground bg-black/20',
          )}
        >
          {status}
        </div>
      )}
    </div>
  )
}
