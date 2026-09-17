import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

const SketchPoint = z.tuple([z.number(), z.number()])

const SketchEntityBase = z.object({
  id: z.string(),
})

export const CadSketchLineEntity = SketchEntityBase.extend({
  kind: z.literal('line'),
  start: SketchPoint,
  end: SketchPoint,
})

export const CadSketchRectangleEntity = SketchEntityBase.extend({
  kind: z.literal('rectangle'),
  center: SketchPoint.default([0, 0]),
  width: z.number().positive().default(2),
  height: z.number().positive().default(1.5),
})

export const CadSketchCircleEntity = SketchEntityBase.extend({
  kind: z.literal('circle'),
  center: SketchPoint.default([0, 0]),
  radius: z.number().positive().default(0.75),
})

export const CadSketchArcEntity = SketchEntityBase.extend({
  kind: z.literal('arc'),
  center: SketchPoint.default([0, 0]),
  radius: z.number().positive().default(0.75),
  startAngle: z.number().default(0),
  endAngle: z.number().default(Math.PI / 2),
})

export const CadSketchPolylineEntity = SketchEntityBase.extend({
  kind: z.literal('polyline'),
  points: z.array(SketchPoint).min(2).default([
    [0, 0],
    [1, 0],
  ]),
  closed: z.boolean().default(false),
})

export const CadSketchEntity = z.discriminatedUnion('kind', [
  CadSketchLineEntity,
  CadSketchRectangleEntity,
  CadSketchCircleEntity,
  CadSketchArcEntity,
  CadSketchPolylineEntity,
])

export const CadSketchConstraint = z.object({
  id: z.string(),
  kind: z.enum([
    'coincident',
    'horizontal',
    'vertical',
    'parallel',
    'perpendicular',
    'tangent',
    'equal',
    'dimension',
  ]),
  entityIds: z.array(z.string()).default([]),
  value: z.number().optional(),
})

export const CadSketchDimension = z.object({
  id: z.string(),
  kind: z.enum(['distance', 'radius', 'diameter']),
  entityId: z.string(),
  value: z.number().positive(),
  label: z.string().optional(),
})

export const CadSketchNodeSchema = BaseNode.extend({
  id: objectId('csk'),
  type: nodeType('cad-sketch'),
  plane: z.enum(['XY', 'XZ', 'YZ', 'level', 'face']).default('level'),
  planeAnchorNodeId: z.string().nullable().default(null),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  editStatus: z.enum(['idle', 'editing', 'invalid']).default('idle'),
  entities: z.array(CadSketchEntity).default([]),
  constraints: z.array(CadSketchConstraint).default([]),
  dimensions: z.array(CadSketchDimension).default([]),
  closedProfileEntityIds: z.array(z.string()).default([]),
  lastJobId: z.string().optional(),
}).describe(
  dedent`
  CAD sketch node - parametric 2D profile data for the CAD workspace
  - plane: workplane the sketch lives on
  - entities: 2D lines/arcs/circles/polyline primitives
  - constraints/dimensions: minimal parametric metadata for future regeneration
  `,
)

export const CadSketchNode = CadSketchNodeSchema
export type CadSketchEntity = z.infer<typeof CadSketchEntity>
export type CadSketchNode = z.infer<typeof CadSketchNodeSchema>
