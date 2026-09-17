import { AGENT_LABELS } from '../../lib/assistant-agent-router'
import { getTaskPlanProgress, type TaskPlan } from '../../lib/assistant-task-plan'

type TaskPlanStatus = 'ready' | 'executing' | 'completed' | 'error'

type AssistantTaskPlanCardProps = {
  taskPlan: TaskPlan
  activeStepIndex: number | null
  taskPlanStatus: TaskPlanStatus
  onExecute: () => void
  onRetryStep: (stepIndex: number) => void
  onStopAfterCurrent: () => void
}

export const AssistantTaskPlanCard = ({
  taskPlan,
  activeStepIndex,
  taskPlanStatus,
  onExecute,
  onRetryStep,
  onStopAfterCurrent,
}: AssistantTaskPlanCardProps) => {
  const progress = getTaskPlanProgress(taskPlan)
  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <div
      className="rounded-2xl border border-cyan-300/15 bg-white/[0.045] p-3"
      data-testid="assistant-task-plan-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-[12px] text-white/90">📋 Task Plan</div>
          <div className="mt-1 text-[11px] text-white/50">
            {progress.completed}/{progress.total} complete
          </div>
        </div>
        <div
          className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ${
            taskPlanStatus === 'completed'
              ? 'bg-emerald-400/10 text-emerald-100'
              : taskPlanStatus === 'error'
                ? 'bg-rose-400/10 text-rose-100'
                : taskPlanStatus === 'executing'
                  ? 'bg-amber-300/10 text-amber-100'
                  : 'bg-cyan-300/10 text-cyan-100'
          }`}
        >
          {taskPlanStatus}
        </div>
      </div>

      <div className="mt-2 text-[12px] text-white/68">{taskPlan.title}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full transition-[width,background-color] duration-300 ease-out ${
            taskPlanStatus === 'completed'
              ? 'bg-emerald-300'
              : taskPlanStatus === 'error'
                ? 'bg-rose-300'
                : taskPlanStatus === 'executing'
                  ? 'bg-amber-300'
                  : 'bg-cyan-300'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
        {taskPlan.steps.map((step, index) => {
          const badge = AGENT_LABELS[step.agent ?? 'general']
          const statusIcon =
            step.status === 'done'
              ? '✅'
              : step.status === 'running'
                ? '🔄'
                : step.status === 'error'
                  ? '❌'
                  : '⏳'
          const statusLabel =
            step.status === 'done'
              ? 'done'
              : step.status === 'running'
                ? 'running'
                : step.status === 'error'
                  ? 'error'
                  : 'pending'

          return (
            <div
              className={`rounded-2xl border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-200 ${
                step.status === 'error'
                  ? 'border-rose-300/20 bg-rose-400/8'
                  : step.status === 'done'
                    ? 'border-emerald-300/15 bg-emerald-400/8'
                    : step.status === 'running'
                      ? 'border-amber-300/20 bg-amber-300/8'
                      : 'border-white/8 bg-black/20'
              } ${activeStepIndex === index ? 'ring-1 ring-cyan-300/30' : ''}`}
              key={step.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12px] text-white/82">
                  {statusIcon} {index + 1}. {step.description}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-white/70">
                    {badge.emoji} {badge.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                    {statusLabel}
                  </span>
                </div>
              </div>
              {step.error ? (
                <div className="mt-2 text-[11px] leading-5 text-rose-100">{step.error}</div>
              ) : null}
              {step.status === 'error' ? (
                <button
                  className="mt-2 inline-flex items-center justify-center rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 font-medium text-[12px] text-rose-100 transition hover:bg-rose-300/20"
                  onClick={() => onRetryStep(index)}
                  type="button"
                >
                  Retry Step
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex items-center justify-center rounded-xl bg-cyan-300 px-3 py-2 font-medium text-[12px] text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={taskPlanStatus === 'executing'}
          onClick={onExecute}
          type="button"
        >
          {taskPlanStatus === 'completed' ? 'Run Again' : 'Execute Plan'}
        </button>
        {taskPlanStatus === 'executing' ? (
          <button
            className="inline-flex items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 font-medium text-[12px] text-amber-100 transition hover:bg-amber-300/20"
            onClick={onStopAfterCurrent}
            type="button"
          >
            Stop After Current
          </button>
        ) : null}
      </div>
    </div>
  )
}
