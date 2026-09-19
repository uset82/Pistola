'use client'

import { AutopilotIcon, ReviewIcon } from './icons'

export type ExecutionPolicy = 'autopilot' | 'review'

/** Bottom line of the panel: where the assistant will act, and how. */
export function StatusLine({
  context,
  policy,
  onTogglePolicy,
}: {
  context: string
  policy: ExecutionPolicy
  onTogglePolicy: () => void
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 pr-2 pl-3.5 font-mono text-[11px] text-as-faint">
      <span className="min-w-0 flex-1 truncate" title={context}>
        {context}
      </span>
      <button
        className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
        data-testid="assistant-policy-toggle"
        onClick={onTogglePolicy}
        title={
          policy === 'autopilot'
            ? 'Autopilot: safe, specific edits apply without asking. Click to review every plan.'
            : 'Review: every plan asks before it changes the scene. Click for autopilot.'
        }
        type="button"
      >
        {policy === 'autopilot' ? (
          <AutopilotIcon className="text-as-accent" size={14} />
        ) : (
          <ReviewIcon className="text-as-faint" size={14} />
        )}
        {policy}
      </button>
    </div>
  )
}
