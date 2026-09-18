'use client'

import {
  type AnyNodeId,
  CadBodyNode as CadBodyNodeSchema,
  type CadBodyNode,
  type CadBodyOperation,
  CadSketchNodeSchema,
  type CadSketchNode,
  generateId,
  getLevelFloorElevation,
  normalizeCadBodyOperations,
  useScene,
} from '@pascal-app/core'
import { resolveCadSpaceParentId } from '../lib/cad-parent'
import { useViewer } from '@pascal-app/viewer'
import { create } from 'zustand'
import {
  createCadJob,
  fetchCadHelperHealth,
  fetchCadJob,
  type CadHelperHealth,
  uploadImportStepFile,
} from '../lib/cad/client'
import useEditor from './use-editor'

type CadHelperStatus = 'unknown' | 'checking' | 'ready' | 'busy' | 'error'

type RegenerateOptions = {
  depth?: number
}

export type ExtrudeDirection = 'positive' | 'negative' | 'symmetric'
export type RevolveAxis = 'X' | 'Y' | 'Z' | 'custom'
export type BooleanOperationMode = 'union' | 'cut' | 'intersect'

type ExtrudeOptions = {
  depth?: number
  direction?: ExtrudeDirection
}

type RevolveOptions = {
  angle?: number
  axis?: RevolveAxis
  customAxis?: [number, number, number]
}

type BooleanOptions = {
  operation?: BooleanOperationMode
}

type EdgeOperationOptions = {
  edgeRefs?: string[]
  radius?: number
  distance?: number
}

type CadState = {
  helperStatus: CadHelperStatus
  helperInfo: CadHelperHealth | null
  lastError: string | null
  activeJobId: string | null
  commandToast: { id: number; message: string } | null
  showCommandToast: (message: string) => void
  clearCommandToast: () => void
  refreshHealth: () => Promise<void>
  createDefaultSketch: (position?: [number, number, number]) => CadSketchNode | null
  extrudeSelectedSketch: (options?: number | ExtrudeOptions) => Promise<string | null>
  revolveSelectedSketch: (options?: RevolveOptions) => Promise<string | null>
  applyBooleanToSelection: (options?: BooleanOptions) => Promise<string | null>
  applyFilletToSelection: (options?: EdgeOperationOptions) => Promise<string | null>
  applyChamferToSelection: (options?: EdgeOperationOptions) => Promise<string | null>
  importStepFile: (file: File) => Promise<string | null>
  regenerateSelectedBody: (options?: RegenerateOptions) => Promise<void>
  retrySelectedBody: () => void
  setOperationSuppressed: (bodyId: string, operationId: string, suppressed: boolean) => Promise<boolean>
  toggleOperationSuppressed: (bodyId: string, operationId: string) => void
  exportSelectedBodyStep: () => Promise<void>
}

const defaultSketchDepth = 1.2
const defaultRevolveAngle = 360
const defaultFilletRadius = 0.08
const defaultChamferDistance = 0.06
const rebuildingStatuses: CadBodyNode['regenStatus'][] = ['pending', 'building', 'queued', 'running']
const stepExtensionPattern = /\.(step|stp)$/i
const levelSketchOffset = 0.01
export const cadHelperUnavailableMessage =
  'CAD helper unavailable. The configured CAD runtime could not be reached.'

const getParentIdForCadNodes = (): AnyNodeId | null => resolveCadSpaceParentId()

export const getSelectedCadLevelFloorY = () => {
  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return 0

  const nodes = useScene.getState().nodes
  const levelNode = nodes[levelId as AnyNodeId]
  if (levelNode?.type !== 'level') return 0

  return getLevelFloorElevation(levelId, nodes)
}

const getLevelAlignedSketchPosition = (
  position?: [number, number, number],
): [number, number, number] => [position?.[0] ?? 0, getSelectedCadLevelFloorY() + levelSketchOffset, position?.[2] ?? 0]

