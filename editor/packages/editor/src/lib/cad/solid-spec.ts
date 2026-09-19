import { z } from 'zod'

export const CadVec3Schema = z.tuple([z.number(), z.number(), z.number()])
export const CadPolygonSchema = z.array(z.tuple([z.number(), z.number()])).min(3)

const transforms = {
  translate: CadVec3Schema.optional(),
  rotate: CadVec3Schema.optional(),
  scale: CadVec3Schema.optional(),
}

export type CadSolidSpec =
  | {
      op: 'box'
      size: [number, number, number]
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'cylinder'
      r: number
      h: number
      r2?: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'sphere'
      r: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'extrude'
      polygon: [number, number][]
      holes?: [number, number][][]
      height: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'revolve'
      profile: [number, number][]
      angle?: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'union'
      children: CadSolidSpec[]
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'difference'
      children: CadSolidSpec[]
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'intersection'
      children: CadSolidSpec[]
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'mirror'
      axis?: 'x' | 'y' | 'z'
      child: CadSolidSpec
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'linearArray'
      count: number
      offset: [number, number, number]
      child: CadSolidSpec
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'polarArray'
      count: number
      axis?: 'x' | 'y' | 'z'
      child: CadSolidSpec
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }

export const CadSolidSpecSchema: z.ZodType<CadSolidSpec> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('box'), size: CadVec3Schema, ...transforms }),
    z.object({
      op: z.literal('cylinder'),
      r: z.number().positive(),
      h: z.number().positive(),
      r2: z.number().positive().optional(),
      ...transforms,
    }),
    z.object({ op: z.literal('sphere'), r: z.number().positive(), ...transforms }),
    z.object({
      op: z.literal('extrude'),
      polygon: CadPolygonSchema,
      holes: z.array(CadPolygonSchema).optional(),
      height: z.number().positive(),
      ...transforms,
    }),
    z.object({
      op: z.literal('revolve'),
      profile: CadPolygonSchema,
      angle: z.number().positive().max(360).optional(),
      ...transforms,
    }),
    z.object({ op: z.literal('union'), children: z.array(CadSolidSpecSchema).min(1), ...transforms }),
    z.object({ op: z.literal('difference'), children: z.array(CadSolidSpecSchema).min(2), ...transforms }),
    z.object({ op: z.literal('intersection'), children: z.array(CadSolidSpecSchema).min(2), ...transforms }),
    z.object({
      op: z.literal('mirror'),
      axis: z.enum(['x', 'y', 'z']).default('x'),
      child: CadSolidSpecSchema,
      ...transforms,
    }),
    z.object({
      op: z.literal('linearArray'),
      count: z.number().int().min(2).max(32),
      offset: CadVec3Schema,
      child: CadSolidSpecSchema,
      ...transforms,
    }),
    z.object({
      op: z.literal('polarArray'),
      count: z.number().int().min(2).max(32),
      axis: z.enum(['x', 'y', 'z']).default('y'),
      child: CadSolidSpecSchema,
      ...transforms,
    }),
  ]),
)