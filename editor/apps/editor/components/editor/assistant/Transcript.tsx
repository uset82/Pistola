'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { ChatMessageContent } from '../ChatMessageContent'
import { SpinnerIcon, UndoIcon } from './icons'

/**
 * Scrolling conversation area. Follows new content while the reader is at the
 * bottom, and stays put when they have scrolled up to read.
 */
export function Transcript({ children, followKey }: { children: ReactNode; followKey: unknown }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedToBottomRef = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: followKey only signals that content changed.
  useEffect(() => {
    const element = scrollRef.current
    if (element && pinnedToBottomRef.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [followKey])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3.5 py-4 [scrollbar-color:#3a3935_transparent] [scrollbar-width:thin]"
      onScroll={(event) => {
        const element = event.currentTarget
        pinnedToBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 48
      }}
      ref={scrollRef}
    >
      {children}
    </div>
  )
}

export function UserMessage({ text, imageUrl }: { text: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-as-raised bg-as-surface px-3 py-2.5 text-[13px] text-as-text leading-5">
      {imageUrl ? (
        <img
          alt="Attached reference"
          className="max-h-32 w-full rounded-md bg-as-panel object-contain"
          src={imageUrl}
        />
      ) : null}
      <ChatMessageContent content={text} speaker="user" />
    </div>
  )
}

export function AssistantMessage({
  text,
  imageUrl,
  isLast,
  onUndo,
}: {
  text: string
  imageUrl?: string
  isLast: boolean
  /** Inline undo for the latest turn when no result block is showing it. */
  onUndo?: () => void
}) {
  return (
    <div
      className="flex flex-col gap-2 text-[13px] text-as-text leading-5"
      data-testid={isLast ? 'assistant-last-result' : undefined}
    >
      {imageUrl ? (
        <img
          alt="Attached reference"
          className="max-h-32 w-full rounded-md bg-as-panel object-contain"
          src={imageUrl}
        />
      ) : null}
      <ChatMessageContent content={text} speaker="assistant" />
      {onUndo ? (
        <button
          className="inline-flex h-7 items-center gap-1.5 self-start rounded-md px-1.5 font-medium text-[12px] text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
          onClick={onUndo}
          type="button"
        >
          <UndoIcon size={13} />
          Undo
        </button>
      ) : null}
    </div>
  )
}

export function PendingLine({ text }: { text: string }) {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 text-[12px] text-as-muted"
      data-testid="assistant-pending"
      role="status"
    >
      <SpinnerIcon />
      {text}
    </div>
  )
}

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-[18px] items-center rounded border border-as-line bg-as-surface px-1.5 font-mono text-[11px] text-as-muted leading-none">
    {children}
  </kbd>
)

export function EmptyState() {
  return (
    <div className="flex flex-col gap-1.5 px-4 pt-5 pb-4">
      <h3 className="font-semibold text-[14px] text-as-text">What should we build?</h3>
      <p className="text-[12px] text-as-muted leading-[18px]">
        Describe a part, a room or an edit. Safe, specific requests run right away; anything
        destructive asks first.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-as-faint">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>⏎</Kbd>send
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>⇧⏎</Kbd>new line
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>Tab</Kbd>accept suggestion
        </span>
      </div>
    </div>
  )
}
