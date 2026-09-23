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
import { describeCadBody, getAssistantWorkspaceContext } from '../assistant/context'
import { CREATION_RECIPES, listCreationRecipes } from '../assistant/recipes/creation-recipes'
import { MANUAL_OP_EXAMPLES } from '../cad/manual-examples'
import { ORTHO_VIEWS, PISTOLA_FRAME } from '../cad/views'
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
import { checkStructure, collectStructureParts, type StructureReport } from '../structure'
import {
  checkBlueprint,
  checkSceneAgainstPlan,
  normalizeBlueprint,
  proposeRelationSnaps,
  stepsFromBlueprint,
  type BlueprintV2,
} from '../blueprint'
import { getExample, searchExamples } from '../agent-examples'
import { renderViews as renderSceneViews } from '../render'
import {
  boundsFromBoxes,
  clampCaptureSize,
  livePose,
  poseForView,
  poseFromCamera,
  RENDER_VIEW_IDS,
  type RenderViewId,
} from '../render/capture-frame'
import { requestSceneCapture } from '../render/capture-registry'
import {
  CANONICAL_CONTACT_SHEET_LAYOUT,
  CANONICAL_VIEW_CAMERAS,
  CANONICAL_VIEW_ORDER,
  PISTOLA_CANONICAL_FRAME,
  renderSceneContactSheet,
} from '../render-views'
import { useReferencePackStore, validateReferencePack } from '../reference-pack'
import {
  guideActionsFromReference,
  hullActionFromTrace,
  loadReferenceGrid,
  runReferenceJob,
  useReferenceStore,
  type FitResult,
  type ReferenceAddInput,
  type ReferenceRecord,
} from '../reference'

export const PISTOLA_API_VERSION = 1

const AGENT_WORKFLOW = {
  alwaysPassExplicitIds: true,
  useForwardRefs: '$ref_<name> for new nodes in the same batch',
  maxActionsPerBatch: 25,
  coordinates: 'meters, Y up, floor y = 0, item position is bottom-center',
}

const SOLID_SPEC_GRAMMAR = {
  primitives: ['box', 'cylinder', 'sphere', 'torus', 'capsule', 'ellipsoid', 'extrude', 'revolve', 'loft'],
  booleans: ['union', 'difference', 'intersection'],
  group: 'op group merges children without a boolean. Disjoint shells are allowed.',
  arrays: ['mirror', 'linearArray', 'polarArray'],
  hull: 'op hull requires profileXY, profileZY, and profileXZ (sideProfile/topProfile stay as aliases)',
  rotation: 'radians, applied X then Y then Z after scale and before translate',
  extrudeAxis: 'polygon is XZ (x, z); height extrudes +Y (up). Bottom-center origin.',
  loft: 'sections are 2D polygons lofted along axis (default +Y). heights or span set station spacing.',
  intersectProfiles:
    'profileXY / profileZY / profileXZ (2 or 3). sideProfile aliases profileXY, topProfile aliases profileXZ.',
  materials: 'optional roughness / metalness / opacity 0..1 on build_cad_solid and update_cad_solid',
  budget: 'kernel rejects meshes over 50k triangles',
  nesting: 'parentId is a scene node id; the solid is parent-relative, not world-absolute',
  origins: {
    box: 'bottom-center',
    cylinder: 'bottom-center',
    sphere: 'bottom-center',
    torus: 'bottom-center, ring in XZ',
    capsule: 'bottom-center, cylinder height h plus two hemispheres',
    ellipsoid: 'bottom-center, radii [rx, ry, rz]',
    extrude: 'polygon on XZ, bottom at y=0',
    revolve: 'profile x = radius, y = height, closed ring',
    loft: 'first section at the start of the axis, bottom-center of that section',
  },
}

