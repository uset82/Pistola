'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { getAllCapabilities } from '../assistant/capabilities/registry'
import {
  executeAgentTool,
  inspectScene,
  getNodes,
  getNodeBounds,
  measure,
  searchCatalog,
  listCapabilities,
  getWorkspaceState,
} from '../assistant/agent-tools'
import {
  executeAssistantPlan,
  validateAssistantPlan,
  type AssistantExecutionResult,
} from '../assistant/execute'
import { getAssistantWorkspaceContext } from '../assistant/context'
import { CREATION_RECIPES, listCreationRecipes } from '../assistant/recipes/creation-recipes'
import { createAssistantRuntime } from '../assistant/runtime'
import useCad from '../../store/use-cad'
import useMac from '../../store/use-mac'
import { isDestructiveAssistantActionType, type AssistantAction } from '../assistant/types'
import {
  createOperatorPlan,
  getOperatorPlanProgress,
  type OperatorPlanEvidence,
  type OperatorPlanInput,
  type OperatorPlanStepUpdate,
  useOperatorPlanStore,
} from '../operator-plan'
import { applySceneGraphToEditor, type SceneGraph } from '../scene'

export const PISTOLA_API_VERSION = 1

const AGENT_WORKFLOW = {
  alwaysPassExplicitIds: true,
  useForwardRefs: '$ref_<name> for new nodes in the same batch',
  maxActionsPerBatch: 25,
  coordinates: 'meters, Y up, floor y = 0, item position is bottom-center',
}

const SOLID_SPEC_GRAMMAR = {
  primitives: ['box', 'cylinder', 'sphere', 'extrude', 'revolve'],
  booleans: ['union', 'difference', 'intersection'],
  arrays: ['mirror', 'linearArray', 'polarArray'],
  rotation: 'radians, applied X then Y then Z after scale and before translate',
  extrudeAxis: 'polygon is on XY; height extrudes +Z in spec space, then rotate/translate',
  nesting: 'parentId is a scene node id; the solid is parent-relative, not world-absolute',
}

const INVOKE_ALLOWLIST = new Set([
  'manual',
  'inspect',
  'getNodes',
  'measure',
  'searchCatalog',
  'listRecipes',
  'exportScene',
  'workspace',
  'validate',
  'run',
  'waitForIdle',
  'undo',
  'redo',
  'taskPlan.create',
  'taskPlan.get',
  'taskPlan.updateStep',
  'taskPlan.runStep',
  'taskPlan.complete',
  'taskPlan.undo',
  'taskPlan.clear',
])

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const operatorPlanSnapshots = new Map<string, SceneGraph>()

const cloneCurrentSceneGraph = (): SceneGraph => ({
  nodes: structuredClone(useScene.getState().nodes) as SceneGraph['nodes'],
  rootNodeIds: [...useScene.getState().rootNodeIds],
})

type RunOperatorPlanStepInput = {
  planId: string
  phaseId: string
  stepId: string
  actions: unknown
  confirmDestructive?: boolean
  idleTimeoutMs?: number
}

