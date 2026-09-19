'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  describeModelName,
  formatContextLength,
  formatModelPrice,
  groupAssistantModels,
  type AssistantModelFilter,
} from '../../../lib/assistant-model-display'
import type { OpenRouterModelOption } from '../../../lib/openrouter-model-catalog'
import { AI_PROVIDERS, useAiSettings } from './ai-settings-store'
import { CheckIcon, PinIcon, RefreshIcon, SearchIcon, SlidersIcon, SpinnerIcon } from './icons'

const MAX_HEIGHT = 460
const PREFERRED_MIN_HEIGHT = 320
const EDGE_GAP = 12

type Row = { model: OpenRouterModelOption; custom?: boolean }
type Section = { id: string; label: string; rows: Row[] }

/** Return focus after the picker unmounts, so keyboard users are not dropped on <body>. */
const focusElement = (selector: string) => {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus())
}

const FILTERS: Array<{ id: AssistantModelFilter; label: string }> = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'free', label: 'Free' },
  { id: 'all', label: 'All' },
]

/**
 * Model picker popover, anchored to the composer. It floats over the
 * transcript and flips below the composer when there is no room above.
 */
export function ModelPicker({
  onClose,
  onOpenProviders,
  onSelected,
}: {
  onClose: () => void
  onOpenProviders: () => void
  onSelected: (message: string) => void
}) {
  const catalog = useAiSettings((state) => state.catalog)
  const catalogStatus = useAiSettings((state) => state.catalogStatus)
  const catalogIsFallback = useAiSettings((state) => state.catalogIsFallback)
  const activeModel = useAiSettings((state) => state.activeModel)
  const activeProvider = useAiSettings((state) => state.activeProvider)
  const config = useAiSettings((state) => state.config)
  const pinnedIds = useAiSettings((state) => state.pinnedIds)
  const loadCatalog = useAiSettings((state) => state.loadCatalog)
  const selectModel = useAiSettings((state) => state.selectModel)
  const togglePin = useAiSettings((state) => state.togglePin)

  const [filter, setFilter] = useState<AssistantModelFilter>('free')
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [placement, setPlacement] = useState<{ side: 'above' | 'below'; maxHeight: number }>({
    side: 'above',
    maxHeight: MAX_HEIGHT,
  })

  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void loadCatalog()
    searchRef.current?.focus()
  }, [loadCatalog])

  useLayoutEffect(() => {
    const anchor = rootRef.current?.parentElement?.getBoundingClientRect()
    if (!anchor) return
    const spaceAbove = anchor.top - EDGE_GAP
    const spaceBelow = window.innerHeight - anchor.bottom - EDGE_GAP
    const side = spaceAbove >= PREFERRED_MIN_HEIGHT || spaceAbove >= spaceBelow ? 'above' : 'below'
    setPlacement({
      side,
      maxHeight: Math.min(MAX_HEIGHT, side === 'above' ? spaceAbove : spaceBelow),
    })
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (rootRef.current?.contains(target)) return
      // The chip toggles the picker itself.
      if (target.closest('[data-testid="assistant-model-chip"]')) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const sections = useMemo<Section[]>(() => {
    const trimmedQuery = query.trim()
    const result: Section[] = []

    if (!trimmedQuery && !catalog.some((model) => model.id === activeModel)) {
      result.push({
        id: 'current',
        label: 'Current',
        rows: [{ model: { id: activeModel, name: activeModel, isFree: false }, custom: true }],
      })
    }

    for (const group of groupAssistantModels({ models: catalog, filter, query, pinnedIds })) {
      result.push({
        id: group.id,
        label: group.label,
        rows: group.models.map((model) => ({ model })),
      })
    }

    const looksLikeId = /^[\w.-]+\/[\w.:@-]+$/.test(trimmedQuery)
    if (looksLikeId && !catalog.some((model) => model.id === trimmedQuery)) {
      result.push({
        id: 'custom',
        label: 'Custom',
        rows: [{ model: { id: trimmedQuery, name: trimmedQuery, isFree: false }, custom: true }],
      })
    }
    return result
  }, [activeModel, catalog, filter, pinnedIds, query])

  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections])

  useEffect(() => {
    const selectedIndex = rows.findIndex((row) => row.model.id === activeModel)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [rows, activeModel])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-row-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const choose = async (modelId: string) => {
    setError(null)
    setSavingId(modelId)
    const result = await selectModel(modelId)
    setSavingId(null)
    if (result.ok) {
      onSelected(result.message)
      onClose()
      focusElement('[data-testid="assistant-input"]')
    } else {
      setError(result.error)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      focusElement('[data-testid="assistant-model-chip"]')
    } else if (event.key === 'ArrowDown' && rows.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % rows.length)
    } else if (event.key === 'ArrowUp' && rows.length > 0) {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      const row = rows[activeIndex]
      if (!row) return
      event.preventDefault()
      void choose(row.model.id)
    }
  }

  const freeCount = catalog.filter((model) => model.isFree).length
  const showPrice = filter !== 'free'
  const providerLabel = AI_PROVIDERS[activeProvider].label
  const keyState =
    config?.installed && config.provider === activeProvider ? 'key saved' : 'no key saved'
  let rowIndex = -1

  return (
    <div
      aria-label="Choose a model"
      className={`absolute right-0 left-0 z-20 flex flex-col overflow-hidden rounded-xl border border-as-line-strong bg-as-overlay shadow-[0_16px_40px_rgba(0,0,0,0.55)] ${
        placement.side === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
      onKeyDown={handleKeyDown}
      ref={rootRef}
      role="dialog"
      // Fixed height so the search box stays put while results filter.
      style={{ height: placement.maxHeight }}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-as-raised border-b pr-2.5 pl-3">
        <SearchIcon className="shrink-0 text-as-faint" />
        <input
          aria-activedescendant={
            rows.length > 0 ? `assistant-model-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls="assistant-model-list"
          aria-expanded="true"
          aria-label="Search models"
          autoComplete="off"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-as-text outline-none placeholder:text-as-faint"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            catalog.length > 0 ? `Search ${catalog.length} models or type an ID` : 'Search models'
          }
          ref={searchRef}
          role="combobox"
          spellCheck={false}
          type="text"
          value={query}
        />
        <kbd className="inline-flex h-[18px] items-center rounded border border-as-line bg-as-panel px-1.5 font-mono text-[11px] text-as-muted leading-none">
          esc
        </kbd>
      </div>

      <div aria-label="Filter models" className="flex shrink-0 gap-1 px-2 pt-2 pb-0.5" role="group">
        {FILTERS.map((option) => {
          const count =
            option.id === 'free' ? freeCount : option.id === 'all' ? catalog.length : null
          return (
            <button
              aria-pressed={filter === option.id}
              className={`inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 font-medium text-[12px] transition-colors ${
                filter === option.id
                  ? 'bg-as-selected text-as-text'
                  : 'text-as-faint hover:text-as-text'
              }`}
              key={option.id}
              onClick={() => {
                setFilter(option.id)
                searchRef.current?.focus()
              }}
              type="button"
            >
              {option.label}
              {count ? <span className="font-mono text-[11px] text-as-faint">{count}</span> : null}
            </button>
          )
        })}
      </div>

      <div
        aria-label="Models"
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-0.5 pb-2 [scrollbar-color:#3a3935_transparent] [scrollbar-width:thin]"
        id="assistant-model-list"
        ref={listRef}
        role="listbox"
      >
        {catalogStatus === 'loading' && catalog.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-7 text-[12px] text-as-muted">
            <SpinnerIcon />
            Loading models
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-7 text-center text-[12px] text-as-faint">
            {query.trim() ? `No models match “${query.trim()}”.` : 'No models in this list.'}
          </div>
        ) : (
          sections.map((section) => (
            <div aria-label={section.label} key={section.id} role="group">
              <div
                aria-hidden="true"
                className="px-2 pt-3 pb-1 font-medium font-mono text-[11px] text-as-faint uppercase tracking-[0.06em]"
              >
                {section.label}
              </div>
              {section.rows.map(({ model, custom }) => {
                rowIndex += 1
                const index = rowIndex
                const selected = model.id === activeModel
                const isActive = index === activeIndex
                const pinned = pinnedIds.includes(model.id)
                const { title, vendor } = custom
                  ? { title: model.id, vendor: section.id === 'custom' ? 'use this ID' : null }
                  : describeModelName(model)
                const context = formatContextLength(model.contextLength)
                return (
                  <div className="group relative" key={`${section.id}-${model.id}`}>
                    <div
                      aria-selected={selected}
                      className={`flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] pr-8 pl-2 ${
                        isActive ? 'bg-as-raised' : ''
                      }`}
                      data-row-index={index}
                      id={`assistant-model-option-${index}`}
                      onClick={() => void choose(model.id)}
                      onMouseMove={() => {
                        if (!isActive) setActiveIndex(index)
                      }}
                      role="option"
                      // Focus stays in the search box; options are reached via aria-activedescendant.
                      tabIndex={-1}
                      title={model.id}
                    >
                      <span className="flex w-4 shrink-0 justify-center text-as-text">
                        {savingId === model.id ? (
                          <SpinnerIcon size={12} />
                        ) : selected ? (
                          <CheckIcon size={14} />
                        ) : null}
                      </span>
                      <span className="min-w-0 truncate text-[13px] text-as-text">{title}</span>
                      {vendor ? (
                        <span className="shrink-0 truncate text-[12px] text-as-faint">
                          {vendor}
                        </span>
                      ) : null}
                      <span className="flex-1" />
                      {context ? (
                        <span className="shrink-0 font-mono text-[11px] text-as-faint">
                          {context}
                        </span>
                      ) : null}
                      {showPrice && !custom ? (
                        <span className="w-[62px] shrink-0 truncate text-right font-mono text-[11px] text-as-muted">
                          {formatModelPrice(model)}
                        </span>
                      ) : null}
                    </div>
                    {custom ? null : (
                      <button
                        aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
                        className={`absolute top-1/2 right-1 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-as-faint transition-opacity hover:bg-as-selected hover:text-as-text ${
                          pinned
                            ? 'opacity-100'
                            : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
                        }`}
                        onClick={() => togglePin(model.id)}
                        tabIndex={-1}
                        title={pinned ? 'Unpin' : 'Pin to the top'}
                        type="button"
                      >
                        <PinIcon filled={pinned} size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {error ? (
        <p
          className="shrink-0 border-as-raised border-t px-3 py-2 text-[12px] text-as-danger leading-[18px]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex h-10 shrink-0 items-center gap-2 border-as-raised border-t pr-1.5 pl-3 text-[12px] text-as-muted">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            keyState === 'key saved' ? 'bg-as-text' : 'border border-as-faint'
          }`}
        />
        <span className="shrink-0">{providerLabel}</span>
        <span className="min-w-0 truncate font-mono text-[11px] text-as-faint">
          {keyState}
          {catalogIsFallback ? ' · offline list' : ''}
        </span>
        <span className="flex-1" />
        <button
          aria-label="Refresh model list"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
          onClick={() => void loadCatalog({ force: true })}
          title="Refresh model list"
          type="button"
        >
          {catalogStatus === 'loading' ? <SpinnerIcon size={13} /> : <RefreshIcon size={14} />}
        </button>
        <button
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium text-[12px] text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
          onClick={onOpenProviders}
          type="button"
        >
          <SlidersIcon size={14} />
          Providers
        </button>
      </div>
    </div>
  )
}
