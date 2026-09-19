'use client'

import {
  getOperatorPhaseStatus,
  getOperatorPlanProgress,
  type OperatorPlanStepStatus,
  useOperatorPlanStore,
  useReferencePackStore,
} from '@pascal-app/editor'
import { useState } from 'react'
import {
  CheckIcon,
  ErrorIcon,
  MinusIcon,
  PendingIcon,
  SpinnerIcon,
  UndoIcon,
} from './assistant/icons'

const statusLabel: Record<OperatorPlanStepStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Verified',
  error: 'Failed',
  interrupted: 'Interrupted',
}

type RenderViewsResult = {
  mime?: string
  svg?: string
  partCount?: number
  structure?: {
    errorCount?: number
    warningCount?: number
  }
}

type VisualReview = {
  previewUrl: string
  partCount: number | null
  errorCount: number | null
  warningCount: number | null
}

function StatusIcon({ status }: { status: OperatorPlanStepStatus }) {
  if (status === 'done') return <CheckIcon className="text-emerald-300" size={14} />
  if (status === 'running') return <SpinnerIcon className="text-as-accent" size={14} />
  if (status === 'error') return <ErrorIcon className="text-as-danger" size={14} />
  if (status === 'interrupted') return <ErrorIcon className="text-amber-300" size={14} />
  return <PendingIcon size={14} />
}