export const createPistolaAgentApi = () => {
  const runtime = createAssistantRuntime()

  const manual = async () => ({
    apiVersion: PISTOLA_API_VERSION,
    workflow: AGENT_WORKFLOW,
    solidSpec: SOLID_SPEC_GRAMMAR,
    primitives: {
      ids: [
        'primitive-box',
        'primitive-sphere',
        'primitive-cylinder',
        'primitive-cone',
        'primitive-torus',
        'primitive-capsule',
        'primitive-wedge',
      ],
      color: 'optional hex on place_item and update_item_properties',
      nesting: 'parentId child positions are parent-relative, not world-absolute',
    },
    operatorPlan: {
      version: 1,
      owner: 'ide',
      methods: ['create', 'get', 'updateStep', 'runStep', 'complete', 'undo', 'clear'],
      rule: 'Create a checklist before mutation. Complete execution steps only through runStep.',
    },
    capabilities: getAllCapabilities().map((capability) => ({
      type: capability.type,
      domain: capability.domain,
      describe: capability.describe,
      examples: capability.examples ?? [],
      safeImmediate: Boolean(capability.safeImmediate),
      destructive: Boolean(capability.destructive),
      schema: capability.schema.toJSONSchema?.() ?? { type: 'object' },
    })),
  })

  const inspect = async (query?: { levelId?: string; type?: string; nameQuery?: string; limit?: number }) =>
    inspectScene(query ?? {})

  const validate = async (actions: unknown) => {
    const result = validateAssistantPlan(actions, { maxActions: AGENT_WORKFLOW.maxActionsPerBatch })
    return {
      valid: result.valid,
      requiresReview: result.requiresReview,
      errors: result.errors.map((message) => {
        const match = message.match(/^Action (\d+):/)
        const index = match ? Number(match[1]) - 1 : -1
        const sequenceHint = result.sequenceIssues.find((issue) => issue.index === index)?.message
        return {
          index: index >= 0 ? index : null,
          type: index >= 0 ? result.actions[index]?.type ?? 'unknown' : 'unknown',
          message,
          hint: sequenceHint,
        }
      }),
      sequenceIssues: result.sequenceIssues,
      actionCount: result.actions.length,
      destructiveActionCount: result.destructiveActionCount,
    }
  }

  const run = async (actions: unknown, options: { confirmDestructive?: boolean } = {}) => {
    const parsed = Array.isArray(actions) ? (actions as AssistantAction[]) : []
    const hasDestructive = parsed.some((action) => isDestructiveAssistantActionType(action.type))
    if (hasDestructive && !options.confirmDestructive) {
      return {
        ok: false,
        completedActionCount: 0,
        createdNodeIds: [],
        bodyIds: [],
        sketchIds: [],
        warnings: [],
        errors: ['Destructive actions require confirmDestructive: true.'],
        snapshotRestored: false,
        requiresReview: true,
        destructiveActionCount: parsed.filter((action) => isDestructiveAssistantActionType(action.type)).length,
        failureKind: 'plan-validation' as const,
        failedActionIndex: null,
        resolvedForwardRefs: {},
      } satisfies AssistantExecutionResult
    }

    return executeAssistantPlan(actions, {
      reviewConfirmed: true,
      runtime,
    })
  }

  const runRecipe = async (name: string, params: Record<string, unknown> = {}) => {
    const recipe = CREATION_RECIPES.find((entry) => entry.id === name || entry.name.toLowerCase() === name.toLowerCase())
    if (!recipe) throw new Error(`Recipe "${name}" was not found.`)
    const actions = recipe.generateActions({
      width: typeof params.width === 'number' ? params.width : undefined,
      height: typeof params.height === 'number' ? params.height : undefined,
      depth: typeof params.depth === 'number' ? params.depth : undefined,
      color: typeof params.color === 'string' ? params.color : undefined,
      position: Array.isArray(params.position) ? (params.position as [number, number, number]) : undefined,
    })
    return run(actions)
  }

  const waitForIdle = async (timeoutMs = 20_000) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const bodies = Object.values(useScene.getState().nodes).filter((node) => node?.type === 'cad-body')
      const busyBody = bodies.some(
        (node) =>
          node.type === 'cad-body' &&
          (node.regenStatus === 'pending' ||
            node.regenStatus === 'building' ||
            node.regenStatus === 'queued' ||
            node.regenStatus === 'running'),
      )
      const cadBusy = ['checking', 'running'].includes(useCad.getState().helperStatus)
      const macBusy = Boolean(useMac.getState().activeJobId)
      if (!busyBody && !cadBusy && !macBusy) {
        return { idle: true, waitedMs: Date.now() - started }
      }
      await wait(120)
    }
    throw new Error(`Scene did not become idle within ${timeoutMs}ms.`)
  }

  const undo = async () => {
    const history = useScene.temporal.getState()
    if (history.pastStates.length === 0) return { undone: false }
    history.undo()
    return { undone: true }
  }

  const redo = async () => {
    const history = useScene.temporal.getState()
    if (history.futureStates.length === 0) return { redone: false }
    history.redo()
    return { redone: true }
  }

  const screenshot = async () => {
    const canvas = document.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Viewer canvas is not available.')
    }
    return { mime: 'image/png', dataUrl: canvas.toDataURL('image/png') }
  }

  const taskPlan = {
    version: 1 as const,
    create: async (input: OperatorPlanInput & { replace?: boolean }) => {
      const previous = useOperatorPlanStore.getState().plan
      if (previous && getOperatorPlanProgress(previous).status !== 'done' && !input.replace) {
        throw new Error(
          'An unfinished operator plan is already active. Pass replace: true to replace it.',
        )
      }
      if (previous) operatorPlanSnapshots.delete(previous.id)
      const plan = createOperatorPlan(input)
      useOperatorPlanStore.getState().setPlan(plan)
      return plan
    },
    get: async () => useOperatorPlanStore.getState().plan,
    updateStep: async (update: OperatorPlanStepUpdate) => {
      const current = useOperatorPlanStore.getState().plan
      const step = current?.phases
        .find((phase) => phase.id === update.phaseId)
        ?.steps.find((candidate) => candidate.id === update.stepId)
      if (step?.kind === 'execution' && update.status === 'done') {
        throw new Error('Execution steps can only be completed by taskPlan.runStep().')
      }
      return useOperatorPlanStore.getState().updateStep(update)
    },
    runStep: async (input: RunOperatorPlanStepInput) => {
      const store = useOperatorPlanStore.getState()
      const current = store.plan
      if (!current || current.id !== input.planId) {
        throw new Error(`Operator plan "${input.planId}" is not active.`)
      }
      const step = current.phases
        .find((phase) => phase.id === input.phaseId)
        ?.steps.find((candidate) => candidate.id === input.stepId)
      if (!step) {
        throw new Error(`Operator plan step "${input.phaseId}/${input.stepId}" was not found.`)
      }
      if (step.kind !== 'execution') {
        throw new Error('Only execution steps can be run with taskPlan.runStep().')
      }

      store.updateStep({
        planId: input.planId,
        phaseId: input.phaseId,
        stepId: input.stepId,
        status: 'running',
      })

      const validation = await validate(input.actions)
      if (!validation.valid) {
        const error = validation.errors.map((entry) => entry.message).join(' ') || 'Action validation failed.'
        const plan = useOperatorPlanStore.getState().updateStep({
          planId: input.planId,
          phaseId: input.phaseId,
          stepId: input.stepId,
          status: 'error',
          error,
        })
        return { ok: false as const, plan, validation, result: null }
      }

      if (validation.destructiveActionCount > 0 && !input.confirmDestructive) {
        const result = await run(input.actions)
        const error = result.errors.join(' ') || 'Destructive actions require explicit confirmation.'
        const plan = useOperatorPlanStore.getState().updateStep({
          planId: input.planId,
          phaseId: input.phaseId,
          stepId: input.stepId,
          status: 'error',
          error,
        })
        return { ok: false as const, plan, validation, result }
      }

      if (!operatorPlanSnapshots.has(input.planId)) {
        operatorPlanSnapshots.set(input.planId, cloneCurrentSceneGraph())
        useOperatorPlanStore.getState().setUndoAvailable(input.planId, true)
      }

      let result: AssistantExecutionResult | null = null
      try {
        result = await run(input.actions, { confirmDestructive: input.confirmDestructive })
        if (!result.ok) {
          const error = result.errors.join(' ') || 'Step execution failed.'
          const plan = useOperatorPlanStore.getState().updateStep({
            planId: input.planId,
            phaseId: input.phaseId,
            stepId: input.stepId,
            status: 'error',
            error,
          })
          return { ok: false as const, plan, validation, result }
        }

        await waitForIdle(input.idleTimeoutMs ?? 20_000)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Step execution failed.'
        const plan = useOperatorPlanStore.getState().updateStep({
          planId: input.planId,
          phaseId: input.phaseId,
          stepId: input.stepId,
          status: 'error',
          error: message,
        })
        return { ok: false as const, plan, validation, result }
      }

      const evidence: OperatorPlanEvidence = {
        kind: 'execution',
        summary: `${result.completedActionCount} action${result.completedActionCount === 1 ? '' : 's'} completed.`,
        actionCount: result.completedActionCount,
        createdNodeIds: result.createdNodeIds,
        warnings: result.warnings,
      }
      const plan = useOperatorPlanStore.getState().updateStep({
        planId: input.planId,
        phaseId: input.phaseId,
        stepId: input.stepId,
        status: 'done',
        evidence,
      })
      return { ok: true as const, plan, validation, result }
    },
    complete: async (planId: string, summary: string) => {
      if (!summary.trim()) throw new Error('A completed operator plan requires a summary.')
      return useOperatorPlanStore.getState().setSummary(planId, summary)
    },
    undo: async (planId: string) => {
      const current = useOperatorPlanStore.getState().plan
      if (!current || current.id !== planId) throw new Error(`Operator plan "${planId}" is not active.`)
      const snapshot = operatorPlanSnapshots.get(planId)
      if (!snapshot) return { undone: false as const, reason: 'The pre-plan snapshot is no longer available.' }
      applySceneGraphToEditor(snapshot)
      operatorPlanSnapshots.delete(planId)
      useOperatorPlanStore.getState().clear(planId)
      return { undone: true as const }
    },
    clear: async (planId?: string) => {
      const current = useOperatorPlanStore.getState().plan
      if (current && (!planId || current.id === planId)) operatorPlanSnapshots.delete(current.id)
      useOperatorPlanStore.getState().clear(planId)
      return { cleared: true as const }
    },
  }

  const api = {
    apiVersion: PISTOLA_API_VERSION,
    manual,
    inspect,
    getNodes: async (ids: string[]) => getNodes({ nodeIds: ids }),
    exportScene: async () => {
      const scene = useScene.getState()
      const nodes = Object.values(scene.nodes).filter((node): node is NonNullable<typeof node> => Boolean(node))
      return {
        apiVersion: PISTOLA_API_VERSION,
        frame: {
          up: '+Y',
          front: '+Z',
          right: '+X',
          units: 'meters',
          origin: 'bottom-center',
        },
        rootNodeIds: scene.rootNodeIds ?? [],
        count: nodes.length,
        nodes: nodes.map((node) => {
          const item = node.type === 'item' ? node : null
          return {
            id: node.id,
            type: node.type,
            name: node.name ?? null,
            parentId: 'parentId' in node ? (node.parentId ?? null) : null,
            position: 'position' in node ? (node.position ?? null) : null,
            rotation: 'rotation' in node ? (node.rotation ?? null) : null,
            scale: 'scale' in node ? (node.scale ?? null) : null,
            assetId: item?.asset?.id ?? null,
            color: item?.asset?.color ?? ('color' in node ? (node.color ?? null) : null),
            bounds: getNodeBounds(node),
          }
        }),
      }
    },
    measure: async (params: Parameters<typeof measure>[0]) => measure(params),
    searchCatalog: async (query?: string) => searchCatalog({ query: query ?? '' }),
    listRecipes: async () => listCreationRecipes(),
    listCapabilities: async () => listCapabilities(),
    workspace: async () => getWorkspaceState(),
    context: async () => getAssistantWorkspaceContext(),
    validate,
    run,
    runRecipe,
    waitForIdle,
    undo,
    redo,
    screenshot,
    selection: () => useViewer.getState().selection,
    executeTool: executeAgentTool,
    taskPlan,
    invoke: async (method: string, args?: unknown) => {
      if (!INVOKE_ALLOWLIST.has(method)) {
        throw new Error(`Unknown pistola method "${method}".`)
      }
      const payload = args === undefined ? [] : Array.isArray(args) ? args : [args]
      if (method.startsWith('taskPlan.')) {
        const name = method.slice('taskPlan.'.length) as keyof typeof taskPlan
        const fn = taskPlan[name]
        if (typeof fn !== 'function') {
          throw new Error(`Unknown pistola method "${method}".`)
        }
        return (fn as (...values: unknown[]) => unknown)(...payload)
      }
      const fn = (api as Record<string, unknown>)[method]
      if (typeof fn !== 'function') {
        throw new Error(`Unknown pistola method "${method}".`)
      }
      return (fn as (...values: unknown[]) => unknown)(...payload)
    },
  }

  return api
}

export type PistolaAgentApi = ReturnType<typeof createPistolaAgentApi>