const getDefaultSketchPosition = (): [number, number, number] => {
  if (useEditor.getState().workspace === 'cad') return [0, levelSketchOffset, 0]
  const levelId = useViewer.getState().selection.levelId
  if (!levelId) return [0, levelSketchOffset, 0]
  return getLevelAlignedSketchPosition()
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getCadHelperUnavailableMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : cadHelperUnavailableMessage

const ensureCadHelperReady = async (
  set: (partial: Partial<CadState>) => void,
) => {
  set({ helperStatus: 'checking', lastError: null })

  try {
    const helperInfo = await fetchCadHelperHealth()
    set({ helperInfo, helperStatus: 'ready', lastError: null })
    return true
  } catch (error) {
    set({
      helperInfo: null,
      helperStatus: 'error',
      activeJobId: null,
      lastError: getCadHelperUnavailableMessage(error),
    })
    return false
  }
}

const CAD_JOB_TIMEOUT_MS = 60_000
const CAD_JOB_POLL_MS = 500

const waitForCadJob = async (jobId: string) => {
  const deadline = Date.now() + CAD_JOB_TIMEOUT_MS

  while (Date.now() < deadline) {
    const result = await fetchCadJob(jobId)
    if (result.status === 'succeeded' || result.status === 'failed') return result
    await wait(CAD_JOB_POLL_MS)
  }

  throw new Error('CAD helper timed out while waiting for a job result.')
}

const getActiveCadSketch = (): CadSketchNode | null => {
  const activeSketchId = useEditor.getState().activeSketchId
  if (activeSketchId) {
    const activeNode = useScene.getState().nodes[activeSketchId as AnyNodeId]
    if (activeNode?.type === 'cad-sketch') return activeNode
  }

  const selectedIds = useViewer.getState().selection.selectedIds
  if (selectedIds.length !== 1) return null
  const node = useScene.getState().nodes[selectedIds[0]! as AnyNodeId]
  return node?.type === 'cad-sketch' ? node : null
}

const getSelectedCadBody = (): CadBodyNode | null => {
  const selectedIds = useViewer.getState().selection.selectedIds
  if (selectedIds.length !== 1) return null
  const node = useScene.getState().nodes[selectedIds[0]! as AnyNodeId]
  return node?.type === 'cad-body' ? node : null
}

const getSelectedCadBodies = (): CadBodyNode[] =>
  useViewer
    .getState()
    .selection.selectedIds.map((id) => useScene.getState().nodes[id as AnyNodeId])
    .filter((node): node is CadBodyNode => node?.type === 'cad-body')

const getBodyOperations = (body: CadBodyNode): CadBodyOperation[] =>
  normalizeCadBodyOperations(body.operationHistory.length > 0 ? body.operationHistory : body.operations)

const findCadBodyForSketch = (sketchId: string) =>
  Object.values(useScene.getState().nodes).find(
    (node) =>
      node.type === 'cad-body' &&
      (node.sourceSketchId === sketchId || node.sourceSketchIds.includes(sketchId)),
  )

const getExtrudeOptions = (options?: number | ExtrudeOptions) => {
  if (typeof options === 'number') {
    return { depth: options, direction: 'positive' as const }
  }

  return {
    depth: options?.depth ?? defaultSketchDepth,
    direction: options?.direction ?? ('positive' as const),
  }
}

const getRevolveOptions = (options?: RevolveOptions) => ({
  angle: options?.angle ?? defaultRevolveAngle,
  axis: options?.axis ?? ('Z' as const),
  customAxis: options?.customAxis,
})

const isBodyRebuilding = (body: CadBodyNode) => rebuildingStatuses.includes(body.regenStatus)

const buildExtrudeOperation = (
  sketch: CadSketchNode,
  depth: number,
  direction: ExtrudeDirection,
): CadBodyOperation => {
  const absoluteDepth = Math.abs(depth)
  const directionVector =
    direction === 'negative' ? ([0, -1, 0] as [number, number, number]) : ([0, 1, 0] as [number, number, number])
  const symmetric = direction === 'symmetric'

  return {
    id: generateId('cadop'),
    type: 'extrude',
    kind: 'extrude',
    params: {
      distance: absoluteDepth,
      direction: directionVector,
      symmetric,
    },
    suppressed: false,
    sketchId: sketch.id,
    depth: absoluteDepth,
    distance: absoluteDepth,
    direction: directionVector,
    symmetric,
  }
}

const buildRevolveOperation = (
  sketch: CadSketchNode,
  options?: RevolveOptions,
): CadBodyOperation => {
  const { angle, axis, customAxis } = getRevolveOptions(options)

  return {
    id: generateId('cadop'),
    type: 'revolve',
    kind: 'revolve',
    params: {
      axis,
      angle,
      ...(axis === 'custom' && customAxis ? { customAxis } : {}),
    },
    suppressed: false,
    sketchId: sketch.id,
    axis,
    angle,
    ...(axis === 'custom' && customAxis ? { customAxis } : {}),
  }
}

const buildBooleanOperation = (
  toolBodyId: string,
  operation: BooleanOperationMode,
): CadBodyOperation => {
  if (operation === 'cut') {
    const nextOperation: Extract<CadBodyOperation, { kind: 'boolean_cut' }> = {
      id: generateId('cadop'),
      type: 'boolean_cut',
      kind: 'boolean_cut',
      params: {
        toolBodyIds: [toolBodyId],
      },
      suppressed: false,
      operation: 'cut',
      toolBodyIds: [toolBodyId],
    }
    return nextOperation
  }

  if (operation === 'intersect') {
    const nextOperation: Extract<CadBodyOperation, { kind: 'boolean_intersect' }> = {
      id: generateId('cadop'),
      type: 'boolean_intersect',
      kind: 'boolean_intersect',
      params: {
        toolBodyIds: [toolBodyId],
      },
      suppressed: false,
      operation: 'intersect',
      toolBodyIds: [toolBodyId],
    }
    return nextOperation
  }

  const nextOperation: Extract<CadBodyOperation, { kind: 'boolean_union' }> = {
    id: generateId('cadop'),
    type: 'boolean_union',
    kind: 'boolean_union',
    params: {
      toolBodyIds: [toolBodyId],
    },
    suppressed: false,
    operation: 'union',
    toolBodyIds: [toolBodyId],
  }
  return nextOperation
}

const buildFilletOperation = (
  edgeRefs: string[],
  radius: number,
): CadBodyOperation => ({
  id: generateId('cadop'),
  type: 'fillet',
  kind: 'fillet',
  params: {
    edgeRefs,
    radius,
  },
  suppressed: false,
  edgeRefs,
  radius,
})

const buildChamferOperation = (
  edgeRefs: string[],
  distance: number,
): CadBodyOperation => ({
  id: generateId('cadop'),
  type: 'chamfer',
  kind: 'chamfer',
  params: {
    edgeRefs,
    distance,
  },
  suppressed: false,
  edgeRefs,
  distance,
})

const getQueuedPreview = (operation: CadBodyOperation): CadBodyNode['preview'] => {
  switch (operation.kind) {
    case 'revolve':
      return {
        primitive: 'cylinder',
        radius: 0.75,
        height: 1.2,
        radialSegments: 48,
        color: '#38bdf8',
      }
    case 'boolean_union':
    case 'boolean_cut':
    case 'boolean_intersect':
    case 'boolean':
      return {
        primitive: 'box',
        dimensions: [2, 1.2, 1.5],
        color:
          operation.operation === 'union'
            ? '#f59e0b'
            : operation.operation === 'intersect'
              ? '#a855f7'
              : '#fb7185',
      }
    case 'fillet':
      return {
        primitive: 'box',
        dimensions: [2, 1.2, 1.5],
        color: '#22c55e',
      }
    case 'chamfer':
      return {
        primitive: 'box',
        dimensions: [2, 1.2, 1.5],
        color: '#f97316',
      }
    case 'extrude':
      return {
        primitive: 'box',
        dimensions: [2, Math.max(operation.distance, 0.2), 1.5],
        color: '#60a5fa',
      }
    default:
      return {
        primitive: 'box',
        dimensions: [2, 1.2, 1.5],
        color: '#60a5fa',
      }
  }
}

const getImportedBodyName = (filename: string) => filename.replace(stepExtensionPattern, '') || 'Imported STEP'

const buildBlockedBodyMessage = () => 'Body is rebuilding. Please wait.'

const getExportDownloadUrl = (exportUrl: string) => {
  if (exportUrl.startsWith('/api/cad/artifacts/')) return exportUrl
  if (exportUrl.startsWith('/v1/cad/artifacts/')) {
    return `/api/cad/artifacts/${exportUrl.slice('/v1/cad/artifacts/'.length)}`
  }
  return exportUrl
}

const updateBodyOperations = (
  bodyId: string,
  operations: CadBodyOperation[],
  extra: Partial<CadBodyNode> = {},
) => {
  useScene.getState().updateNode(bodyId as AnyNodeId, {
    operations: operations as any,
    operationHistory: operations as any,
    regenStatus: 'pending',
    regenError: null,
    ...extra,
  } as any)
}

const finishQueuedOperation = (
  bodyId: string,
  options: {
    activeSketchId?: string | null
  } = {},
) => {
  useViewer.getState().setSelection({ selectedIds: [bodyId], zoneId: null })
  if ('activeSketchId' in options) {
    useEditor.getState().setActiveSketchId(options.activeSketchId ?? null)
  }
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)
}

