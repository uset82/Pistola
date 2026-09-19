'use client'

import type { ClipboardEvent, KeyboardEvent, ReactNode, RefObject } from 'react'
import type { AssistantChatMode } from '../../../lib/assistant-chat-contract'
import type { AssistantImageKind } from '../../../lib/assistant-image-contract'
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CloseIcon,
  PaperclipIcon,
  SpinnerIcon,
  StopIcon,
} from './icons'

const MODES: Array<{ id: AssistantChatMode; label: string }> = [
  { id: 'ask', label: 'Ask' },
  { id: 'create', label: 'Create' },
  { id: 'refine', label: 'Refine' },
]

const IMAGE_KINDS: Array<{ id: AssistantImageKind; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'reference', label: 'Reference' },
  { id: 'floorplan', label: 'Floorplan' },
  { id: 'sketch', label: 'Sketch' },
]

export type ComposerSendState = 'send' | 'busy' | 'stop'

export function Composer({
  textareaRef,
  input,
  ghostText,
  placeholder,
  locked,
  onInputChange,
  onKeyDown,
  onPaste,
  attachedImage,
  onAttachFile,
  onRemoveImage,
  onImageKindChange,
  chatMode,
  onChatModeChange,
  modelLabel,
  modelMenuOpen,
  onToggleModelMenu,
  sendState,
  sendLabel,
  onSend,
  onStop,
  popover,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  input: string
  ghostText: string
  placeholder: string
  locked: boolean
  onInputChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  attachedImage: { dataUrl: string; name: string; kind: AssistantImageKind } | null
  onAttachFile: (file: File) => void
  onRemoveImage: () => void
  onImageKindChange: (kind: AssistantImageKind) => void
  chatMode: AssistantChatMode
  onChatModeChange: (mode: AssistantChatMode) => void
  modelLabel: string
  modelMenuOpen: boolean
  onToggleModelMenu: () => void
  sendState: ComposerSendState
  sendLabel: string
  onSend: () => void
  onStop: () => void
  /** Rendered above the composer box, e.g. the model picker. */
  popover?: ReactNode
}) {
  const canSend =
    sendState === 'send' && !locked && (input.trim().length > 0 || Boolean(attachedImage))

  return (
    <div className="relative mx-2.5 shrink-0">
      {popover}
      <div className="flex flex-col rounded-[10px] border border-as-line bg-as-surface transition-[border-color,box-shadow] focus-within:border-as-line-strong focus-within:shadow-[0_0_0_3px_rgba(227,139,92,0.12)]">
        {attachedImage ? (
          <div className="flex items-center gap-2.5 border-as-line-soft border-b px-2.5 py-2">
            <img
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover"
              src={attachedImage.dataUrl}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-as-text">{attachedImage.name}</div>
              <label className="mt-0.5 flex items-center gap-1.5 text-[11px] text-as-faint">
                Use as
                <select
                  className="h-6 rounded-md border border-as-line bg-as-panel px-1.5 text-[11px] text-as-text outline-none focus-visible:border-as-line-strong"
                  data-testid="assistant-image-intent"
                  onChange={(event) => onImageKindChange(event.target.value as AssistantImageKind)}
                  value={attachedImage.kind}
                >
                  {IMAGE_KINDS.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              aria-label="Remove image"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
              onClick={onRemoveImage}
              type="button"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ) : null}

        <div className="relative">
          {ghostText ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3.5 pt-3 pb-1 text-[13px] leading-5"
              data-testid="assistant-inline-autocomplete"
            >
              <span className="invisible">{input}</span>
              <span className="text-as-disabled">{ghostText}</span>
            </div>
          ) : null}
          <textarea
            aria-label="Message the assistant"
            className="relative z-10 block max-h-40 min-h-[60px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[13px] text-as-text leading-5 outline-none placeholder:text-as-faint disabled:opacity-60"
            data-gramm="false"
            data-testid="assistant-input"
            disabled={locked}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            ref={textareaRef}
            spellCheck={false}
            suppressHydrationWarning
            value={input}
          />
        </div>

        <div className="flex items-center gap-1 p-1.5">
          <label
            aria-label="Attach image"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-as-muted transition-colors focus-within:outline-2 focus-within:outline-as-accent/60 ${
              locked
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-pointer hover:bg-as-raised hover:text-as-text'
            }`}
            title="Attach image"
          >
            <input
              accept="image/*"
              className="sr-only"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onAttachFile(file)
                // Reset so the same file can be picked again.
                event.target.value = ''
              }}
              type="file"
            />
            <PaperclipIcon />
          </label>

          <div
            aria-label="Mode"
            className="flex shrink-0 gap-0.5 rounded-lg border border-as-line-soft bg-as-panel p-0.5"
            role="group"
          >
            {MODES.map((mode) => (
              <button
                aria-pressed={chatMode === mode.id}
                className={`h-[26px] rounded-md px-2.5 font-medium text-[12px] transition-colors disabled:cursor-not-allowed ${
                  chatMode === mode.id
                    ? 'bg-as-selected text-as-text'
                    : 'text-as-faint hover:text-as-text'
                }`}
                data-testid={`assistant-chat-mode-${mode.id}`}
                disabled={locked}
                key={mode.id}
                onClick={() => onChatModeChange(mode.id)}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>

          <span className="flex-1" />

          <button
            aria-expanded={modelMenuOpen}
            aria-haspopup="dialog"
            className={`inline-flex h-8 min-w-0 max-w-[132px] items-center gap-1 rounded-lg pr-1.5 pl-2 font-medium text-[12px] transition-colors ${
              modelMenuOpen
                ? 'bg-as-raised text-as-text'
                : 'text-as-muted hover:bg-as-raised hover:text-as-text'
            }`}
            data-testid="assistant-model-chip"
            onClick={onToggleModelMenu}
            title="Choose a model"
            type="button"
          >
            <span className="truncate">{modelLabel}</span>
            <ChevronDownIcon className="shrink-0" size={14} />
          </button>

          {sendState === 'stop' ? (
            <button
              aria-label="Stop"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-as-text text-as-panel transition-colors hover:bg-white"
              data-testid="assistant-send"
              onClick={onStop}
              title="Stop after the current step"
              type="button"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              aria-label={sendLabel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-as-text text-as-panel transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-as-raised disabled:text-as-disabled"
              data-testid="assistant-send"
              disabled={sendState === 'busy' || locked || !canSend}
              onClick={onSend}
              title={sendLabel}
              type="button"
            >
              {sendState === 'busy' ? <SpinnerIcon /> : <ArrowUpIcon />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
