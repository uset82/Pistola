'use client'

import { AGENT_LABELS } from '../../../lib/assistant-agent-router'
import { getTaskPlanProgress, type TaskPlan } from '../../../lib/assistant-task-plan'
import { CheckIcon, ErrorIcon, PendingIcon, SpinnerIcon } from './icons'

export type TaskPlanStatus = 'ready' | 'executing' | 'completed' | 'error'

const PROGRESS_FILL: Record<TaskPlanStatus, string> = {
  ready: 'bg-as-faint',
  executing: 'bg-as-accent',
  completed: 'bg-as-text',
  error: 'bg-as-danger',
}

export function PlanChecklist({
  taskPlan,
  activeStepIndex,
  taskPlanStatus,
  onExecute,
  onRetryStep,
  onStopAfterCurrent,
}: {
  taskPlan: TaskPlan
  activeStepIndex: number | null
  taskPlanStatus: TaskPlanStatus
  onExecute: () => void
  onRetryStep: (stepIndex: number) => void
  onStopAfterCurrent: () => void
}) {
  const progress = getTaskPlanProgress(taskPlan)
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <section
      aria-label="Plan"
      className="overflow-hidden rounded-[10px] border border-as-line"
      data-testid="assistant-task-plan-card"
    >
      <div className="flex items-center gap-2 border-as-line-soft border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-[12px] text-as-text">Plan</span>
            <span className="font-mono text-[11px] text-as-faint">
              {progress.completed} of {progress.total}
            </span>
          </div>
          {taskPlan.title ? (
            <div className="mt-0.5 truncate text-[12px] text-as-muted" title={taskPlan.title}>
              {taskPlan.title}
            </div>
          ) : null}
        </div>
        <span
          aria-label={`${percent}% complete`}
          className="block h-[3px] w-16 shrink-0 overflow-hidden rounded-full bg-as-line"
          role="img"
        >
          <span
            className={`block h-full transition-[width] duration-300 ease-out ${PROGRESS_FILL[taskPlanStatus]}`}
            style={{ width: `${percent}%` }}
          />
        </span>
      </div>

      <ol className="max-h-56 overflow-y-auto py-1 [scrollbar-color:#3a3935_transparent] [scrollbar-width:thin]">
        {taskPlan.steps.map((step, index) => {
          const isActive = activeStepIndex === index || step.status === 'running'
          return (
            <li
              aria-current={isActive ? 'step' : undefined}
              className={`flex flex-col gap-1 px-3 py-2 ${isActive ? 'bg-as-surface' : ''}`}
              key={step.id}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-[3px] flex w-3.5 shrink-0 justify-center">
                  {step.status === 'done' ? (
                    <CheckIcon className="text-as-muted" size={14} />
                  ) : step.status === 'running' ? (
                    <SpinnerIcon />
                  ) : step.status === 'error' ? (
                    <ErrorIcon className="text-as-danger" size={14} />
                  ) : (
                    <PendingIcon />
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 text-[12px] leading-5 ${
                    step.status === 'running' ? 'font-medium text-as-text' : 'text-as-muted'
                  }`}
                >
                  {step.description}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-as-faint leading-5">
                  {AGENT_LABELS[step.agent ?? 'general'].label.toLowerCase()}
                </span>
              </div>
              {step.error ? (
                <div className="flex items-start gap-2 pl-6">
                  <p className="min-w-0 flex-1 text-[12px] text-as-danger leading-[18px]">
                    {step.error}
                  </p>
                  {step.status === 'error' ? (
                    <button
                      className="h-7 shrink-0 rounded-md border border-as-line px-2.5 font-medium text-[12px] text-as-text transition-colors hover:bg-as-raised"
                      onClick={() => onRetryStep(index)}
                      type="button"
                    >
                      Retry step
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="flex items-center gap-2 border-as-line-soft border-t px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-as-faint">
          {taskPlanStatus === 'executing'
            ? 'Running'
            : taskPlanStatus === 'completed'
              ? 'Finished'
              : taskPlanStatus === 'error'
                ? 'Stopped on an error'
                : 'Ready to run'}
        </span>
        {taskPlanStatus === 'executing' ? (
          <button
            className="h-7 rounded-md border border-as-line px-2.5 font-medium text-[12px] text-as-text transition-colors hover:bg-as-raised"
            onClick={onStopAfterCurrent}
            type="button"
          >
            Stop after this step
          </button>
        ) : (
          <button
            className="h-7 rounded-md bg-as-text px-3 font-semibold text-[12px] text-as-panel transition-colors hover:bg-white"
            onClick={onExecute}
            type="button"
          >
            {taskPlanStatus === 'completed' ? 'Run again' : 'Run plan'}
          </button>
        )}
      </div>
    </section>
  )
}