const queueSketchBodyOperation = (
  sketch: CadSketchNode,
  operation: CadBodyOperation,
): string | null => {
  const existingBody = findCadBodyForSketch(sketch.id)

  if (existingBody?.type === 'cad-body') {
    if (isBodyRebuilding(existingBody)) return null

    const nextSourceSketchIds = Array.from(
      new Set([...(existingBody.sourceSketchIds || []), sketch.id]),
    )
    const nextOperations = [...getBodyOperations(existingBody), operation]

    updateBodyOperations(existingBody.id, nextOperations, {
      sourceSketchId: sketch.id,
      sourceSketchIds: nextSourceSketchIds,
      preview: getQueuedPreview(operation),
    })
    finishQueuedOperation(existingBody.id, { activeSketchId: sketch.id })
    return existingBody.id
  }

  const body = CadBodyNodeSchema.parse({
    name: `${sketch.name || 'Sketch'} Body`,
    parentId: sketch.parentId,
    transform: {
      position: [...sketch.position] as [number, number, number],
      rotation: [...sketch.rotation] as [number, number, number],
      scale: [1, 1, 1],
    },
    sourceSketchId: sketch.id,
    sourceSketchIds: [sketch.id],
    regenStatus: 'pending',
    preview: getQueuedPreview(operation),
    operations: [operation],
    operationHistory: [operation],
    artifacts: {},
    warnings: [],
  })

  useScene.getState().createNode(body, sketch.parentId as AnyNodeId)
  finishQueuedOperation(body.id, { activeSketchId: sketch.id })
  return body.id
}