export function OperatorPlanPanel() {
  const plan = useOperatorPlanStore((state) => state.plan)
  const referencePack = useReferencePackStore((state) => state.pack)
  const [collapsed, setCollapsed] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [renderingViews, setRenderingViews] = useState(false)
  const [visualReview, setVisualReview] = useState<VisualReview | null>(null)
  const [visualReviewError, setVisualReviewError] = useState<string | null>(null)

  if (!plan) return null

  const progress = getOperatorPlanProgress(plan)
  const placement = 'right-4 top-16 md:right-[412px]'

  if (collapsed) {
    return (
      <button
        className={`pointer-events-auto fixed z-[125] ${placement} inline-flex h-9 max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-as-line bg-as-panel/95 px-3 text-as-text shadow-[0_12px_32px_rgba(0,0,0,0.3)] backdrop-blur-2xl`}
        data-testid="operator-plan-toggle"
        onClick={() => setCollapsed(false)}
        type="button"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="truncate font-semibold text-[12px]">IDE plan</span>
        <span className="font-mono text-[11px] text-as-faint">
          {progress.completed}/{progress.total}
        </span>
      </button>
    )
  }

  const undoPlan = async () => {
    if (!plan.undoAvailable || undoing) return
    setUndoing(true)
    setPanelError(null)
    try {
      const result = await window.pistola?.taskPlan.undo(plan.id)
      if (!result?.undone) setPanelError(result?.reason ?? 'The plan could not be undone.')
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'The plan could not be undone.')
    } finally {
      setUndoing(false)
    }
  }

  const renderEightViews = async () => {
    if (renderingViews || !referencePack) return

    const api = window.pistola as
      | (typeof window.pistola & { renderEightViews?: () => Promise<RenderViewsResult> })
      | undefined

    if (!api?.renderEightViews) {
      setVisualReviewError('Visual review is not available in this editor session yet.')
      return
    }

    setRenderingViews(true)
    setVisualReviewError(null)
    try {
      const result = await api.renderEightViews()
      const svg = typeof result?.svg === 'string' ? result.svg.trim() : ''
      if (result?.mime !== 'image/svg+xml' || !svg) {
        setVisualReviewError('The editor did not return a usable eight-view preview.')
        return
      }

      const errorCount = result.structure?.errorCount
      const warningCount = result.structure?.warningCount
      setVisualReview({
        previewUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        partCount:
          typeof result.partCount === 'number' && Number.isFinite(result.partCount)
            ? result.partCount
            : null,
        errorCount:
          typeof errorCount === 'number' && Number.isFinite(errorCount) ? errorCount : null,
        warningCount:
          typeof warningCount === 'number' && Number.isFinite(warningCount) ? warningCount : null,
      })
    } catch (error) {
      setVisualReviewError(
        error instanceof Error ? error.message : 'The eight-view preview could not be rendered.',
      )
    } finally {
      setRenderingViews(false)
    }
  }

  return (
    <section
      aria-label="IDE operator plan"
      className={`pointer-events-auto fixed z-[125] ${placement} flex max-h-[calc(100dvh-96px)] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[12px] border border-as-line bg-as-panel/95 text-as-text shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_48px_rgba(0,0,0,0.4)] backdrop-blur-2xl`}
      data-testid="operator-plan-panel"
    >
      <header className="border-as-line-soft border-b px-3 py-2.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[12px]">IDE plan</span>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300 uppercase tracking-[0.12em]">
                {plan.source} direct
              </span>
            </div>
            <p className="mt-1 truncate text-[12px] text-as-muted" title={plan.title}>
              {plan.title}
            </p>
          </div>
          <button
            aria-label="Minimize IDE plan"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-as-muted transition-colors hover:bg-as-raised hover:text-as-text"
            onClick={() => setCollapsed(true)}
            type="button"
          >
            <MinusIcon size={14} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-as-line">
            <span
              className="block h-full rounded-full bg-emerald-300 transition-[width] duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </span>
          <span className="font-mono text-[10px] text-as-faint">
            {progress.completed}/{progress.total}
          </span>
        </div>
      </header>

      <div className="overflow-y-auto px-2 py-2 [scrollbar-color:#3a3935_transparent] [scrollbar-width:thin]">
        {plan.phases.map((phase) => {
          const phaseStatus = getOperatorPhaseStatus(phase)
          return (
            <section
              className="mb-2 overflow-hidden rounded-lg border border-as-line-soft last:mb-0"
              data-testid={`operator-plan-phase-${phase.id}`}
              key={phase.id}
            >
              <div className="flex items-center gap-2 bg-as-surface px-2.5 py-2">
                <StatusIcon status={phaseStatus} />
                <span className="min-w-0 flex-1 truncate font-semibold text-[11px] text-as-text">
                  {phase.title}
                </span>
                <span className="font-mono text-[9px] text-as-faint uppercase">
                  {statusLabel[phaseStatus]}
                </span>
              </div>
              <ol>
                {phase.steps.map((step) => (
                  <li
                    className="border-as-line-soft border-t px-2.5 py-2 first:border-t-0"
                    data-testid={`operator-plan-step-${step.id}`}
                    key={step.id}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                        <StatusIcon status={step.status} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-as-muted leading-[17px]">{step.title}</p>
                        {step.evidence ? (
                          <p className="mt-0.5 text-[10px] text-emerald-200/75 leading-[15px]">
                            {step.evidence.summary}
                          </p>
                        ) : null}
                        {step.error ? (
                          <p className="mt-0.5 text-[10px] text-as-danger leading-[15px]">
                            {step.error}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}

        <section
          aria-label="Visual review"
          className="mt-2 overflow-hidden rounded-lg border border-as-line-soft"
          data-testid="operator-plan-visual-review"
        >
          <div className="flex items-center gap-2 bg-as-surface px-2.5 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[11px] text-as-text">Visual review</p>
              <p className="mt-0.5 truncate text-[10px] text-as-muted">
                {referencePack
                  ? `${referencePack.assets.length}/8 approved reference views`
                  : 'An approved eight-view reference pack is required'}
              </p>
            </div>
            <button
              aria-busy={renderingViews}
              className="inline-flex h-7 shrink-0 items-center rounded-md border border-as-line px-2.5 font-medium text-[11px] text-as-text transition-colors hover:bg-as-raised disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="operator-plan-render-views"
              disabled={!referencePack || renderingViews}
              onClick={() => void renderEightViews()}
              type="button"
            >
              {renderingViews ? 'Rendering…' : 'Render 8 views'}
            </button>
          </div>

          {visualReview ? (
            <div className="border-as-line-soft border-t px-2.5 py-2">
              <img
                alt="Eight canonical scene views for visual review"
                className="block max-h-44 w-full rounded-md border border-as-line-soft bg-as-raised object-contain"
                src={visualReview.previewUrl}
              />
              <p
                aria-live="polite"
                className={`mt-2 text-[10px] leading-[15px] ${
                  visualReview.errorCount === null
                    ? 'text-as-muted'
                    : visualReview.errorCount > 0
                      ? 'text-as-danger'
                      : visualReview.warningCount !== null && visualReview.warningCount > 0
                        ? 'text-amber-300'
                        : 'text-emerald-200/75'
                }`}
              >
                {visualReview.partCount === null
                  ? 'Scene summary unavailable'
                  : `${visualReview.partCount} parts`}
                {visualReview.errorCount === null
                  ? ' · Structural summary unavailable'
                  : ` · ${visualReview.errorCount} ${
                      visualReview.errorCount === 1 ? 'error' : 'errors'
                    }${
                      visualReview.warningCount === null
                        ? ''
                        : ` · ${visualReview.warningCount} ${
                            visualReview.warningCount === 1 ? 'warning' : 'warnings'
                          }`
                    }`}
              </p>
            </div>
          ) : null}

          {visualReviewError ? (
            <p
              aria-live="polite"
              className="border-as-line-soft border-t px-2.5 py-2 text-[10px] text-as-danger"
            >
              {visualReviewError}
            </p>
          ) : null}
        </section>
      </div>

      <footer className="flex items-center gap-2 border-as-line-soft border-t px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-as-faint">
          Provider-free · {statusLabel[progress.status]}
        </span>
        {plan.undoAvailable ? (
          <button
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-as-line px-2.5 font-medium text-[11px] text-as-text transition-colors hover:bg-as-raised disabled:opacity-50"
            data-testid="operator-plan-undo"
            disabled={undoing}
            onClick={() => void undoPlan()}
            type="button"
          >
            <UndoIcon size={12} />
            {undoing ? 'Undoing…' : 'Undo plan'}
          </button>
        ) : null}
      </footer>
      {panelError ? (
        <p className="border-as-line-soft border-t px-3 py-2 text-[10px] text-as-danger">
          {panelError}
        </p>
      ) : null}
    </section>
  )
}
