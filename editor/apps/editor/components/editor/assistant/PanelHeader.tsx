'use client'

import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ArrowLeftIcon, AssistantMarkIcon, DockLeftIcon, MinusIcon, NewChatIcon } from './icons'

export const ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-as-muted transition-colors hover:bg-as-raised hover:text-as-text focus-visible:outline-2 focus-visible:outline-as-accent/60 disabled:cursor-not-allowed disabled:opacity-40'

export function PanelHeader({
  title = 'Assistant',
  isDragging,
  onDragStart,
  onBack,
  onNewChat,
  newChatDisabled = false,
  onDockLeft,
  onMinimize,
}: {
  title?: string
  isDragging: boolean
  onDragStart: (event: ReactPointerEvent<HTMLElement>) => void
  /** Shows a back arrow instead of the mark, for sub-views such as providers. */
  onBack?: () => void
  onNewChat?: () => void
  newChatDisabled?: boolean
  onDockLeft?: () => void
  onMinimize: () => void
}) {
  let leading: ReactNode = (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-as-line bg-as-surface text-as-accent">
      <AssistantMarkIcon size={14} />
    </span>
  )
  if (onBack) {
    leading = (
      <button
        aria-label="Back to chat"
        className={ICON_BUTTON_CLASS}
        onClick={onBack}
        title="Back to chat"
        type="button"
      >
        <ArrowLeftIcon />
      </button>
    )
  }

  return (
    <header
      className={`flex h-12 shrink-0 touch-none select-none items-center gap-2.5 border-as-line-soft border-b pr-1.5 ${
        onBack ? 'pl-1.5' : 'pl-3.5'
      } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      data-testid="assistant-drag-handle"
      onPointerDown={onDragStart}
      title="Drag to move"
    >
      {leading}
      <h2 className="min-w-0 flex-1 truncate font-semibold text-[14px] text-as-text tracking-[-0.005em]">
        {title}
      </h2>
      {onNewChat ? (
        <button
          aria-label="New chat"
          className={ICON_BUTTON_CLASS}
          data-testid="assistant-new-chat"
          disabled={newChatDisabled}
          onClick={onNewChat}
          title="New chat (keeps the scene)"
          type="button"
        >
          <NewChatIcon />
        </button>
      ) : null}
      {onDockLeft ? (
        <button
          aria-label="Dock left"
          className={ICON_BUTTON_CLASS}
          data-testid="assistant-dock-left"
          onClick={onDockLeft}
          title="Dock left"
          type="button"
        >
          <DockLeftIcon />
        </button>
      ) : null}
      <button
        aria-label="Minimize assistant"
        className={ICON_BUTTON_CLASS}
        data-testid="assistant-hide"
        onClick={onMinimize}
        title="Minimize"
        type="button"
      >
        <MinusIcon />
      </button>
    </header>
  )
}