const queueBodyOperation = (body: CadBodyNode, operation: CadBodyOperation): string | null => {
  if (isBodyRebuilding(body)) return null

  updateBodyOperations(body.id, [...getBodyOperations(body), operation], {
    preview: body.preview ?? getQueuedPreview(operation),
  })
  finishQueuedOperation(body.id, { activeSketchId: null })
  return body.id
}

const applyExtrudeDepthOverride = (operations: CadBodyOperation[], depth: number) => {
  const absoluteDepth = Math.abs(depth)
  const nextOperations = [...operations]

  for (let index = nextOperations.length - 1; index >= 0; index -= 1) {
    const operation = nextOperations[index]
    if (operation?.kind !== 'extrude') continue

    nextOperations[index] = {
      ...operation,
      depth: absoluteDepth,
      distance: absoluteDepth,
      params: {
        ...operation.params,
        distance: absoluteDepth,
      },
    }
    break
  }

  return nextOperations
}

const queueSelectedBodyRegeneration = (
  body: CadBodyNode,
  options?: RegenerateOptions,
): string | null => {
  if (isBodyRebuilding(body)) return null

  const currentOperations = getBodyOperations(body)
  const nextOperations =
    typeof options?.depth === 'number'
      ? applyExtrudeDepthOverride(currentOperations, options.depth)
      : currentOperations

  updateBodyOperations(body.id, nextOperations, {
    preview: body.preview,
  })

  useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
  useEditor.getState().setActiveSketchId(null)
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)
  return body.id
}

