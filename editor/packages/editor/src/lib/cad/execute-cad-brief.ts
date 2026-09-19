import {
  type AnyNodeId,
  type CadBrief,
  type CadBodyOperation,
  type CadEntitySpec,
  CadBodyNodeSchema,
  CadSketchNodeSchema,
  generateId,
  getLevelFloorElevation,
  normalizeCadBodyOperations,
  useScene,
} from '@pascal-app/core'

const DEFAULT_SKETCH_ELEVATION = 0.01

type CadPoint = [number, number]

const getNumericParam = (params: Record<string, unknown>, key: string, fallback: number) =>
  typeof params[key] === 'number' && Number.isFinite(params[key]) ? (params[key] as number) : fallback

const getHeartProfilePoints = (entity: CadEntitySpec): CadPoint[] => {
  const width = Math.max(getNumericParam(entity.params, 'width', 2), 0.1)
  const height = Math.max(getNumericParam(entity.params, 'height', 2.5), 0.1)
  const center = Array.isArray(entity.params.center) && entity.params.center.length === 2
    ? entity.params.center
    : [0, 0]
  const centerX = typeof center[0] === 'number' ? center[0] : 0
  const centerY = typeof center[1] === 'number' ? center[1] : 0
  const raw = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2
    return [
      16 * Math.sin(angle) ** 3,
      13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle),
    ] as CadPoint
  })
  const minX = Math.min(...raw.map((point) => point[0]))
  const maxX = Math.max(...raw.map((point) => point[0]))
  const minY = Math.min(...raw.map((point) => point[1]))
  const maxY = Math.max(...raw.map((point) => point[1]))
  const scaleX = width / Math.max(maxX - minX, Number.EPSILON)
  const scaleY = height / Math.max(maxY - minY, Number.EPSILON)

  return raw.map(([x, y]) => [
    centerX + (x - (minX + maxX) / 2) * scaleX,
    centerY + (y - (minY + maxY) / 2) * scaleY,
  ])
}

const getOperationOrder = (brief: CadBrief) => {
  const operationsById = new Map(brief.operationGraph.map((operation) => [operation.id, operation]))
  const pendingDependencies = new Map(
    brief.operationGraph.map((operation) => [
      operation.id,
      operation.dependsOn.filter((dependency) => operationsById.has(dependency)).length,
    ]),
  )
  const ready = brief.operationGraph
    .filter((operation) => (pendingDependencies.get(operation.id) ?? 0) === 0)
    .map((operation) => operation.id)
  const ordered: CadBrief['operationGraph'] = []

  while (ready.length > 0) {
    const operationId = ready.shift()
    if (!operationId) continue

    const operation = operationsById.get(operationId)
    if (!operation) continue

    ordered.push(operation)

    for (const candidate of brief.operationGraph) {
      if (!candidate.dependsOn.includes(operation.id)) continue

      const remaining = Math.max(0, (pendingDependencies.get(candidate.id) ?? 0) - 1)
      pendingDependencies.set(candidate.id, remaining)
      if (remaining === 0) {
        ready.push(candidate.id)
      }
    }
  }

  if (ordered.length !== brief.operationGraph.length) {
    throw new Error('CAD brief contains a cyclic operation graph.')
  }

  return ordered
}

const getSketchPosition = (plane: CadBrief['sketchPlans'][number]['plane'], parentId: string) => {
  const nodes = useScene.getState().nodes
  const parentNode = nodes[parentId as AnyNodeId]
  if (plane === 'level' && parentNode?.type === 'level') {
    return [0, getLevelFloorElevation(parentId, nodes) + DEFAULT_SKETCH_ELEVATION, 0] as [
      number,
      number,
      number,
    ]
  }

  return [0, DEFAULT_SKETCH_ELEVATION, 0] as [number, number, number]
}