const INVOKE_ALLOWLIST = new Set([
  'manual',
  'inspect',
  'getNodes',
  'measure',
  'searchCatalog',
  'listRecipes',
  'runRecipe',
  'exportScene',
  'workspace',
  'validate',
  'run',
  'checkStructure',
  'plan.check',
  'plan.checkScene',
  'plan.snap',
  'examples.search',
  'examples.get',
  'renderViews',
  'renderEightViews',
  'render',
  'renderSheet',
  'referencePack.validate',
  'referencePack.set',
  'referencePack.get',
  'referencePack.clear',
  'reference.add',
  'reference.get',
  'reference.clear',
  'reference.fit',
  'reference.hull',
  'reference.guides',
  'waitForIdle',
  'screenshot',
  'undo',
  'redo',
  'taskPlan.create',
  'taskPlan.get',
  'taskPlan.updateStep',
  'taskPlan.runStep',
  'taskPlan.restoreBest',
  'taskPlan.complete',
  'taskPlan.undo',
  'taskPlan.undoStep',
  'taskPlan.clear',
  'exportActions',
  'replay',
])

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const operatorPlanSnapshots = new Map<string, SceneGraph>()
const operatorPlanStepSnapshots = new Map<string, SceneGraph>()
const operatorPlanBest = new Map<string, { graph: SceneGraph; errorCount: number }>()
const operatorPlanBlueprints = new Map<string, BlueprintV2>()
const recordedActions: AssistantAction[] = []

const stepSnapshotKey = (planId: string, phaseId: string, stepId: string) => `${planId}:${phaseId}:${stepId}`

const clearPlanMemory = (planId: string) => {
  operatorPlanSnapshots.delete(planId)
  operatorPlanBest.delete(planId)
  operatorPlanBlueprints.delete(planId)
  for (const key of [...operatorPlanStepSnapshots.keys()]) {
    if (key.startsWith(`${planId}:`)) operatorPlanStepSnapshots.delete(key)
  }
}

type RunOptions = { confirmDestructive?: boolean; select?: boolean; maxActions?: number }

const unpackRunInput = (input: unknown, options: RunOptions = {}) => {
  if (
    Array.isArray(input) &&
    input.length === 2 &&
    Array.isArray(input[0]) &&
    input[1] &&
    typeof input[1] === 'object' &&
    !Array.isArray(input[1])
  ) {
    return { actions: input[0], options: { ...options, ...(input[1] as RunOptions) } }
  }
  if (input && typeof input === 'object' && !Array.isArray(input) && 'actions' in input) {
    const packed = input as { actions: unknown } & RunOptions
    return {
      actions: packed.actions,
      options: { confirmDestructive: packed.confirmDestructive, select: packed.select },
    }
  }
  return { actions: input, options }
}

const unwrapActionList = (actions: unknown) =>
  Array.isArray(actions) && actions.length === 1 && Array.isArray(actions[0]) ? actions[0] : actions

const asActionList = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  const record = value as { actions?: unknown; order?: unknown; groups?: Record<string, unknown> }
  if (Array.isArray(record.actions)) return record.actions
  if (Array.isArray(record.order) && record.groups && typeof record.groups === 'object') {
    return record.order.flatMap((name) => {
      if (typeof name !== 'string') return []
      const group = record.groups?.[name]
      return Array.isArray(group) ? group : []
    })
  }
  return null
}

const normalizeNodeIds = (ids: unknown): string[] | undefined => {
  if (ids === undefined) return undefined
  if (typeof ids === 'string') return [ids]
  if (ids && typeof ids === 'object' && !Array.isArray(ids) && 'nodeIds' in ids) {
    return normalizeNodeIds((ids as { nodeIds?: unknown }).nodeIds)
  }
  if (!Array.isArray(ids)) return undefined
  if (ids.length === 1 && Array.isArray(ids[0])) return ids[0].filter((id): id is string => typeof id === 'string')
  return ids.filter((id): id is string => typeof id === 'string')
}

type ExecutionResult = AssistantExecutionResult & { structure: StructureReport }

const withStructure = (result: AssistantExecutionResult): ExecutionResult => ({
  ...result,
  structure: checkStructure(),
})

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
  strict?: boolean
}