const useCad = create<CadState>()((set, get) => ({
  helperStatus: 'unknown',
  helperInfo: null,
  lastError: null,
  activeJobId: null,
  commandToast: null,
  showCommandToast: (message) => set({ commandToast: { id: Date.now(), message } }),
  clearCommandToast: () => set({ commandToast: null }),
  refreshHealth: async () => {
    await ensureCadHelperReady(set)
  },
  createDefaultSketch: (position) => {
    const parentId = getParentIdForCadNodes()
    if (!parentId) {
      set({ lastError: 'CAD space is unavailable for sketch creation.' })
      return null
    }

    const { activeWorkplane, setActiveSketchId } = useEditor.getState()

    const sketchCount = Object.values(useScene.getState().nodes).filter(
      (node) => node.type === 'cad-sketch',
    ).length

    const sketch = {
      object: 'node',
      id: generateId('csk'),
      type: 'cad-sketch',
      name: `Sketch ${sketchCount + 1}`,
      parentId,
      visible: true,
      metadata: {},
      plane: activeWorkplane,
      planeAnchorNodeId: null,
      position:
        useEditor.getState().workspace === 'cad' || activeWorkplane !== 'level'
          ? position ?? getDefaultSketchPosition()
          : getLevelAlignedSketchPosition(position),
      rotation: [0, 0, 0],
      editStatus: 'editing',
      entities: [],
      constraints: [],
      dimensions: [],
      closedProfileEntityIds: [],
    }

    const parsedSketch = CadSketchNodeSchema.parse(sketch)

    useScene.getState().createNode(parsedSketch as any, parentId)
    useEditor.getState().setSelectedReferenceId(null)
    setActiveSketchId(parsedSketch.id)
    useViewer.getState().setSelection({ selectedIds: [parsedSketch.id], zoneId: null })
    useEditor.getState().setPhase('cad')
    useEditor.getState().setMode('select')
    set({ lastError: null })

    return parsedSketch
  },
  extrudeSelectedSketch: async (options) => {
    const sketch = getActiveCadSketch()
    if (!sketch) {
      set({ lastError: 'Select a CAD sketch before extruding.' })
      return null
    }

    if (sketch.closedProfileEntityIds.length === 0) {
      set({ lastError: 'Sketch needs a closed profile before it can be extruded.' })
      return null
    }

    if (!(await ensureCadHelperReady(set))) {
      return null
    }

    const { depth, direction } = getExtrudeOptions(options)
    const operation = buildExtrudeOperation(sketch, depth, direction)
    const bodyId = queueSketchBodyOperation(sketch, operation)

    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
    return bodyId
  },
  revolveSelectedSketch: async (options) => {
    const sketch = getActiveCadSketch()
    if (!sketch) {
      set({ lastError: 'Select a CAD sketch before revolving.' })
      return null
    }

    if (sketch.closedProfileEntityIds.length === 0) {
      set({ lastError: 'Sketch needs a closed profile before it can be revolved.' })
      return null
    }

    if (!(await ensureCadHelperReady(set))) {
      return null
    }

    const operation = buildRevolveOperation(sketch, options)
    const bodyId = queueSketchBodyOperation(sketch, operation)

    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
    return bodyId
  },
  applyBooleanToSelection: async (options) => {
    const bodies = getSelectedCadBodies()
    if (bodies.length !== 2) {
      set({ lastError: 'Select exactly two CAD bodies before applying a Boolean operation.' })
      return null
    }

    if (bodies.some(isBodyRebuilding)) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    const targetBody = bodies[0]
    const toolBody = bodies[1]
    if (!(targetBody && toolBody)) {
      set({ lastError: 'Select exactly two CAD bodies before applying a Boolean operation.' })
      return null
    }

    if (!(await ensureCadHelperReady(set))) {
      return null
    }

    const operation = buildBooleanOperation(toolBody.id, options?.operation ?? 'union')
    const bodyId = queueBodyOperation(targetBody, operation)

    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
    return bodyId
  },
  applyFilletToSelection: async (options) => {
    const body = getSelectedCadBody()
    if (!body) {
      set({ lastError: 'Select a CAD body before applying a fillet.' })
      return null
    }

    if (isBodyRebuilding(body)) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    if (!(await ensureCadHelperReady(set))) {
      return null
    }

    const edgeRefs = options?.edgeRefs?.filter(Boolean) ?? ['edge-1']
    const operation = buildFilletOperation(edgeRefs, options?.radius ?? defaultFilletRadius)
    const bodyId = queueBodyOperation(body, operation)

    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
    return bodyId
  },
  applyChamferToSelection: async (options) => {
    const body = getSelectedCadBody()
    if (!body) {
      set({ lastError: 'Select a CAD body before applying a chamfer.' })
      return null
    }

    if (isBodyRebuilding(body)) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    if (!(await ensureCadHelperReady(set))) {
      return null
    }

    const edgeRefs = options?.edgeRefs?.filter(Boolean) ?? ['edge-1']
    const operation = buildChamferOperation(edgeRefs, options?.distance ?? defaultChamferDistance)
    const bodyId = queueBodyOperation(body, operation)

    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return null
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
    return bodyId
  },
  importStepFile: async (file) => {
    const parentId = getParentIdForCadNodes()
    if (!parentId) {
      set({ lastError: 'No active site or level is selected for STEP import.' })
      return null
    }

    if (!stepExtensionPattern.test(file.name)) {
      set({ lastError: 'Select a .step or .stp file to import.' })
      return null
    }

    if (!(await ensureCadHelperReady(set))) {
      return null
    }

    set({ helperStatus: 'busy', lastError: null })

    try {
      const created = await uploadImportStepFile(file)
      set({ activeJobId: created.jobId })

      const completed = await waitForCadJob(created.jobId)
      if (!(completed.status === 'succeeded' && completed.result?.artifacts)) {
        throw new Error(completed.error || 'CAD helper failed to import the STEP file.')
      }

      const body = CadBodyNodeSchema.parse({
        name: getImportedBodyName(file.name),
        parentId,
        regenStatus: 'idle',
        regenError: null,
        preview: completed.result.preview,
        operations: [],
        operationHistory: [],
        sourceSketchIds: [],
        artifacts: completed.result.artifacts,
        previewArtifactRef:
          completed.result.artifacts.previewArtifactRef ||
          completed.result.artifacts.previewUrl ||
          null,
        cadArtifactRef:
          completed.result.artifacts.cadArtifactRef || completed.result.artifacts.cadUrl || null,
        warnings: completed.warnings || [],
      })

      useScene.getState().createNode(body, parentId)
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      useEditor.getState().setActiveSketchId(null)
      useEditor.getState().setMode('select')
      useEditor.getState().setTool(null)
      set({ helperStatus: 'ready', activeJobId: null, lastError: null })
      return body.id
    } catch (error) {
      set({
        helperStatus: 'error',
        activeJobId: null,
        lastError: error instanceof Error ? error.message : 'Failed to import the STEP file.',
      })
      return null
    }
  },
  regenerateSelectedBody: async (options) => {
    const body = getSelectedCadBody()
    if (!body) {
      set({ lastError: 'Select a CAD body before regenerating.' })
      return
    }

    if (!(await ensureCadHelperReady(set))) {
      return
    }

    const bodyId = queueSelectedBodyRegeneration(body, options)
    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
  },
  retrySelectedBody: async () => {
    const body = getSelectedCadBody()
    if (!body) {
      set({ lastError: 'Select a CAD body before retrying regeneration.' })
      return
    }

    if (!(await ensureCadHelperReady(set))) {
      return
    }

    const bodyId = queueSelectedBodyRegeneration(body)
    if (!bodyId) {
      set({ lastError: buildBlockedBodyMessage() })
      return
    }

    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
  },
  setOperationSuppressed: async (bodyId, operationId, suppressed) => {
    const body = useScene.getState().nodes[bodyId as AnyNodeId]
    if (body?.type !== 'cad-body') {
      set({ lastError: 'Select a CAD body before changing operation suppression.' })
      return false
    }

    if (isBodyRebuilding(body)) {
      set({ lastError: buildBlockedBodyMessage() })
      return false
    }

    if (!(await ensureCadHelperReady(set))) {
      return false
    }

    const operations = getBodyOperations(body)
    const targetOperation = operations.find((operation) => operation.id === operationId)
    if (!targetOperation) {
      set({ lastError: `CAD operation "${operationId}" was not found on the selected body.` })
      return false
    }

    if (targetOperation.suppressed === suppressed) {
      useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
      useEditor.getState().setActiveSketchId(null)
      set({ helperStatus: 'ready', activeJobId: null, lastError: null })
      return true
    }

    const nextOperations = operations.map((operation) =>
      operation.id === operationId ? { ...operation, suppressed } : operation,
    )

    updateBodyOperations(body.id, nextOperations, { preview: body.preview })
    useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
    useEditor.getState().setActiveSketchId(null)
    set({ helperStatus: 'ready', activeJobId: null, lastError: null })
    return true
  },
  toggleOperationSuppressed: (bodyId, operationId) => {
    const body = useScene.getState().nodes[bodyId as AnyNodeId]
    if (body?.type !== 'cad-body') return

    if (isBodyRebuilding(body)) {
      set({ lastError: buildBlockedBodyMessage() })
      return
    }

    const targetOperation = getBodyOperations(body).find((operation) => operation.id === operationId)
    if (!targetOperation) {
      set({ lastError: `CAD operation "${operationId}" was not found on the selected body.` })
      return
    }

    void get().setOperationSuppressed(bodyId, operationId, !targetOperation.suppressed)
  },
  exportSelectedBodyStep: async () => {
    const body = getSelectedCadBody()
    if (!body) {
      set({ lastError: 'Select a CAD body before exporting STEP.' })
      return
    }

    if (!(await ensureCadHelperReady(set))) {
      return
    }

    set({ helperStatus: 'busy', lastError: null })

    try {
      const created = await createCadJob({
        type: 'export_step',
        payload: {
          cadArtifactRef: body.cadArtifactRef,
          bodyName: body.name,
        },
      })

      set({ activeJobId: created.jobId })
      const completed = await waitForCadJob(created.jobId)

      const exportUrl = completed.result?.artifacts?.exportUrl
      if (!(completed.status === 'succeeded' && exportUrl)) {
        throw new Error(completed.error || 'CAD helper failed to export the selected body.')
      }

      window.location.href = getExportDownloadUrl(exportUrl)
      set({ helperStatus: 'ready', activeJobId: null })
    } catch (error) {
      set({
        helperStatus: 'error',
        activeJobId: null,
        lastError: error instanceof Error ? error.message : 'Failed to export the selected body.',
      })
    }
  },
}))

export default useCad
