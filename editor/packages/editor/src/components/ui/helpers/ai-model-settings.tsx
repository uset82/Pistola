'use client'

import { useEffect, useState } from 'react'
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

export function AiModelSettings() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [config, setConfig] = useState<AiConfigView | null>(null)
  const [provider, setProvider] = useState('openrouter')
  const [model, setModel] = useState('openrouter/free')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://openrouter.ai/api/v1')

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/ai/config', { cache: 'no-store' })
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

  useEffect(() => {
    void loadConfig()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setStatus(null)
    try {
      const response = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey, baseUrl }),
      })
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
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          baseUrl,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      })
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

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-black/10 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            AI Model
          </div>
          <div className="text-[11px] text-muted-foreground">
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
          {open ? 'Hide' : 'Install'}
        </button>
      </div>

      {open && (
        <div className="space-y-2">
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Provider</span>
            <select
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => setProvider(event.target.value)}
              value={provider}
            >
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Model</span>
            <input
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => setModel(event.target.value)}
              placeholder="openrouter/free"
              value={model}
            />
          </label>
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>API key</span>
            <input
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={config?.apiKeyPreview || 'sk-or-...'}
              type="password"
              value={apiKey}
            />
          </label>
          <label className="block space-y-1 text-[11px] text-muted-foreground">
            <span>Base URL</span>
            <input
              className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-foreground"
              onChange={(event) => setBaseUrl(event.target.value)}
              value={baseUrl}
            />
          </label>
          <div className="flex gap-1.5">
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
              disabled={loading || !apiKey.trim()}
              onClick={() => void handleSave()}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {status && <div className="text-[11px] text-muted-foreground">{status}</div>}
    </div>
  )
}
