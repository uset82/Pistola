import { z } from 'zod'
import { PISTOLA_FRAME } from '../cad/views'

export const blueprintAnchors = ['floor', 'wall', 'none'] as const
export const blueprintRelations = ['touches', 'on_top_of', 'inside', 'centered_on', 'mirror_of', 'gap_ok'] as const
export const blueprintFaces = ['nx', 'px', 'ny', 'py', 'nz', 'pz'] as const
export const blueprintTechniques = [
  'primitive',
  'profile-extrude',
  'silhouette-intersection',
  'revolve',
  'cad-brief',
  'mac',
  'architecture',
] as const

const vec3 = z.tuple([z.number(), z.number(), z.number()])
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const BlueprintPartSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional(),
  technique: z.enum(blueprintTechniques),
  primitive: z.enum(['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'wedge']).optional(),
  dims_m: vec3,
  position_m: vec3,
  rotation_deg: vec3.optional(),
  color: hex.optional(),
  parent: z.string().nullable().optional(),
  mirrorOf: z.string().optional(),
  count: z.number().int().positive().optional(),
})

export const BlueprintRelationSchema = z.object({
  a: z.string().min(1),
  aFace: z.enum(blueprintFaces).optional(),
  rel: z.enum(blueprintRelations),
  b: z.string().min(1),
  bFace: z.enum(blueprintFaces).optional(),
  tol_m: z.number().nonnegative().optional(),
})

export const BlueprintAcceptanceSchema = z.object({
  overallError: z.number().positive().default(0.1),
  partError: z.number().positive().default(0.1),
  ratios: z
    .array(
      z.object({
        id: z.string(),
        of: z.enum(['x', 'y', 'z']),
        to: z.string(),
        axis: z.enum(['x', 'y', 'z']),
        value: z.number().positive(),
      }),
    )
    .default([]),
})

export const BlueprintV2Schema = z.object({
  version: z.literal(2).default(2),
  title: z.string().min(1).optional(),
  slug: z.string().optional(),
  frame: z
    .object({
      up: z.string().default(PISTOLA_FRAME.up),
      front: z.string().default(PISTOLA_FRAME.front),
      right: z.string().default(PISTOLA_FRAME.right),
      units: z.string().default(PISTOLA_FRAME.units),
      origin: z.string().default(PISTOLA_FRAME.origin),
    })
    .default(PISTOLA_FRAME),
  overall_m: vec3,
  anchor: z.enum(blueprintAnchors).default('floor'),
  parts: z.array(BlueprintPartSchema).min(1),
  relations: z.array(BlueprintRelationSchema).default([]),
  acceptance: BlueprintAcceptanceSchema.default({ overallError: 0.1, partError: 0.1, ratios: [] }),
})

export type BlueprintPart = z.infer<typeof BlueprintPartSchema>
export type BlueprintRelation = z.infer<typeof BlueprintRelationSchema>
export type BlueprintV2 = z.infer<typeof BlueprintV2Schema>

const v1ShapeToTechnique = (shape: unknown): BlueprintPart['technique'] => {
  if (typeof shape === 'string' && (blueprintTechniques as readonly string[]).includes(shape)) {
    return shape as BlueprintPart['technique']
  }
  return 'primitive'
}

export const normalizeBlueprint = (input: unknown): BlueprintV2 => {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const partsIn = Array.isArray(raw.parts) ? raw.parts : []
  const overall =
    Array.isArray(raw.overall_m) && raw.overall_m.length === 3
      ? raw.overall_m
      : raw.scale && typeof raw.scale === 'object' && typeof (raw.scale as { value_m?: number }).value_m === 'number'
        ? (() => {
            const axis = (raw.scale as { axis?: string }).axis ?? 'z'
            const value = Number((raw.scale as { value_m: number }).value_m)
            return axis === 'x' ? [value, value, value] : axis === 'y' ? [value, value, value] : [value, value, value]
          })()
        : [1, 1, 1]
  const parts = partsIn.map((part) => {
    const entry = part && typeof part === 'object' ? (part as Record<string, unknown>) : {}
    return {
      id: String(entry.id ?? 'part'),
      name: String(entry.name ?? entry.id ?? 'Part'),
      role: typeof entry.role === 'string' ? entry.role : undefined,
      technique: v1ShapeToTechnique(entry.technique ?? entry.shape),
      primitive: entry.primitive,
      dims_m: entry.dims_m,
      position_m: entry.position_m,
      rotation_deg: entry.rotation_deg,
      color: entry.color,
      parent: entry.parent ?? null,
      mirrorOf: entry.mirrorOf,
      count: entry.count,
    }
  })
  return BlueprintV2Schema.parse({
    version: 2,
    title: raw.title,
    slug: raw.slug,
    frame: raw.frame ?? PISTOLA_FRAME,
    overall_m: overall,
    anchor: raw.anchor ?? 'floor',
    parts,
    relations: raw.relations ?? [],
    acceptance: raw.acceptance && typeof raw.acceptance === 'object' && !Array.isArray(raw.acceptance)
      ? raw.acceptance
      : { overallError: 0.1, partError: 0.1, ratios: [] },
  })
}

export const partBox = (part: BlueprintPart) => {
  const [w, h, d] = part.dims_m
  const [x, y, z] = part.position_m
  return {
    min: [x - w / 2, y, z - d / 2] as [number, number, number],
    max: [x + w / 2, y + h, z + d / 2] as [number, number, number],
    size: [w, h, d] as [number, number, number],
    center: [x, y + h / 2, z] as [number, number, number],
  }
}

export const faceValue = (box: ReturnType<typeof partBox>, face: (typeof blueprintFaces)[number]) => {
  if (face === 'nx') return box.min[0]
  if (face === 'px') return box.max[0]
  if (face === 'ny') return box.min[1]
  if (face === 'py') return box.max[1]
  if (face === 'nz') return box.min[2]
  return box.max[2]
}

export const faceAxis = (face: (typeof blueprintFaces)[number]): 0 | 1 | 2 => {
  if (face === 'nx' || face === 'px') return 0
  if (face === 'ny' || face === 'py') return 1
  return 2
}

export const partsInParentFirstOrder = (parts: BlueprintPart[]) => {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const seen = new Set<string>()
  const ordered: BlueprintPart[] = []
  const visit = (part: BlueprintPart) => {
    if (seen.has(part.id)) return
    seen.add(part.id)
    if (part.parent) {
      const parent = byId.get(part.parent)
      if (parent) visit(parent)
    }
    ordered.push(part)
  }
  for (const part of parts) visit(part)
  return ordered
}