const getEntityBounds = (entity: CadEntitySpec) => {
  if (entity.type === 'heart') {
    const points = getHeartProfilePoints(entity)
    return {
      minX: Math.min(...points.map((point) => point[0])),
      maxX: Math.max(...points.map((point) => point[0])),
      minY: Math.min(...points.map((point) => point[1])),
      maxY: Math.max(...points.map((point) => point[1])),
    }
  }

  if (entity.type === 'rectangle') {
    const [start = [0, 0], end = [2, 1.5]] = entity.points
    return {
      minX: Math.min(start[0], end[0]),
      maxX: Math.max(start[0], end[0]),
      minY: Math.min(start[1], end[1]),
      maxY: Math.max(start[1], end[1]),
    }
  }

  if (entity.type === 'circle' || entity.type === 'arc') {
    const [center = [0, 0], edge = [0.75, 0]] = entity.points
    const radius =
      typeof entity.params.radius === 'number'
        ? entity.params.radius
        : Math.hypot(edge[0] - center[0], edge[1] - center[1]) || 0.75

    return {
      minX: center[0] - radius,
      maxX: center[0] + radius,
      minY: center[1] - radius,
      maxY: center[1] + radius,
    }
  }

  const points =
    entity.type === 'polyline'
      ? entity.points.length > 0
        ? entity.points
        : ([
            [0, 0],
            [1, 0],
          ] as [number, number][])
      : entity.points.length > 0
        ? entity.points
        : ([
            [0, 0],
            [1, 0],
          ] as [number, number][])

  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

const getSketchExtents = (entities: CadEntitySpec[]) => {
  if (entities.length === 0) {
    return { width: 2, depth: 1.5, centerX: 0, centerY: 0 }
  }

  const bounds = entities.map(getEntityBounds)
  const minX = Math.min(...bounds.map((bound) => bound.minX))
  const maxX = Math.max(...bounds.map((bound) => bound.maxX))
  const minY = Math.min(...bounds.map((bound) => bound.minY))
  const maxY = Math.max(...bounds.map((bound) => bound.maxY))

  return {
    width: Math.max(maxX - minX, 0.5),
    depth: Math.max(maxY - minY, 0.5),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

const getBodyPositionForSketch = (
  plane: CadBrief['sketchPlans'][number]['plane'],
  sketchPosition: [number, number, number],
  sketchExtents: ReturnType<typeof getSketchExtents>,
  params: Record<string, unknown>,
) => {
  const baseElevation =
    typeof params.baseElevation === 'number'
      ? params.baseElevation
      : typeof params.offsetY === 'number'
        ? params.offsetY
        : 0

  if (plane === 'XY' || plane === 'level') {
    return [
      sketchExtents.centerX,
      sketchPosition[1] + baseElevation,
      sketchExtents.centerY,
    ] as [number, number, number]
  }

  return [...sketchPosition] as [number, number, number]
}

const buildSketchEntity = (entity: CadEntitySpec) => {
  const entityId = generateId('cskent')

  switch (entity.type) {
    case 'rectangle': {
      const [start = [0, 0], end = [2, 1.5]] = entity.points
      return {
        id: entityId,
        kind: 'rectangle',
        center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        width: Math.abs(end[0] - start[0]) || 2,
        height: Math.abs(end[1] - start[1]) || 1.5,
      }
    }
    case 'circle': {
      const [center = [0, 0], edge = [0.75, 0]] = entity.points
      const radius =
        typeof entity.params.radius === 'number'
          ? entity.params.radius
          : Math.hypot(edge[0] - center[0], edge[1] - center[1]) || 0.75

      return {
        id: entityId,
        kind: 'circle',
        center,
        radius,
      }
    }
    case 'arc': {
      const [center = [0, 0], edge = [0.75, 0]] = entity.points
      const radius =
        typeof entity.params.radius === 'number'
          ? entity.params.radius
          : Math.hypot(edge[0] - center[0], edge[1] - center[1]) || 0.75

      return {
        id: entityId,
        kind: 'arc',
        center,
        radius,
        startAngle:
          typeof entity.params.startAngle === 'number' ? entity.params.startAngle : 0,
        endAngle:
          typeof entity.params.endAngle === 'number' ? entity.params.endAngle : Math.PI / 2,
      }
    }
    case 'polyline':
      return {
        id: entityId,
        kind: 'polyline',
        points:
          entity.points.length > 1
            ? entity.points
            : ([
                [0, 0],
                [1, 0],
              ] as [number, number][]),
        closed: Boolean(entity.params.closed),
      }
    case 'heart':
      return {
        id: entityId,
        kind: 'polyline',
        points: getHeartProfilePoints(entity),
        closed: true,
      }
    default: {
      const [start = [0, 0], end = [1, 0]] = entity.points
      return {
        id: entityId,
        kind: 'line',
        start,
        end,
      }
    }
  }
}

const buildSketchDimensions = (dimensions: CadBrief['sketchPlans'][number]['dimensions']) =>
  dimensions
    .map((dimension) => {
      const value = typeof dimension.value === 'number' ? dimension.value : null
      if (value === null || value <= 0) return null

      return {
        id: typeof dimension.id === 'string' ? dimension.id : generateId('cskdim'),
        kind:
          dimension.kind === 'radius' || dimension.kind === 'diameter'
            ? dimension.kind
            : 'distance',
        entityId:
          typeof dimension.entityId === 'string'
            ? dimension.entityId
            : typeof dimension.entityIndex === 'number'
              ? String(dimension.entityIndex)
              : generateId('cskent'),
        value,
        ...(typeof dimension.label === 'string' ? { label: dimension.label } : {}),
      }
    })
    .filter(Boolean)

const buildSketchConstraints = (constraints: CadBrief['sketchPlans'][number]['constraints']) =>
  constraints
    .map((constraint) => {
      const kind =
        constraint.kind === 'coincident' ||
        constraint.kind === 'horizontal' ||
        constraint.kind === 'vertical' ||
        constraint.kind === 'parallel' ||
        constraint.kind === 'perpendicular' ||
        constraint.kind === 'tangent' ||
        constraint.kind === 'equal' ||
        constraint.kind === 'dimension'
          ? constraint.kind
          : null

      if (!kind) return null

      return {
        id: typeof constraint.id === 'string' ? constraint.id : generateId('cskcon'),
        kind,
        entityIds: Array.isArray(constraint.entityIds)
          ? constraint.entityIds.filter((value): value is string => typeof value === 'string')
          : [],
        ...(typeof constraint.value === 'number' ? { value: constraint.value } : {}),
      }
    })
    .filter(Boolean)

const getClosedProfileEntityIds = (entities: ReturnType<typeof buildSketchEntity>[]) =>
  entities
    .filter(
      (entity) =>
        entity.kind === 'rectangle' ||
        entity.kind === 'circle' ||
        entity.kind === 'arc' ||
        (entity.kind === 'polyline' && entity.closed),
    )
    .map((entity) => entity.id)

const resolveSketchId = (
  params: Record<string, unknown>,
  sketchIds: string[],
  dependencies: string[],
  operationToSketchId: Map<string, string>,
) => {
  if (typeof params.sketchIndex === 'number') {
    return sketchIds[params.sketchIndex] ?? null
  }

  if (typeof params.sketchId === 'string') {
    return params.sketchId
  }

  for (const dependency of dependencies) {
    const sketchId = operationToSketchId.get(dependency)
    if (sketchId) return sketchId
  }

  return sketchIds[0] ?? null
}

const resolveBodyId = (reference: string | undefined, operationToBodyId: Map<string, string>) => {
  if (!reference) return null
  return operationToBodyId.get(reference) ?? reference
}

const buildExtrudeOperation = (sketchId: string, params: Record<string, unknown>): CadBodyOperation => {
  const distance = typeof params.distance === 'number' ? Math.abs(params.distance) : 1
  const symmetric = Boolean(params.symmetric)
  const direction =
    Array.isArray(params.direction) && params.direction.length === 3
      ? (params.direction.map((value) => Number(value) || 0) as [number, number, number])
      : ([0, 1, 0] as [number, number, number])

  return {
    id: generateId('cadop'),
    type: 'extrude',
    kind: 'extrude',
    params: {
      distance,
      direction,
      symmetric,
    },
    suppressed: false,
    sketchId,
    depth: distance,
    distance,
    direction,
    symmetric,
  }
}

const buildRevolveOperation = (sketchId: string, params: Record<string, unknown>): CadBodyOperation => {
  const axis =
    params.axis === 'X' || params.axis === 'Y' || params.axis === 'Z' || params.axis === 'custom'
      ? params.axis
      : 'Z'
  const angle = typeof params.angle === 'number' ? Math.abs(params.angle) : 360
  const customAxis =
    axis === 'custom' && Array.isArray(params.customAxis) && params.customAxis.length === 3
      ? (params.customAxis.map((value) => Number(value) || 0) as [number, number, number])
      : undefined

  return {
    id: generateId('cadop'),
    type: 'revolve',
    kind: 'revolve',
    params: {
      axis,
      angle,
      ...(customAxis ? { customAxis } : {}),
    },
    suppressed: false,
    sketchId,
    axis,
    angle,
    ...(customAxis ? { customAxis } : {}),
  }
}

const buildBooleanOperation = (
  toolBodyId: string,
  op: 'boolean_union' | 'boolean_cut' | 'boolean_intersect',
): CadBodyOperation => {
  if (op === 'boolean_cut') {
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

  if (op === 'boolean_intersect') {
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

const buildFilletOperation = (params: Record<string, unknown>): CadBodyOperation => {
  const edgeRefs = Array.isArray(params.edgeRefs)
    ? params.edgeRefs.filter((value): value is string => typeof value === 'string')
    : ['edge-1']
  const radius = typeof params.radius === 'number' ? Math.abs(params.radius) : 0.05

  return {
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
  }
}

const buildChamferOperation = (params: Record<string, unknown>): CadBodyOperation => {
  const edgeRefs = Array.isArray(params.edgeRefs)
    ? params.edgeRefs.filter((value): value is string => typeof value === 'string')
    : ['edge-1']
  const distance = typeof params.distance === 'number' ? Math.abs(params.distance) : 0.05

  return {
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
  }
}

export async function executeCadBrief(
  brief: CadBrief,
  parentId: string,
): Promise<{ sketchIds: string[]; bodyIds: string[] }> {
  const sketchIds: string[] = []
  const bodyIds: string[] = []
  const operationToBodyId = new Map<string, string>()
  const operationToSketchId = new Map<string, string>()

  brief.sketchPlans.forEach((sketchPlan, sketchIndex) => {
    const entities = sketchPlan.entities.map(buildSketchEntity)
    const sketch = CadSketchNodeSchema.parse({
      name: `AI Sketch ${sketchIndex + 1}`,
      parentId,
      plane: sketchPlan.plane,
      position: getSketchPosition(sketchPlan.plane, parentId),
      rotation: [0, 0, 0],
      editStatus: 'idle',
      visible: false,
      entities,
      constraints: buildSketchConstraints(sketchPlan.constraints),
      dimensions: buildSketchDimensions(sketchPlan.dimensions),
      closedProfileEntityIds: getClosedProfileEntityIds(entities),
    })

    useScene.getState().createNode(sketch, parentId as AnyNodeId)
    sketchIds.push(sketch.id)
  })

  const orderedOperations = getOperationOrder(brief)

  for (const operation of orderedOperations) {
    const params = operation.params

    if (operation.op === 'extrude' || operation.op === 'revolve') {
      const sketchId = resolveSketchId(params, sketchIds, operation.dependsOn, operationToSketchId)
      if (!sketchId) {
        throw new Error(`CAD brief operation "${operation.id}" could not resolve a source sketch.`)
      }

      const sketch = useScene.getState().nodes[sketchId as AnyNodeId]
      if (sketch?.type !== 'cad-sketch') {
        throw new Error(`CAD brief operation "${operation.id}" references a missing sketch.`)
      }

      const sketchPlanIndex =
        typeof params.sketchIndex === 'number' && params.sketchIndex >= 0 ? params.sketchIndex : 0
      const sketchPlan = brief.sketchPlans[sketchPlanIndex] ?? brief.sketchPlans[0]
      const sketchExtents = sketchPlan
        ? getSketchExtents(sketchPlan.entities)
        : { width: 2, depth: 1.5, centerX: 0, centerY: 0 }
      const cadOperation =
        operation.op === 'extrude'
          ? buildExtrudeOperation(sketchId, params)
          : buildRevolveOperation(sketchId, params)
      const extrudeDistance =
        operation.op === 'extrude' && cadOperation.kind === 'extrude' ? cadOperation.distance : 1.2
      const bodyPosition = getBodyPositionForSketch(sketchPlan?.plane ?? 'XY', sketch.position, sketchExtents, params)

      const preview =
        operation.op === 'extrude'
          ? (() => {
              const heartEntity = sketchPlan?.entities.find((entity) => entity.type === 'heart')
              if (heartEntity) {
                return {
                  primitive: 'extruded-profile' as const,
                  points: getHeartProfilePoints(heartEntity).map(([x, y]) => [
                    x - sketchExtents.centerX,
                    y - sketchExtents.centerY,
                  ] as CadPoint),
                  height: extrudeDistance,
                  color: '#ef4444',
                }
              }

              return {
                primitive: 'box' as const,
                dimensions: [sketchExtents.width, extrudeDistance, sketchExtents.depth] as [number, number, number],
                color: '#60a5fa',
              }
            })()
          : {
              primitive: 'cylinder',
              radius: Math.max(sketchExtents.width, sketchExtents.depth) / 2,
              height: Math.max(typeof params.angle === 'number' ? Math.abs(params.angle) / 180 : 1.2, 0.5),
              radialSegments: 48,
              color: '#38bdf8',
            }

      const body = CadBodyNodeSchema.parse({
        name: `AI Body ${bodyIds.length + 1}`,
        parentId,
        position: bodyPosition,
        transform: {
          position: bodyPosition,
          rotation: [...sketch.rotation] as [number, number, number],
          scale: [1, 1, 1],
        },
        sourceSketchId: sketch.id,
        sourceSketchIds: [sketch.id],
        // The heart is an in-browser deterministic extrusion. Do not send it
        // to a helper that only understands the basic primitive preview set.
        regenStatus: preview.primitive === 'extruded-profile' ? 'idle' : 'pending',
        regenError: null,
        preview,
        operations: [cadOperation],
        operationHistory: [cadOperation],
        artifacts: {},
        warnings: [],
      })

      useScene.getState().createNode(body, parentId as AnyNodeId)
      bodyIds.push(body.id)
      operationToBodyId.set(operation.id, body.id)
      operationToSketchId.set(operation.id, sketch.id)
      continue
    }

    const targetBodyId = resolveBodyId(operation.dependsOn[0], operationToBodyId)
    if (!targetBodyId) {
      throw new Error(`CAD brief operation "${operation.id}" could not resolve a target body.`)
    }

    const targetBody = useScene.getState().nodes[targetBodyId as AnyNodeId]
    if (targetBody?.type !== 'cad-body') {
      throw new Error(`CAD brief operation "${operation.id}" references a missing CAD body.`)
    }

    const cadOperation =
      operation.op === 'boolean_union' || operation.op === 'boolean_cut' || operation.op === 'boolean_intersect'
        ? (() => {
            const toolBodyId = resolveBodyId(operation.dependsOn[1], operationToBodyId)
            if (!toolBodyId) {
              throw new Error(`CAD brief Boolean operation "${operation.id}" is missing a tool body.`)
            }
            return buildBooleanOperation(toolBodyId, operation.op)
          })()
        : operation.op === 'fillet'
          ? buildFilletOperation(params)
          : buildChamferOperation(params)

    const nextOperations = normalizeCadBodyOperations([...targetBody.operationHistory, cadOperation])
    useScene.getState().updateNode(targetBody.id as AnyNodeId, {
      operations: nextOperations as any,
      operationHistory: nextOperations as any,
      regenStatus: 'pending',
      regenError: null,
      preview: targetBody.preview,
    } as any)

    if (!bodyIds.includes(targetBody.id)) {
      bodyIds.push(targetBody.id)
    }

    operationToBodyId.set(operation.id, targetBody.id)
    if (targetBody.sourceSketchId) {
      operationToSketchId.set(operation.id, targetBody.sourceSketchId)
    }
  }

  return {
    sketchIds,
    bodyIds,
  }
}
