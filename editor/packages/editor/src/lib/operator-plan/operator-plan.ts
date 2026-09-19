'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'

export const operatorPlanSources = [
  'codex',
  'ide',
  'mcp',
  'webmcp',
  'claude-code',
  'cursor',
  'antigravity',
  'workbuddy',
] as const
export const operatorPlanStepKinds = ['execution', 'validation', 'observation'] as const
export const operatorPlanStepStatuses = [
  'pending',
  'running',
  'done',
  'error',
  'interrupted',
] as const

export type OperatorPlanSource = (typeof operatorPlanSources)[number]
export type OperatorPlanStepKind = (typeof operatorPlanStepKinds)[number]
export type OperatorPlanStepStatus = (typeof operatorPlanStepStatuses)[number]
export type OperatorPlanStatus = OperatorPlanStepStatus

export type OperatorPlanEvidence = {
  kind: 'execution' | 'validation' | 'observation'
  summary: string
  actionCount?: number
  createdNodeIds?: string[]
  warnings?: string[]
}

export type OperatorPlanStep = {
  id: string
  title: string
  kind: OperatorPlanStepKind
  status: OperatorPlanStepStatus
  error?: string
  evidence?: OperatorPlanEvidence
  startedAt?: number
  completedAt?: number
}

export type OperatorPlanPhase = {
  id: string
  title: string
  steps: OperatorPlanStep[]
}

export type OperatorPlan = {
  id: string
  title: string
  prompt?: string
  source: OperatorPlanSource
  status: OperatorPlanStatus
  phases: OperatorPlanPhase[]
  createdAt: number
  updatedAt: number
  undoAvailable: boolean
  summary?: string
}

export type OperatorPlanInput = {
  id?: string
  title: string
  prompt?: string
  source?: OperatorPlanSource
  phases: Array<{
    id: string
    title: string
    steps: Array<{
      id: string
      title: string
      kind?: OperatorPlanStepKind
    }>
  }>
}

export type OperatorPlanStepUpdate = {
  planId: string
  phaseId: string
  stepId: string
  status: OperatorPlanStepStatus
  error?: string
  evidence?: OperatorPlanEvidence
}

export type OperatorPlanProgress = {
  completed: number
  total: number
  percent: number
  status: OperatorPlanStatus
}

const evidenceSchema = z.object({
  kind: z.enum(['execution', 'validation', 'observation']),
  summary: z.string().trim().min(1),
  actionCount: z.number().int().nonnegative().optional(),
  createdNodeIds: z.array(z.string().min(1)).optional(),
  warnings: z.array(z.string()).optional(),
})

const storedPlanSchema: z.ZodType<OperatorPlan> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().optional(),
  source: z.enum(operatorPlanSources),
  status: z.enum(operatorPlanStepStatuses),
  phases: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      steps: z.array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          kind: z.enum(operatorPlanStepKinds),
          status: z.enum(operatorPlanStepStatuses),
          error: z.string().optional(),
          evidence: evidenceSchema.optional(),
          startedAt: z.number().optional(),
          completedAt: z.number().optional(),
        }),
      ),
    }),
  ),
  createdAt: z.number(),
  updatedAt: z.number(),
  undoAvailable: z.boolean(),
  summary: z.string().optional(),
})

const inputSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    prompt: z.string().trim().min(1).optional(),
    source: z.enum(operatorPlanSources).default('codex'),
    phases: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          title: z.string().trim().min(1),
          steps: z
            .array(
              z.object({
                id: z.string().trim().min(1),
                title: z.string().trim().min(1),
                kind: z.enum(operatorPlanStepKinds).default('execution'),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  })
  .superRefine((value, context) => {
    const phaseIds = new Set<string>()
    const stepIds = new Set<string>()
    for (const [phaseIndex, phase] of value.phases.entries()) {
      if (phaseIds.has(phase.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate phase id "${phase.id}".`,
          path: ['phases', phaseIndex, 'id'],
        })
      }
      phaseIds.add(phase.id)
      for (const [stepIndex, step] of phase.steps.entries()) {
        if (stepIds.has(step.id)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate step id "${step.id}".`,
            path: ['phases', phaseIndex, 'steps', stepIndex, 'id'],
          })
        }
        stepIds.add(step.id)
      }
    }
  })

const makePlanId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `operator-${crypto.randomUUID()}`
    : `operator-${Date.now()}`

export const deriveOperatorStatus = (
  statuses: OperatorPlanStepStatus[],
): OperatorPlanStatus => {
  if (statuses.length === 0) return 'pending'
  if (statuses.some((status) => status === 'error')) return 'error'
  if (statuses.some((status) => status === 'interrupted')) return 'interrupted'
  if (statuses.every((status) => status === 'done')) return 'done'
  if (statuses.some((status) => status === 'running' || status === 'done')) return 'running'
  return 'pending'
}

const planStatuses = (plan: Pick<OperatorPlan, 'phases'>) =>
  plan.phases.flatMap((phase) => phase.steps.map((step) => step.status))

export const getOperatorPhaseStatus = (phase: OperatorPlanPhase): OperatorPlanStatus =>
  deriveOperatorStatus(phase.steps.map((step) => step.status))