export const createPistolaAgentApi = () => {
  const runtime = createAssistantRuntime()

  const buildManual = () => ({
    apiVersion: PISTOLA_API_VERSION,
    frame: PISTOLA_FRAME,
    views: ORTHO_VIEWS,
    workflow: AGENT_WORKFLOW,
    solidSpec: SOLID_SPEC_GRAMMAR,
    examples: MANUAL_OP_EXAMPLES,
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
      methods: ['create', 'get', 'updateStep', 'runStep', 'restoreBest', 'complete', 'undo', 'clear'],
      rule: 'Create a checklist before mutation. Pass {blueprint} to generate one step per part. Complete execution steps only through runStep. run and runStep embed a structure report. At most 2 typed retries, then a simpler technique.',
    },
    exampleLibrary: {
      methods: ['search', 'get'],
      rule: 'examples.search(query) then examples.get({id, params, at}). Returns editable actions with partIds and a blueprint fragment. Placeholders: $ref_* and LEVEL.',
    },
    visualReview: {
      method: 'render',
      output: 'A PNG of the live meshes. Pass {view} or {camera}. The viewport camera is not moved.',
    },
    eightViewReview: {
      method: 'renderSheet',
      output:
        'A labelled PNG contact sheet of the real meshes. renderEightViews({ mode: "layout" }) still returns the bounding-box SVG.',
      policy:
        'Use after each assembly milestone without moving the active viewport. Address structural errors first, then the largest visible placement or proportion mismatch.',
      layout: CANONICAL_CONTACT_SHEET_LAYOUT,
      frame: PISTOLA_CANONICAL_FRAME,
    },
    referencePack: {
      version: 1,
      source:
        'IDE-native image generation or a user upload. Pistola accepts metadata only; image pixels remain in the IDE or asset store.',
      conceptGate:
        'Generate 2–3 concepts, obtain the user-selected approval, then set one exactly-eight-view reference pack.',
      requiredViews: CANONICAL_VIEW_CAMERAS.map((camera) => ({
        id: camera.id,
        label: camera.label,
        projection: camera.projection,
      })),
      requiredScale: 'One named positive real-world measurement in meters.',
      methods: ['validate', 'set', 'get', 'clear'],
    },
    referenceMode: {
      method: 'reference.add',
      input: '{ path|dataUrl, layout: "front|side|top", knownDimension, blueprint }',
      rule:
        'An optional, clean three-view tracing supplement after the approved eight-view pack. It is always paired with a text blueprint and never replaces the canonical review loop.',
      methods: ['add', 'get', 'clear', 'fit', 'hull', 'guides'],
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

  const manual = async (query?: string | { section?: string }) => {
    const full = buildManual()
    const section = typeof query === 'string' ? query : query?.section
    if (!section) return full
    if (!(section in full)) {
      throw new Error(`Unknown manual section "${section}".`)
    }
    return { section, value: full[section as keyof typeof full] }
  }

  const inspect = async (query?: { levelId?: string; type?: string; nameQuery?: string; partId?: string; limit?: number }) =>
    inspectScene(query ?? {})

  const validate = async (actions: unknown) => {
    const result = validateAssistantPlan(unwrapActionList(actions), { maxActions: AGENT_WORKFLOW.maxActionsPerBatch })
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

  const run = async (actionsOrInput: unknown, options: RunOptions = {}) => {
    const unpacked = unpackRunInput(actionsOrInput, options)
    const parsed = Array.isArray(unpacked.actions) ? (unpacked.actions as AssistantAction[]) : []
    const resolvedOptions = unpacked.options
    // Builders select what they create; an external agent should not yank the user's selection or panels.
    const keepSelection =
      resolvedOptions.select !== true &&
      !parsed.some((action) => action.type === 'select_nodes' || action.type === 'reset_workspace_selection')
    const selectionBefore = useViewer.getState().selection
    const hasDestructive = parsed.some((action) => isDestructiveAssistantActionType(action.type))
    if (hasDestructive && !resolvedOptions.confirmDestructive) {
      return withStructure({
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
      })
    }

    const result = await executeAssistantPlan(unpacked.actions, {
      reviewConfirmed: true,
      runtime,
      maxActions: resolvedOptions.maxActions,
    })
    if (result.ok) recordedActions.push(...parsed)
    if (keepSelection) useViewer.getState().setSelection(selectionBefore)
    return withStructure(result)
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

  const screenshot = async () => render({})

  const loadImage = (dataUrl: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not compose the render sheet.'))
      image.src = dataUrl
    })

  const render = async (input: {
    view?: RenderViewId
    camera?: { position: [number, number, number]; target: [number, number, number]; fov?: number; up?: [number, number, number] }
    nodeIds?: string[]
    width?: number
    height?: number
  } = {}) => {
    const parts = collectStructureParts()
    const bounds = boundsFromBoxes(parts, input.nodeIds)
    const size = clampCaptureSize(input.width ?? 768, input.height ?? 768)
    const pose = input.camera
      ? poseFromCamera(input.camera)
      : input.view
        ? poseForView(input.view, bounds)
        : livePose()
    if (typeof requestAnimationFrame === 'function') {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    }
    const captured = await requestSceneCapture({ ...size, pose }, bounds)
    return {
      mime: 'image/png' as const,
      dataUrl: captured.dataUrl,
      camera: captured.camera,
      bounds: captured.bounds,
      width: size.width,
      height: size.height,
    }
  }

  const renderSheet = async (input: { views?: RenderViewId[]; cell?: number; nodeIds?: string[] } = {}) => {
    const views = input.views?.length ? input.views : [...CANONICAL_VIEW_ORDER]
    for (const view of views) {
      if (!RENDER_VIEW_IDS.includes(view)) throw new Error(`Unknown render view "${view}".`)
    }
    const cell = clampCaptureSize(input.cell ?? 384, input.cell ?? 384).width
    const columns = views.length >= 8 ? 4 : Math.min(4, Math.max(1, views.length))
    const rows = Math.ceil(views.length / columns)
    const labelBand = 28
    const canvas = document.createElement('canvas')
    canvas.width = columns * cell
    canvas.height = rows * (cell + labelBand)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not compose the render sheet.')
    context.fillStyle = '#f4f1ea'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.font = '16px sans-serif'
    const shots = []
    for (let index = 0; index < views.length; index += 1) {
      const view = views[index]!
      const shot = await render({ view, width: cell, height: cell, nodeIds: input.nodeIds })
      const image = await loadImage(shot.dataUrl)
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = column * cell
      const y = row * (cell + labelBand)
      context.drawImage(image, x, y, cell, cell)
      context.fillStyle = '#1c1917'
      context.fillText(view, x + 8, y + cell + 18)
      shots.push({ id: view, camera: shot.camera })
    }
    return {
      mime: 'image/png' as const,
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      columns,
      rows,
      views: shots,
    }
  }

  const referencePack = {
    validate: async (input: unknown) => validateReferencePack(input),
    set: async (input: unknown) => {
      const validation = validateReferencePack(input)
      if (!validation.valid) return { ...validation, stored: false as const }
      useReferencePackStore.getState().setPack(validation.data)
      return { ...validation, stored: true as const }
    },
    get: async () => useReferencePackStore.getState().pack,
    clear: async () => {
      const cleared = useReferencePackStore.getState().pack !== null
      useReferencePackStore.getState().clearPack()
      return { cleared }
    },
  }

  /**
   * A renderer-agnostic review surface: it projects real world-space AABBs and
   * never changes the user's camera, selection, or editor state.
   */
  const renderEightViews = async () => {
    const parts = collectStructureParts()
    const sheet = renderSceneContactSheet(
      parts.map((part) => ({
        id: part.id,
        name: part.name,
        bounds: { min: part.box.min, max: part.box.max },
      })),
    )
    return {
      mime: 'image/svg+xml' as const,
      svg: sheet.svg,
      width: sheet.width,
      height: sheet.height,
      columns: sheet.columns,
      rows: sheet.rows,
      partCount: parts.length,
      views: sheet.views,
      partColors: sheet.partColors,
      structure: checkStructure(),
    }
  }

  const serializeRecord = (record: ReferenceRecord) => ({
    id: record.id,
    layout: record.layout,
    knownDimension: record.knownDimension,
    blueprint: record.blueprint,
    hasLocalImage: Boolean(record.dataUrl),
    trace: record.trace,
    frames: record.frames,
    goldMasks: {
      size: record.goldMasks.size,
      views: ['front', 'side', 'top'] as const,
    },
    consistent: record.trace.consistent,
    overall_m: record.trace.overall_m,
  })

  const reference = {
    add: async (input: ReferenceAddInput) => {
      if (!input?.blueprint) throw new Error('A reference is always paired with a text blueprint.')
      const blueprint = normalizeBlueprint(input.blueprint)
      const { grid, dataUrl } = await loadReferenceGrid(input)
      const traced = await runReferenceJob<{
        kind: 'trace'
        trace: ReferenceRecord['trace']
        goldMasks: ReferenceRecord['goldMasks']
        frames: ReferenceRecord['frames']
      }>({
        kind: 'trace',
        grid,
        knownDimension: input.knownDimension,
      })
      const record: ReferenceRecord = {
        id: `ref_${Date.now().toString(36)}`,
        layout: input.layout ?? 'front|side|top',
        knownDimension:
          typeof input.knownDimension === 'number'
            ? { axis: 'width', meters: input.knownDimension, label: 'width' }
            : input.knownDimension,
        blueprint,
        dataUrl,
        trace: traced.trace,
        goldMasks: traced.goldMasks,
        frames: traced.frames,
      }
      useReferenceStore.getState().setActive(record)
      return {
        ...serializeRecord(record),
        hull: hullActionFromTrace(record.trace),
        guides: guideActionsFromReference(record),
      }
    },
    get: async () => {
      const active = useReferenceStore.getState().active
      return active ? serializeRecord(active) : null
    },
    clear: async () => {
      const cleared = useReferenceStore.getState().active !== null
      useReferenceStore.getState().clear()
      return { cleared }
    },
    fit: async () => {
      const active = useReferenceStore.getState().active
      if (!active) throw new Error('No active reference. Call reference.add first.')
      const fitted = await runReferenceJob<FitResult>({
        kind: 'fit',
        parts: collectStructureParts(),
        goldMasks: active.goldMasks,
        frames: active.frames,
        blueprint: active.blueprint,
      })
      const patches = fitted.patches.map((patch) => {
        if (patch.type !== 'scale_target' || !patch.scale) return patch
        const node = useScene.getState().nodes[patch.nodeId as never] as { scale?: [number, number, number] } | undefined
        const current = node?.scale ?? [1, 1, 1]
        return {
          ...patch,
          scale: [current[0] * patch.scale[0], current[1] * patch.scale[1], current[2] * patch.scale[2]] as [
            number,
            number,
            number,
          ],
        }
      })
      return { ...fitted, applied: false as const, patches }
    },
    hull: async () => {
      const active = useReferenceStore.getState().active
      if (!active) throw new Error('No active reference. Call reference.add first.')
      return { applied: false as const, action: hullActionFromTrace(active.trace) }
    },
    guides: async () => {
      const active = useReferenceStore.getState().active
      if (!active) throw new Error('No active reference. Call reference.add first.')
      return { applied: false as const, actions: guideActionsFromReference(active) }
    },
  }

  const taskPlan = {
    version: 1 as const,
    create: async (input: OperatorPlanInput & { replace?: boolean; blueprint?: unknown }) => {
      const previous = useOperatorPlanStore.getState().plan
      if (previous && getOperatorPlanProgress(previous).status !== 'done' && !input.replace) {
        throw new Error(
          'An unfinished operator plan is already active. Pass replace: true to replace it.',
        )
      }
      if (previous) clearPlanMemory(previous.id)
      let nextInput: OperatorPlanInput = input
      if (input.blueprint) {
        const checked = checkBlueprint(input.blueprint)
        if (!checked.ok) {
          const codes = checked.issues.map((issue) => issue.code).join(', ')
          throw new Error(`Blueprint failed plan.check (${codes}).`)
        }
        const generated = stepsFromBlueprint(checked.blueprint)
        nextInput = {
          ...input,
          title: input.title || generated.title,
          phases: generated.phases,
        }
      }
      if (!nextInput.phases?.length) {
        throw new Error('taskPlan.create requires phases, or a {blueprint} that generates them.')
      }
      const plan = createOperatorPlan({
        ...nextInput,
        title: nextInput.title || 'Untitled plan',
        phases: nextInput.phases,
      })
      if (input.blueprint) operatorPlanBlueprints.set(plan.id, normalizeBlueprint(input.blueprint))
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
        return { ok: false as const, plan, validation, result: null, structure: checkStructure() }
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
        return { ok: false as const, plan, validation, result, structure: result.structure }
      }

      if (!operatorPlanSnapshots.has(input.planId)) {
        operatorPlanSnapshots.set(input.planId, cloneCurrentSceneGraph())
        useOperatorPlanStore.getState().setUndoAvailable(input.planId, true)
      }

      const stepKey = stepSnapshotKey(input.planId, input.phaseId, input.stepId)
      if (!operatorPlanStepSnapshots.has(stepKey)) {
        operatorPlanStepSnapshots.set(stepKey, cloneCurrentSceneGraph())
      } else if (step.status === 'done' || step.status === 'error') {
        const baseline = operatorPlanStepSnapshots.get(stepKey)
        if (baseline) applySceneGraphToEditor(baseline)
      }

      let result: ExecutionResult | null = null
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
          return { ok: false as const, plan, validation, result, structure: result.structure }
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
        return { ok: false as const, plan, validation, result, structure: result?.structure ?? checkStructure() }
      }

      const structure = result.structure
      const best = operatorPlanBest.get(input.planId)
      const regression = Boolean(best && structure.errorCount > best.errorCount)
      if (!best || structure.errorCount < best.errorCount) {
        operatorPlanBest.set(input.planId, { graph: cloneCurrentSceneGraph(), errorCount: structure.errorCount })
      } else if (regression && input.strict) {
        applySceneGraphToEditor(best.graph)
        const plan = useOperatorPlanStore.getState().updateStep({
          planId: input.planId,
          phaseId: input.phaseId,
          stepId: input.stepId,
          status: 'error',
          error: `Structure regression (${structure.errorCount} > ${best.errorCount} errors). Restored the best snapshot.`,
        })
        return {
          ok: false as const,
          plan,
          validation,
          result,
          structure: checkStructure(),
          regression: true,
          reverted: true,
        }
      }

      const evidence: OperatorPlanEvidence = {
        kind: 'execution',
        summary: `${result.completedActionCount} action${result.completedActionCount === 1 ? '' : 's'} completed. structure ${structure.errorCount} error(s).`,
        actionCount: result.completedActionCount,
        createdNodeIds: result.createdNodeIds,
        warnings: [
          ...result.warnings,
          ...structure.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.code),
        ],
        actions: Array.isArray(input.actions) ? input.actions : [],
      }
      const plan = useOperatorPlanStore.getState().updateStep({
        planId: input.planId,
        phaseId: input.phaseId,
        stepId: input.stepId,
        status: 'done',
        evidence,
      })
      return { ok: true as const, plan, validation, result, structure, regression }
    },
    restoreBest: async (planId: string) => {
      const current = useOperatorPlanStore.getState().plan
      if (!current || current.id !== planId) throw new Error(`Operator plan "${planId}" is not active.`)
      const best = operatorPlanBest.get(planId)
      if (!best) return { restored: false as const, reason: 'No best snapshot is stored for this plan.' }
      applySceneGraphToEditor(best.graph)
      return { restored: true as const, errorCount: best.errorCount, structure: checkStructure() }
    },
    complete: async (planIdOrInput: string | { planId: string; summary: string } | [string, string], summary?: string) => {
      const planId = Array.isArray(planIdOrInput)
        ? planIdOrInput[0]
        : typeof planIdOrInput === 'object'
          ? planIdOrInput.planId
          : planIdOrInput
      const text = Array.isArray(planIdOrInput)
        ? planIdOrInput[1]
        : typeof planIdOrInput === 'object'
          ? planIdOrInput.summary
          : summary
      if (!text?.trim()) throw new Error('A completed operator plan requires a summary.')
      return useOperatorPlanStore.getState().setSummary(planId, text)
    },
    undoStep: async (input: { planId: string; phaseId: string; stepId: string }) => {
      const current = useOperatorPlanStore.getState().plan
      if (!current || current.id !== input.planId) throw new Error(`Operator plan "${input.planId}" is not active.`)
      const snapshot = operatorPlanStepSnapshots.get(stepSnapshotKey(input.planId, input.phaseId, input.stepId))
      if (!snapshot) return { undone: false as const, reason: 'That step has no snapshot.' }
      applySceneGraphToEditor(snapshot)
      const plan = useOperatorPlanStore.getState().updateStep({
        planId: input.planId,
        phaseId: input.phaseId,
        stepId: input.stepId,
        status: 'pending',
      })
      return { undone: true as const, plan, structure: checkStructure() }
    },
    undo: async (planId: string) => {
      const current = useOperatorPlanStore.getState().plan
      if (!current || current.id !== planId) throw new Error(`Operator plan "${planId}" is not active.`)
      const snapshot = operatorPlanSnapshots.get(planId)
      if (!snapshot) return { undone: false as const, reason: 'The pre-plan snapshot is no longer available.' }
      applySceneGraphToEditor(snapshot)
      clearPlanMemory(planId)
      useOperatorPlanStore.getState().clear(planId)
      return { undone: true as const }
    },
    clear: async (planId?: string) => {
      const current = useOperatorPlanStore.getState().plan
      if (current && (!planId || current.id === planId)) clearPlanMemory(current.id)
      useOperatorPlanStore.getState().clear(planId)
      return { cleared: true as const }
    },
  }

  const api = {
    apiVersion: PISTOLA_API_VERSION,
    manual,
    inspect,
    getNodes: async (ids?: unknown) => {
      const nodeIds = normalizeNodeIds(ids)
      return getNodes({ nodeIds: nodeIds ?? Object.keys(useScene.getState().nodes) })
    },
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
          const cad = node.type === 'cad-body' ? describeCadBody(node) : null
          return {
            id: node.id,
            type: node.type,
            name: node.name ?? null,
            parentId: 'parentId' in node ? (node.parentId ?? null) : null,
            position: 'position' in node ? (node.position ?? null) : null,
            rotation: 'rotation' in node ? (node.rotation ?? null) : null,
            scale: 'scale' in node ? (node.scale ?? null) : null,
            assetId: item?.asset?.id ?? null,
            partId: cad?.partId ?? null,
            role: cad?.role ?? null,
            color: cad?.color ?? item?.asset?.color ?? ('color' in node ? (node.color ?? null) : null),
            opacity: cad?.opacity ?? null,
            triangles: cad?.triangles ?? null,
            spec: cad?.spec ?? null,
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
    checkStructure: async () => checkStructure(),
    renderViews: async (input?: { planned?: [number, number, number] }) => renderSceneViews(input),
    renderEightViews,
    render,
    renderSheet,
    referencePack,
    reference,
    examples: {
      search: async (query?: string | { query?: string; kind?: string }) => {
        if (query && typeof query === 'object') return searchExamples(query.query ?? '', query.kind as never)
        return searchExamples(typeof query === 'string' ? query : '')
      },
      get: async (input: { id: string; params?: Record<string, unknown>; at?: [number, number, number] } | string) => {
        if (typeof input === 'string') return getExample({ id: input })
        return getExample({
          id: input.id,
          params: input.params as never,
          at: input.at,
        })
      },
    },
    plan: {
      check: async (blueprint: unknown) => checkBlueprint(blueprint),
      checkScene: async (blueprint?: unknown) => {
        const current = useOperatorPlanStore.getState().plan
        const stored = current ? operatorPlanBlueprints.get(current.id) : undefined
        return checkSceneAgainstPlan(blueprint ?? stored ?? {})
      },
      snap: async (blueprint?: unknown) => {
        const current = useOperatorPlanStore.getState().plan
        const stored = current ? operatorPlanBlueprints.get(current.id) : undefined
        return proposeRelationSnaps(blueprint ?? stored ?? {})
      },
    },
    runRecipe,
    waitForIdle,
    undo,
    redo,
    screenshot,
    selection: () => useViewer.getState().selection,
    executeTool: executeAgentTool,
    taskPlan,
    exportActions: () => recordedActions.map((action) => structuredClone(action)),
    replay: async (actions: unknown) => {
      useScene.getState().clearScene()
      recordedActions.length = 0
      const list = asActionList(actions) ?? unwrapActionList(actions)
      const maxActions = Array.isArray(list) ? Math.max(25, list.length) : 25
      return run(list, { maxActions })
    },
    invoke: async (method: string, args?: unknown) => {
      if (!INVOKE_ALLOWLIST.has(method)) {
        throw new Error(`Unknown pistola method "${method}".`)
      }
      const call = (fn: unknown) => {
        if (typeof fn !== 'function') throw new Error(`Unknown pistola method "${method}".`)
        const target = fn as (value?: unknown) => unknown
        return args === undefined ? target() : target(args)
      }
      if (method.startsWith('taskPlan.')) {
        const name = method.slice('taskPlan.'.length) as keyof typeof taskPlan
        return call(taskPlan[name])
      }
      if (method.startsWith('examples.')) {
        const name = method.slice('examples.'.length) as keyof typeof api.examples
        return call(api.examples[name])
      }
      if (method.startsWith('referencePack.')) {
        const name = method.slice('referencePack.'.length) as keyof typeof referencePack
        return call(referencePack[name])
      }
      if (method.startsWith('reference.')) {
        const name = method.slice('reference.'.length) as keyof typeof reference
        return call(reference[name])
      }
      if (method.startsWith('plan.')) {
        const name = method.slice('plan.'.length) as keyof typeof api.plan
        return call(api.plan[name])
      }
      return call((api as Record<string, unknown>)[method])
    },
  }

  return api
}

export type PistolaAgentApi = ReturnType<typeof createPistolaAgentApi>
