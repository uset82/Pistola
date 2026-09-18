import { z } from 'zod'

const CadPlanPoint = z.tuple([z.number(), z.number()])
const CadPlanRecord = z.record(z.string(), z.unknown())

export const CadEntitySpecSchema = z.object({
  type: z.enum([
    'line',
    'rectangle',
    'circle',
    'arc',
    'polyline',
    'heart',
    'board',
    'airfoil',
    'ellipse',
    'bspline',
  ]),
  points: z.array(CadPlanPoint).default([]),
  params: CadPlanRecord.default({}),
})

export const SketchPlanSchema = z.object({
  plane: z.enum(['XY', 'XZ', 'YZ', 'level', 'face']).default('XY'),
  entities: z.array(CadEntitySpecSchema).default([]),
  dimensions: z.array(CadPlanRecord).default([]),
  constraints: z.array(CadPlanRecord).default([]),
})

export const OperationNodeSchema = z.object({
  id: z.string().min(1),
  op: z.enum([
    'extrude',
    'revolve',
    'boolean_union',
    'boolean_cut',
    'boolean_intersect',
    'fillet',
    'chamfer',
  ]),
  params: CadPlanRecord.default({}),
  dependsOn: z.array(z.string()).default([]),
})

export const CadBriefSchema = z.object({
  intent: z.string().min(1),
  sketchPlans: z.array(SketchPlanSchema).default([]),
  operationGraph: z.array(OperationNodeSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
})

export type CadEntitySpec = z.infer<typeof CadEntitySpecSchema>
export type SketchPlan = z.infer<typeof SketchPlanSchema>
export type OperationNode = z.infer<typeof OperationNodeSchema>
export type CadBrief = z.infer<typeof CadBriefSchema>
