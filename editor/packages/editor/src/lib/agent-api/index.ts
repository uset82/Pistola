'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { getAllCapabilities } from '../assistant/capabilities/registry'
import {
  executeAgentTool,
  inspectScene,
  getNodes,
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

const AGENT_WORKFLOW = {
  alwaysPassExplicitIds: true,
  useForwardRefs: '$ref_<name> for new nodes in the same batch',
  maxActionsPerBatch: 25,
  coordinates: 'meters, Y up, floor y = 0, item position is bottom-center',
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createPistolaAgentApi = () => {
  const runtime = createAssistantRuntime()

  const manual = async () => ({
    workflow: AGENT_WORKFLOW,
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
    const result = validateAssistantPlan(actions)
    return {
      valid: result.valid,
      requiresReview: result.requiresReview,
      errors: result.errors.map((message, index) => ({
        index,
        type: result.actions[index]?.type ?? 'unknown',
        message,
        hint: result.sequenceIssues[index]?.message,
      })),
      sequenceIssues: result.sequenceIssues,
      actionCount: result.actions.length,
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

  return {
    manual,
    inspect,
    getNodes: async (ids: string[]) => getNodes({ nodeIds: ids }),
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
  }
}

export type PistolaAgentApi = ReturnType<typeof createPistolaAgentApi>
