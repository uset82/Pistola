import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const CadBodyPreview = z.discriminatedUnion('primitive', [
  z.object({
    primitive: z.literal('box'),
    dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
    color: z.string().default('#60a5fa'),
  }),
  z.object({
    primitive: z.literal('cylinder'),
    radius: z.number().positive(),
    height: z.number().positive(),
    radialSegments: z.number().int().positive().default(32),
    color: z.string().default('#60a5fa'),
  }),
])

const CadOperationBase = z.object({
  id: z.string().default('cad-op'),
  suppressed: z.boolean().default(false),
})

const CadBooleanOperationMode = z.enum(['union', 'cut', 'intersect'])

const cadBooleanKindByOperation = {
  union: 'boolean_union',
  cut: 'boolean_cut',
  intersect: 'boolean_intersect',
} as const

export const CadExtrudeOperation = CadOperationBase.extend({
  type: z.literal('extrude').default('extrude'),
  kind: z.literal('extrude'),
  params: z
    .object({
      distance: z.number().positive().default(1.2),
      direction: z.tuple([z.number(), z.number(), z.number()]).default([0, 1, 0]),
      symmetric: z.boolean().default(false),
    })
    .default({
      distance: 1.2,
      direction: [0, 1, 0],
      symmetric: false,
    }),
  sketchId: z.string(),
  depth: z.number().positive(),
  distance: z.number().positive().default(1.2),
  direction: z.tuple([z.number(), z.number(), z.number()]).default([0, 1, 0]),
  symmetric: z.boolean().default(false),
})

export const CadRevolveOperation = CadOperationBase.extend({
  type: z.literal('revolve').default('revolve'),
  kind: z.literal('revolve'),
  params: z
    .object({
      axis: z.enum(['X', 'Y', 'Z', 'custom']).default('Z'),
      angle: z.number().positive().default(360),
      customAxis: z.tuple([z.number(), z.number(), z.number()]).optional(),
    })
    .default({
      axis: 'Z',
      angle: 360,
    }),
  sketchId: z.string(),
  axis: z.enum(['X', 'Y', 'Z', 'custom']).default('Z'),
  angle: z.number().positive().default(360),
  customAxis: z.tuple([z.number(), z.number(), z.number()]).optional(),
})

const CadBooleanOperationBase = CadOperationBase.extend({
  params: z
    .object({
      toolBodyIds: z.array(z.string()).default([]),
    })
    .default({ toolBodyIds: [] }),
  toolBodyIds: z.array(z.string()).default([]),
})

export const CadBooleanUnionOperation = CadBooleanOperationBase.extend({
  type: z.literal('boolean_union').default('boolean_union'),
  kind: z.literal('boolean_union'),
  operation: z.literal('union').default('union'),
})

export const CadBooleanCutOperation = CadBooleanOperationBase.extend({
  type: z.literal('boolean_cut').default('boolean_cut'),
  kind: z.literal('boolean_cut'),
  operation: z.literal('cut').default('cut'),
})

export const CadBooleanIntersectOperation = CadBooleanOperationBase.extend({
  type: z.literal('boolean_intersect').default('boolean_intersect'),
  kind: z.literal('boolean_intersect'),
  operation: z.literal('intersect').default('intersect'),
})

const CadLegacyBooleanOperation = CadOperationBase.extend({
  type: z.literal('boolean').default('boolean'),
  kind: z.literal('boolean'),
  params: z
    .object({
      operation: CadBooleanOperationMode.default('union'),
      toolBodyIds: z.array(z.string()).default([]),
    })
    .default({ operation: 'union', toolBodyIds: [] }),
  operation: CadBooleanOperationMode.default('union'),
  toolBodyIds: z.array(z.string()).default([]),
})

export const CadFilletOperation = CadOperationBase.extend({
  type: z.literal('fillet').default('fillet'),
  kind: z.literal('fillet'),
  params: z
    .object({
      edgeRefs: z.array(z.string()).default([]),
      radius: z.number().positive().default(0.05),
    })
    .default({ edgeRefs: [], radius: 0.05 }),
  edgeRefs: z.array(z.string()).default([]),
  radius: z.number().positive().default(0.05),
})

export const CadChamferOperation = CadOperationBase.extend({
  type: z.literal('chamfer').default('chamfer'),
  kind: z.literal('chamfer'),
  params: z
    .object({
      edgeRefs: z.array(z.string()).default([]),
      distance: z.number().positive().default(0.05),
    })
    .default({ edgeRefs: [], distance: 0.05 }),
  edgeRefs: z.array(z.string()).default([]),
  distance: z.number().positive().default(0.05),
})

