'use client'

import { useEffect, useState } from 'react'
import {
  AI_PROVIDERS,
  useAiSettings,
  type AiProvider,
  type AiSettingsResult,
} from './ai-settings-store'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ErrorIcon, SpinnerIcon } from './icons'

type Draft = {
  replacingKey: boolean
  apiKey: string
  model: string
  baseUrl: string
  advancedOpen: boolean
}

type Feedback =
  | { state: 'idle' }
  | { state: 'working'; label: string }
  | { state: 'done'; result: AiSettingsResult }

const PROVIDER_ORDER: AiProvider[] = ['openrouter', 'openai']

const FIELD_CLASS =
  'h-[34px] w-full min-w-0 rounded-lg border border-as-line bg-as-surface px-2.5 font-mono text-[12px] text-as-text outline-none transition-[border-color,box-shadow] placeholder:text-as-faint focus:border-as-line-strong focus:shadow-[0_0_0_3px_rgba(227,139,92,0.12)]'
const SECONDARY_BUTTON_CLASS =
  'h-8 shrink-0 rounded-lg border border-as-line px-3 font-medium text-[12px] text-as-text transition-colors hover:bg-as-raised disabled:cursor-not-allowed disabled:text-as-disabled disabled:hover:bg-transparent'
const PRIMARY_BUTTON_CLASS =
  'h-8 shrink-0 rounded-lg bg-as-text px-3.5 font-semibold text-[12px] text-as-panel transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-as-raised disabled:text-as-disabled'
const LABEL_CLASS = 'font-medium text-[12px] text-as-muted'

/**
 * Model providers: one row per provider with its key, default model and base
 * URL. The server keeps a single active provider, so saving another provider
 * switches everything over to it.
 */
