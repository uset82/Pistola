'use client'

import { CheckIcon, ErrorIcon, UndoIcon } from './icons'

const MAX_TRACE_LINES = 6

const TEXT_BUTTON_CLASS =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 font-medium text-[12px] text-as-muted transition-colors hover:bg-as-raised hover:text-as-text disabled:cursor-not-allowed disabled:opacity-40'

/**
 * What the last turn did: a "Done" line, the applied actions as a compact
 * trace, and the follow-ups (undo, retry, stop, edit sketch).
 */
export function ExecutionResult({
  executed,
  note,
  error,
  actionLabels,
  busy,
  onStopBuild,
  onRetry,
  onUndo,
  onEditSketch,
}: {
  executed: boolean
  note?: string
  error: string | null
  actionLabels: string[]
  busy: boolean
  onStopBuild?: () => void
  onRetry?: () => void
  onUndo?: () => void
  onEditSketch?: () => void
}) {
  const visibleLabels = actionLabels.slice(0, MAX_TRACE_LINES)
  const hiddenCount = actionLabels.length - visibleLabels.length
  const hasFollowUps = Boolean(onStopBuild || onRetry || onUndo || onEditSketch)

  return (
    <div className="flex flex-col gap-2" data-testid="assistant-execution-status">
      {executed && !error ? (
        <div className="flex items-start gap-2 text-[13px] text-as-text leading-5">
          <CheckIcon className="mt-[3px] shrink-0 text-as-muted" size={14} />
          <span>Done{note ? <span className="text-as-muted"> — {note}</span> : null}</span>
        </div>
      ) : null}

      {error ? (
        <div
          className="flex items-start gap-2 text-[12px] text-as-danger leading-[18px]"
          role="alert"
        >
          <ErrorIcon className="mt-px shrink-0" size={14} />
          <span className="min-w-0 flex-1 break-words">{error}</span>
        </div>
      ) : null}

      {executed && !error && visibleLabels.length > 0 ? (
        <ul aria-label="Changes applied" className="flex flex-col gap-0.5 pl-6">
          {visibleLabels.map((label, index) => (
            <li
              className="truncate font-mono text-[11px] text-as-faint leading-5"
              key={`${label}-${index}`}
              title={label}
            >
              {label}
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="font-mono text-[11px] text-as-faint leading-5">
              and {hiddenCount} more
            </li>
          ) : null}
        </ul>
      ) : null}

      {hasFollowUps ? (
        <div className="-ml-2 flex flex-wrap items-center gap-0.5 pl-6">
          {onStopBuild ? (
            <button className={TEXT_BUTTON_CLASS} onClick={onStopBuild} type="button">
              Stop build
            </button>
          ) : null}
          {onUndo ? (
            <button
              className={TEXT_BUTTON_CLASS}
              data-testid="assistant-undo-last-turn"
              disabled={busy}
              onClick={onUndo}
              type="button"
            >
              <UndoIcon size={13} />
              Undo
            </button>
          ) : null}
          {onRetry ? (
            <button className={TEXT_BUTTON_CLASS} disabled={busy} onClick={onRetry} type="button">
              Retry
            </button>
          ) : null}
          {onEditSketch ? (
            <button className={TEXT_BUTTON_CLASS} onClick={onEditSketch} type="button">
              Edit sketch
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