export const CadBodyOperation = z.union([
  CadExtrudeOperation,
  CadRevolveOperation,
  CadBooleanUnionOperation,
  CadBooleanCutOperation,
  CadBooleanIntersectOperation,
  CadLegacyBooleanOperation,
  CadFilletOperation,
  CadChamferOperation,
])

export const getCadBooleanOperationKind = (operation: z.infer<typeof CadBooleanOperationMode>) =>
  cadBooleanKindByOperation[operation]

export const normalizeCadBodyOperation = (
  operation: z.infer<typeof CadBodyOperation>,
): z.infer<typeof CadBodyOperation> => {
  if (operation.kind !== 'boolean') return operation

  const legacyOperation = operation as z.infer<typeof CadLegacyBooleanOperation>
  const nextOperation = legacyOperation.operation ?? legacyOperation.params.operation ?? 'union'
  const nextToolBodyIds =
    legacyOperation.toolBodyIds.length > 0
      ? legacyOperation.toolBodyIds
      : legacyOperation.params.toolBodyIds

  if (nextOperation === 'cut') {
    const normalized: Extract<z.infer<typeof CadBodyOperation>, { kind: 'boolean_cut' }> = {
      id: legacyOperation.id,
      suppressed: legacyOperation.suppressed,
      type: 'boolean_cut',
      kind: 'boolean_cut',
      params: {
        toolBodyIds: nextToolBodyIds,
      },
      operation: 'cut',
      toolBodyIds: nextToolBodyIds,
    }
    return normalized
  }

  if (nextOperation === 'intersect') {
    const normalized: Extract<z.infer<typeof CadBodyOperation>, { kind: 'boolean_intersect' }> = {
      id: legacyOperation.id,
      suppressed: legacyOperation.suppressed,
      type: 'boolean_intersect',
      kind: 'boolean_intersect',
      params: {
        toolBodyIds: nextToolBodyIds,
      },
      operation: 'intersect',
      toolBodyIds: nextToolBodyIds,
    }
    return normalized
  }

  const normalized: Extract<z.infer<typeof CadBodyOperation>, { kind: 'boolean_union' }> = {
    id: legacyOperation.id,
    suppressed: legacyOperation.suppressed,
    type: 'boolean_union',
    kind: 'boolean_union',
    params: {
      toolBodyIds: nextToolBodyIds,
    },
    operation: 'union',
    toolBodyIds: nextToolBodyIds,
  }
  return normalized
}

export const normalizeCadBodyOperations = (
  operations: z.infer<typeof CadBodyOperation>[],
): z.infer<typeof CadBodyOperation>[] =>
  operations.map((operation) => normalizeCadBodyOperation(operation))

export const CadBodyArtifacts = z.object({
  previewUrl: z.string().nullable().optional(),
  cadUrl: z.string().nullable().optional(),
  exportUrl: z.string().nullable().optional(),
  previewArtifactRef: z.string().nullable().optional(),
  cadArtifactRef: z.string().nullable().optional(),
  helperJobId: z.string().nullable().optional(),
})

export const CadBodyNodeSchema = BaseNode.extend({
  id: objectId('cbody'),
  type: nodeType('cad-body'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  transform: z
    .object({
      position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
      rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
      scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
    })
    .default({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }),
  sourceSketchId: z.string().nullable().default(null),
  sourceSketchIds: z.array(z.string()).default([]),
  regenStatus: z.enum(['idle', 'pending', 'building', 'queued', 'running', 'error']).default('idle'),
  regenError: z.string().nullable().default(null),
  operations: z.array(CadBodyOperation).default([]),
  operationHistory: z.array(CadBodyOperation).default([]),
  preview: CadBodyPreview.default({
    primitive: 'box',
    dimensions: [2, 1.2, 1.5],
    color: '#60a5fa',
  }),
  artifacts: CadBodyArtifacts.default({}),
  previewArtifactRef: z.string().nullable().default(null),
  cadArtifactRef: z.string().nullable().default(null),
  warnings: z.array(z.string()).default([]),
}).describe(
  dedent`
  CAD body node - parametric solid preview backed by an external CAD helper
  - preview: deterministic viewport geometry for the Pascal viewer
  - operations: ordered history used by the helper for regeneration
  - artifacts: helper-produced asset references for precise CAD data and export
  `,
)

export const CadBodyNode = CadBodyNodeSchema
export type CadBodyOperation = z.infer<typeof CadBodyOperation>
export type CadBodyNode = z.infer<typeof CadBodyNodeSchema>
