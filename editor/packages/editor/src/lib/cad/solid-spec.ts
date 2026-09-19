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
      op: 'intersect_profiles'
      profileXY?: [number, number][]
      profileZY?: [number, number][]
      profileXZ?: [number, number][]
      sideProfile?: [number, number][]
      topProfile?: [number, number][]
      depthMargin?: number
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
  | {
      op: 'loft'
      sections: [number, number][][]
      axis?: 'x' | 'y' | 'z'
      heights?: number[]
      span?: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'hull'
      profileXY?: [number, number][]
      profileZY?: [number, number][]
      profileXZ?: [number, number][]
      sideProfile?: [number, number][]
      topProfile?: [number, number][]
      depthMargin?: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'torus'
      R: number
      r: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'capsule'
      r: number
      h: number
      translate?: [number, number, number]
      rotate?: [number, number, number]
      scale?: [number, number, number]
    }
  | {
      op: 'ellipsoid'
      radii: [number, number, number]
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
    z
      .object({
        op: z.literal('intersect_profiles'),
        profileXY: CadPolygonSchema.optional(),
        profileZY: CadPolygonSchema.optional(),
        profileXZ: CadPolygonSchema.optional(),
        sideProfile: CadPolygonSchema.optional(),
        topProfile: CadPolygonSchema.optional(),
        depthMargin: z.number().positive().optional(),
        ...transforms,
      })
      .superRefine((value, ctx) => {
        const xy = value.profileXY ?? value.sideProfile
        const xz = value.profileXZ ?? value.topProfile
        const zy = value.profileZY
        if ([xy, xz, zy].filter(Boolean).length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'intersect_profiles needs at least two of profileXY, profileZY, profileXZ (sideProfile/topProfile stay as aliases)',
          })
        }
      }),
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
    z
      .object({
        op: z.literal('loft'),
        sections: z.array(CadPolygonSchema).min(2).max(16),
        axis: z.enum(['x', 'y', 'z']).default('y'),
        heights: z.array(z.number()).min(2).optional(),
        span: z.number().positive().optional(),
        ...transforms,
      })
      .superRefine((value, ctx) => {
        if (value.heights && value.heights.length !== value.sections.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'loft heights must have one value per section',
            path: ['heights'],
          })
        }
      }),
    z
      .object({
        op: z.literal('hull'),
        profileXY: CadPolygonSchema.optional(),
        profileZY: CadPolygonSchema.optional(),
        profileXZ: CadPolygonSchema.optional(),
        sideProfile: CadPolygonSchema.optional(),
        topProfile: CadPolygonSchema.optional(),
        depthMargin: z.number().positive().optional(),
        ...transforms,
      })
      .superRefine((value, ctx) => {
        const xy = value.profileXY ?? value.sideProfile
        const xz = value.profileXZ ?? value.topProfile
        const zy = value.profileZY
        if (!xy || !xz || !zy) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'hull needs profileXY, profileZY, and profileXZ (sideProfile/topProfile stay as aliases)',
          })
        }
      }),
    z
      .object({
        op: z.literal('torus'),
        R: z.number().positive(),
        r: z.number().positive(),
        ...transforms,
      })
      .superRefine((value, ctx) => {
        if (value.R <= value.r) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'torus major radius R must be greater than minor radius r',
            path: ['R'],
          })
        }
      }),
    z.object({
      op: z.literal('capsule'),
      r: z.number().positive(),
      h: z.number().positive(),
      ...transforms,
    }),
    z.object({
      op: z.literal('ellipsoid'),
      radii: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
      ...transforms,
    }),
  ]),
)