export const getOperatorPlanProgress = (plan: OperatorPlan): OperatorPlanProgress => {
  const statuses = planStatuses(plan)
  const completed = statuses.filter((status) => status === 'done').length
  return {
    completed,
    total: statuses.length,
    percent: statuses.length > 0 ? Math.round((completed / statuses.length) * 100) : 0,
    status: deriveOperatorStatus(statuses),
  }
}

export const createOperatorPlan = (input: OperatorPlanInput, now = Date.now()): OperatorPlan => {
  const parsed = inputSchema.parse(input)
  const plan: OperatorPlan = {
    id: parsed.id ?? makePlanId(),
    title: parsed.title,
    prompt: parsed.prompt,
    source: parsed.source,
    status: 'pending',
    phases: parsed.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      steps: phase.steps.map((step) => ({
        id: step.id,
        title: step.title,
        kind: step.kind,
        status: 'pending',
      })),
    })),
    createdAt: now,
    updatedAt: now,
    undoAvailable: false,
  }
  return plan
}

export const updateOperatorPlanStep = (
  plan: OperatorPlan,
  update: OperatorPlanStepUpdate,
  now = Date.now(),
): OperatorPlan => {
  if (update.planId !== plan.id) {
    throw new Error(`Operator plan "${update.planId}" is not active.`)
  }
  if (update.status === 'done') {
    evidenceSchema.parse(update.evidence)
  }
  if (update.status === 'error' && !update.error?.trim()) {
    throw new Error('An error step requires a non-empty error message.')
  }

  let found = false
  const phases = plan.phases.map((phase) => {
    if (phase.id !== update.phaseId) return phase
    const steps = phase.steps.map((step) => {
      if (step.id !== update.stepId) return step
      found = true
      const startedAt = update.status === 'running' ? now : step.startedAt
      const completedAt = update.status === 'done' ? now : undefined
      return {
        ...step,
        status: update.status,
        error: update.status === 'error' || update.status === 'interrupted' ? update.error : undefined,
        evidence: update.status === 'done' ? update.evidence : undefined,
        startedAt,
        completedAt,
      }
    })
    return { ...phase, steps }
  })

  if (!found) {
    throw new Error(`Operator plan step "${update.phaseId}/${update.stepId}" was not found.`)
  }

  return {
    ...plan,
    phases,
    status: deriveOperatorStatus(phases.flatMap((phase) => phase.steps.map((step) => step.status))),
    updatedAt: now,
  }
}

export const recoverInterruptedOperatorPlan = (
  plan: OperatorPlan | null,
  now = Date.now(),
): OperatorPlan | null => {
  if (!plan) return null
  let interrupted = false
  const phases = plan.phases.map((phase) => ({
    ...phase,
    steps: phase.steps.map((step) => {
      if (step.status !== 'running') return step
      interrupted = true
      return {
        ...step,
        status: 'interrupted' as const,
        error: 'Execution was interrupted by a page reload.',
        completedAt: undefined,
      }
    }),
  }))
  const status = deriveOperatorStatus(phases.flatMap((phase) => phase.steps.map((step) => step.status)))
  if (!interrupted && !plan.undoAvailable && plan.status === status) return plan
  return {
    ...plan,
    phases,
    status,
    updatedAt: interrupted ? now : plan.updatedAt,
    undoAvailable: false,
  }
}

type OperatorPlanStore = {
  plan: OperatorPlan | null
  setPlan: (plan: OperatorPlan | null) => void
  updateStep: (update: OperatorPlanStepUpdate) => OperatorPlan
  setUndoAvailable: (planId: string, undoAvailable: boolean) => OperatorPlan
  setSummary: (planId: string, summary: string) => OperatorPlan
  clear: (planId?: string) => void
}

export const useOperatorPlanStore = create<OperatorPlanStore>()(
  persist(
    (set, get) => ({
      plan: null,
      setPlan: (plan) => set({ plan }),
      updateStep: (update) => {
        const current = get().plan
        if (!current) throw new Error('No operator plan is active.')
        const plan = updateOperatorPlanStep(current, update)
        set({ plan })
        return plan
      },
      setUndoAvailable: (planId, undoAvailable) => {
        const current = get().plan
        if (!current || current.id !== planId) throw new Error(`Operator plan "${planId}" is not active.`)
        const plan = { ...current, undoAvailable, updatedAt: Date.now() }
        set({ plan })
        return plan
      },
      setSummary: (planId, summary) => {
        const current = get().plan
        if (!current || current.id !== planId) throw new Error(`Operator plan "${planId}" is not active.`)
        if (getOperatorPlanProgress(current).status !== 'done') {
          throw new Error('Every operator plan step must be done before the plan can be completed.')
        }
        const plan = { ...current, status: 'done' as const, summary: summary.trim(), updatedAt: Date.now() }
        set({ plan })
        return plan
      },
      clear: (planId) => {
        const current = get().plan
        if (planId && current?.id !== planId) throw new Error(`Operator plan "${planId}" is not active.`)
        set({ plan: null })
      },
    }),
    {
      name: 'pistola-operator-plan-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ plan: state.plan }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<OperatorPlanStore> | undefined
        const parsed = storedPlanSchema.safeParse(stored?.plan)
        return {
          ...current,
          plan: recoverInterruptedOperatorPlan(parsed.success ? parsed.data : null),
        }
      },
    },
  ),
)