export function ProvidersSheet({ onBrowseModels }: { onBrowseModels: () => void }) {
  const config = useAiSettings((state) => state.config)
  const configStatus = useAiSettings((state) => state.configStatus)
  const activeProvider = useAiSettings((state) => state.activeProvider)
  const activeModel = useAiSettings((state) => state.activeModel)
  const loadConfig = useAiSettings((state) => state.loadConfig)
  const saveProvider = useAiSettings((state) => state.saveProvider)
  const testConnection = useAiSettings((state) => state.testConnection)

  const savedProvider = config?.installed ? config.provider : null
  const [expanded, setExpanded] = useState<AiProvider | null>(activeProvider)
  const [drafts, setDrafts] = useState<Record<AiProvider, Draft>>(() => ({
    openrouter: initialDraft('openrouter'),
    openai: initialDraft('openai'),
  }))
  const [feedback, setFeedback] = useState<Record<AiProvider, Feedback>>({
    openrouter: { state: 'idle' },
    openai: { state: 'idle' },
  })

  function initialDraft(provider: AiProvider): Draft {
    const isActive = provider === activeProvider
    return {
      replacingKey: false,
      apiKey: '',
      model: isActive ? activeModel : '',
      baseUrl: (isActive ? config?.baseUrl : null) ?? AI_PROVIDERS[provider].baseUrl,
      advancedOpen: false,
    }
  }

  useEffect(() => {
    if (configStatus === 'idle') void loadConfig()
  }, [configStatus, loadConfig])

  const updateDraft = (provider: AiProvider, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [provider]: { ...current[provider], ...patch } }))

  const run = async (
    provider: AiProvider,
    label: string,
    action: () => Promise<AiSettingsResult>,
  ) => {
    setFeedback((current) => ({ ...current, [provider]: { state: 'working', label } }))
    const result = await action()
    setFeedback((current) => ({ ...current, [provider]: { state: 'done', result } }))
    return result
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3.5 py-4 [scrollbar-color:#3a3935_transparent] [scrollbar-width:thin]">
      <p className="text-[12px] text-as-muted leading-[18px]">
        One connection powers the Assistant, CAD and MAC.
        {configStatus === 'unavailable'
          ? ' The Pistola server did not answer, so saved settings could not be loaded.'
          : savedProvider
            ? ' The default model you choose here is used by all three.'
            : ' No key is saved yet, so the server’s environment key is used if one is set.'}
      </p>

      <div className="overflow-hidden rounded-[10px] border border-as-line">
        {PROVIDER_ORDER.map((provider, providerIndex) => {
          const meta = AI_PROVIDERS[provider]
          const draft = drafts[provider]
          const status = feedback[provider]
          const isOpen = expanded === provider
          const isSaved = savedProvider === provider
          const showKeyInput = !isSaved || draft.replacingKey
          const hasNewKey = draft.apiKey.trim().length > 0
          const canUseKey = isSaved || hasNewKey
          const busy = status.state === 'working'
          const input = {
            provider,
            apiKey: showKeyInput ? draft.apiKey : undefined,
            model: draft.model,
            baseUrl: draft.baseUrl,
          }

          return (
            <div className={providerIndex > 0 ? 'border-as-line-soft border-t' : ''} key={provider}>
              <button
                aria-expanded={isOpen}
                className={`flex min-h-14 w-full items-center gap-2.5 px-3 text-left transition-colors ${
                  isOpen ? 'bg-[#1a1a18]' : 'hover:bg-as-surface'
                }`}
                onClick={() => setExpanded(isOpen ? null : provider)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-as-line bg-as-surface font-medium font-mono text-[11px] text-as-muted"
                >
                  {meta.initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold text-[13px] text-as-text">{meta.label}</span>
                  <span className="truncate font-mono text-[11px] text-as-faint">
                    {isSaved ? (config?.apiKeyPreview ?? 'key saved') : 'no key saved'}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-as-muted">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${isSaved ? 'bg-as-text' : 'border border-as-faint'}`}
                  />
                  {isSaved ? 'In use' : 'Not set up'}
                </span>
                <ChevronDownIcon
                  className={`shrink-0 text-as-faint transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                  size={14}
                />
              </button>

              {isOpen ? (
                <div className="flex flex-col gap-3.5 pt-1 pr-3 pb-4 pl-[50px]">
                  <div className="flex flex-col gap-1.5">
                    <label className={LABEL_CLASS} htmlFor={`assistant-${provider}-key`}>
                      API key
                    </label>
                    <div className="flex gap-1.5">
                      {showKeyInput ? (
                        <input
                          autoComplete="off"
                          className={FIELD_CLASS}
                          id={`assistant-${provider}-key`}
                          onChange={(event) =>
                            updateDraft(provider, { apiKey: event.target.value })
                          }
                          placeholder={
                            isSaved ? `Paste a new ${meta.label} key` : meta.keyPlaceholder
                          }
                          spellCheck={false}
                          type="password"
                          value={draft.apiKey}
                        />
                      ) : (
                        <div
                          className={`${FIELD_CLASS} flex items-center text-as-muted`}
                          id={`assistant-${provider}-key`}
                        >
                          {config?.apiKeyPreview ?? '••••'}
                        </div>
                      )}
                      {isSaved ? (
                        <button
                          className={SECONDARY_BUTTON_CLASS}
                          onClick={() =>
                            updateDraft(provider, { replacingKey: !draft.replacingKey, apiKey: '' })
                          }
                          type="button"
                        >
                          {draft.replacingKey ? 'Cancel' : 'Replace'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className={LABEL_CLASS} htmlFor={`assistant-${provider}-model`}>
                        Default model
                      </label>
                      {provider === activeProvider ? (
                        <button
                          className="rounded-md px-1.5 font-medium text-[12px] text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
                          onClick={onBrowseModels}
                          type="button"
                        >
                          Browse
                        </button>
                      ) : null}
                    </div>
                    <input
                      autoComplete="off"
                      className={FIELD_CLASS}
                      id={`assistant-${provider}-model`}
                      onChange={(event) => updateDraft(provider, { model: event.target.value })}
                      placeholder={
                        provider === 'openrouter'
                          ? meta.model
                          : 'Leave blank for the server default'
                      }
                      spellCheck={false}
                      type="text"
                      value={draft.model}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      aria-expanded={draft.advancedOpen}
                      className="inline-flex h-[26px] items-center gap-1 self-start pr-1.5 font-medium text-[12px] text-as-muted transition-colors hover:text-as-text"
                      onClick={() => updateDraft(provider, { advancedOpen: !draft.advancedOpen })}
                      type="button"
                    >
                      <ChevronRightIcon
                        className={`transition-transform duration-150 ${draft.advancedOpen ? 'rotate-90' : ''}`}
                        size={14}
                      />
                      Advanced
                    </button>
                    {draft.advancedOpen ? (
                      <div className="flex flex-col gap-1.5">
                        <label className={LABEL_CLASS} htmlFor={`assistant-${provider}-url`}>
                          Base URL
                        </label>
                        <input
                          autoComplete="off"
                          className={FIELD_CLASS}
                          id={`assistant-${provider}-url`}
                          onChange={(event) =>
                            updateDraft(provider, { baseUrl: event.target.value })
                          }
                          spellCheck={false}
                          type="url"
                          value={draft.baseUrl}
                        />
                        <span className="text-[11px] text-as-faint leading-4">
                          {provider === 'openai'
                            ? 'Requests go to the Responses API at this address.'
                            : 'Change only for a proxy or a self-hosted gateway.'}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {savedProvider && !isSaved ? (
                    <p className="text-[12px] text-as-muted leading-[18px]">
                      Saving switches the Assistant, CAD and MAC to {meta.label} and replaces the
                      saved {AI_PROVIDERS[savedProvider].label} key.
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        className={SECONDARY_BUTTON_CLASS}
                        disabled={busy || !canUseKey}
                        onClick={() => void run(provider, 'Checking', () => testConnection(input))}
                        type="button"
                      >
                        Test connection
                      </button>
                      <button
                        className={PRIMARY_BUTTON_CLASS}
                        disabled={busy || !canUseKey}
                        onClick={() =>
                          void run(provider, 'Saving', () => saveProvider(input)).then((result) => {
                            if (result.ok)
                              updateDraft(provider, { apiKey: '', replacingKey: false })
                          })
                        }
                        type="button"
                      >
                        {isSaved ? 'Save' : 'Save and use'}
                      </button>
                    </div>
                    {status.state === 'working' ? (
                      <div
                        className="flex items-center gap-2 text-[12px] text-as-muted"
                        role="status"
                      >
                        <SpinnerIcon />
                        {status.label} {meta.label}…
                      </div>
                    ) : status.state === 'done' ? (
                      <div
                        className={`flex items-start gap-2 text-[12px] leading-[18px] ${
                          status.result.ok ? 'text-as-text' : 'text-as-danger'
                        }`}
                        role={status.result.ok ? 'status' : 'alert'}
                      >
                        {status.result.ok ? (
                          <CheckIcon className="mt-0.5 shrink-0" size={14} />
                        ) : (
                          <ErrorIcon className="mt-0.5 shrink-0" size={14} />
                        )}
                        <span className="min-w-0 flex-1 break-words">
                          {status.result.ok ? status.result.message : status.result.error}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-as-faint leading-[17px]">
        Keys are stored by the Pistola server in{' '}
        <code className="font-mono text-as-muted">.pistola-ai.local.json</code> and only ever shown
        masked.
      </p>
    </div>
  )
}
