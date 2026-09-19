'use client'

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

export type ReviewActionKind = 'create' | 'edit' | 'delete'

export type ReviewActionItem = { label: string; kind: ReviewActionKind }

type Candidate = { id: string; name?: string | null; type: string }

const KIND_GLYPH: Record<ReviewActionKind, { glyph: string; label: string; className: string }> = {
  create: { glyph: '+', label: 'Add', className: 'text-as-text' },
  edit: { glyph: '~', label: 'Change', className: 'text-as-muted' },
  delete: { glyph: '−', label: 'Remove', className: 'text-as-danger' },
}

const Kbd = ({ children, strong = false }: { children: ReactNode; strong?: boolean }) => (
  <kbd
    className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1 font-mono text-[11px] leading-none ${
      strong ? 'border-as-line-strong text-as-text' : 'border-as-line text-as-muted'
    }`}
  >
    {children}
  </kbd>
)

const CandidateList = ({ candidates }: { candidates: Candidate[] }) => (
  <ul className="flex max-h-28 flex-col overflow-y-auto border-as-line-soft border-t bg-as-panel px-3 py-2 font-mono text-[11px] leading-[22px]">
    {candidates.map((candidate) => (
      <li className="flex gap-2" key={candidate.id}>
        <span className="min-w-0 flex-1 truncate text-as-text">
          {candidate.name ?? candidate.id}
        </span>
        <span className="shrink-0 text-as-faint">{candidate.type}</span>
      </li>
    ))}
  </ul>
)

/**
 * Numbered approval prompt shown before a plan that needs review. 1 applies,
 * 2 applies and turns autopilot on, 3 or Esc hands control back to the composer.
 */
export function ReviewPrompt({
  actions,
  scopeSummary,
  explanation,
  candidates,
  autopilotOn,
  onApply,
  onApplyAndAutopilot,
  onRevise,
}: {
  actions: ReviewActionItem[]
  scopeSummary: string
  explanation?: string
  candidates: Candidate[]
  autopilotOn: boolean
  onApply: () => void
  onApplyAndAutopilot: () => void
  onRevise: () => void
}) {
  const applyRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    applyRef.current?.focus({ preventScroll: true })
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)
      return
    if (event.key === '1') onApply()
    else if (event.key === '2' && !autopilotOn) onApplyAndAutopilot()
    else if (event.key === '3' || event.key === 'Escape') onRevise()
    else return
    event.preventDefault()
  }

  const optionClass =
    'flex h-9 w-full items-center gap-2.5 rounded-[7px] px-2 text-left font-medium text-[12px] transition-colors focus-visible:outline-none'

  return (
    <section
      aria-labelledby="assistant-review-title"
      className="overflow-hidden rounded-[10px] border border-as-line-strong bg-[#181817]"
      data-testid="assistant-review-card"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col gap-1 px-3 pt-3 pb-2.5">
        <h3 className="font-semibold text-[13px] text-as-text" id="assistant-review-title">
          Apply {actions.length} {actions.length === 1 ? 'change' : 'changes'}?
        </h3>
        <p className="text-[12px] text-as-muted leading-[18px]">
          {explanation ? `${explanation} ` : ''}
          {scopeSummary}
        </p>
      </div>
      {candidates.length > 0 ? <CandidateList candidates={candidates} /> : null}
      <ul
        aria-label="Changes"
        className="flex max-h-36 flex-col overflow-y-auto border-as-line-soft border-y bg-as-panel px-3 py-2 font-mono text-[11px] leading-[22px]"
      >
        {actions.map((action, index) => {
          const kind = KIND_GLYPH[action.kind]
          return (
            <li className="flex gap-2" key={`${action.label}-${index}`}>
              <span aria-hidden="true" className={`w-2.5 shrink-0 ${kind.className}`}>
                {kind.glyph}
              </span>
              <span className="sr-only">{kind.label}:</span>
              <span className="min-w-0 flex-1 text-as-text">{action.label}</span>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col gap-0.5 p-1.5">
        <button
          className={`${optionClass} bg-as-raised text-as-text hover:bg-as-selected focus-visible:bg-as-selected`}
          data-testid="assistant-apply-plan"
          onClick={onApply}
          ref={applyRef}
          type="button"
        >
          <Kbd strong>1</Kbd>
          <span className="flex-1">Apply changes</span>
          <span className="font-mono text-[11px] text-as-faint">⏎</span>
        </button>
        {autopilotOn ? null : (
          <button
            className={`${optionClass} text-as-muted hover:bg-as-raised hover:text-as-text focus-visible:bg-as-raised focus-visible:text-as-text`}
            onClick={onApplyAndAutopilot}
            type="button"
          >
            <Kbd>2</Kbd>
            <span className="flex-1">Apply, and switch to autopilot</span>
          </button>
        )}
        <button
          className={`${optionClass} text-as-muted hover:bg-as-raised hover:text-as-text focus-visible:bg-as-raised focus-visible:text-as-text`}
          onClick={onRevise}
          type="button"
        >
          <Kbd>3</Kbd>
          <span className="flex-1">No, tell the assistant what to change</span>
          <span className="font-mono text-[11px] text-as-faint">esc</span>
        </button>
      </div>
    </section>
  )
}

export function ClarifyPrompt({
  explanation,
  ambiguities,
  candidates,
}: {
  explanation?: string
  ambiguities: string[]
  candidates: Candidate[]
}) {
  return (
    <section
      aria-label="The assistant needs more detail"
      className="overflow-hidden rounded-[10px] border border-as-line-strong bg-[#181817]"
      data-testid="assistant-clarify-card"
    >
      <div className="flex flex-col gap-1.5 px-3 pt-3 pb-2.5">
        <h3 className="font-semibold text-[13px] text-as-text">Which one do you mean?</h3>
        {explanation ? (
          <p className="text-[12px] text-as-muted leading-[18px]">{explanation}</p>
        ) : null}
        {ambiguities.map((ambiguity, index) => (
          <p className="text-[12px] text-as-muted leading-[18px]" key={`${ambiguity}-${index}`}>
            {ambiguity}
          </p>
        ))}
      </div>
      {candidates.length > 0 ? <CandidateList candidates={candidates} /> : null}
      <p className="border-as-line-soft border-t px-3 py-2 text-[11px] text-as-faint">
        Reply below with the name, or select it in the scene and send again.
      </p>
    </section>
  )
}
