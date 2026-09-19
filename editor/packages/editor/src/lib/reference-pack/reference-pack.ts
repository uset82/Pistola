import { z } from 'zod'

/**
 * The fixed camera labels shared by every reference pack. Their order is intentional:
 * the first six are geometry sources, while the two diagonal views are review sources.
 */
export const referenceViewValues = [
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'left-45',
  'right-45',
] as const

export const orthographicReferenceViewValues = [
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
] as const

export const diagonalReferenceViewValues = ['left-45', 'right-45'] as const
export const referenceSourceValues = ['ide-native', 'user-upload'] as const
export const referenceProjectionValues = ['orthographic', 'perspective'] as const

export type ReferenceView = (typeof referenceViewValues)[number]
export type ReferenceSource = (typeof referenceSourceValues)[number]
export type ReferenceProjection = (typeof referenceProjectionValues)[number]

const supportedAssetRefProtocols = new Set(['asset:', 'http:', 'https:', 'memory:', 'pistola:'])
const orthographicReferenceViewSet = new Set<string>(orthographicReferenceViewValues)

/**
 * Asset data belongs in the asset store, not in task plans, logs, or this contract.
 * A reference may be a service URL or a private application URI, but never an inline
 * payload or a local-file handle.
 */
export const isOpaqueAssetRef = (value: string) => {
  if (value.trim() !== value || value.length === 0) return false

  try {
    const url = new URL(value)
    if (!supportedAssetRefProtocols.has(url.protocol)) return false
    if (url.username || url.password) return false

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.hostname.length > 0
    }

    return url.hostname.length > 0 || url.pathname.replaceAll('/', '').length > 0
  } catch {
    return false
  }
}

export const OpaqueAssetRefSchema = z.string().min(1).refine(isOpaqueAssetRef, {
  message:
    'assetRef must be an opaque non-data URL. Store image bytes separately and pass an asset, pistola, memory, or http(s) URL instead.',
})

export const Sha256Schema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'sha256 must be a 64-character hexadecimal SHA-256 digest.')

export const ReferenceImageDimensionsSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict()

export const ReferenceViewSchema = z.enum(referenceViewValues)
export const ReferenceSourceSchema = z.enum(referenceSourceValues)
export const ReferenceProjectionSchema = z.enum(referenceProjectionValues)

export const ReferenceAssetSchema = z
  .object({
    view: ReferenceViewSchema,
    source: ReferenceSourceSchema,
    assetRef: OpaqueAssetRefSchema,
    sha256: Sha256Schema,
    dimensions: ReferenceImageDimensionsSchema,
    projection: ReferenceProjectionSchema,
  })
  .strict()

export const ApprovedReferenceConceptSchema = z
  .object({
    source: ReferenceSourceSchema,
    assetRef: OpaqueAssetRefSchema,
    sha256: Sha256Schema,
    dimensions: ReferenceImageDimensionsSchema,
    approved: z.boolean().refine((approved) => approved, {
      message: 'concept.approved must be true before a reference pack can be used for modeling.',
    }),
  })
  .strict()

export const ReferenceScaleAnchorSchema = z
  .object({
    label: z.string().trim().min(1, 'scaleAnchor.label must name the known real-world dimension.'),
    meters: z.number().finite().positive('scaleAnchor.meters must be a positive value in meters.'),
  })
  .strict()

const addReferencePackIssue = (
  context: z.RefinementCtx,
  path: ReadonlyArray<string | number>,
  message: string,
) => {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [...path],
    message,
  })
}

/**
 * Version one deliberately keeps the pack independent of scene nodes, renderers, and
 * image-provider SDKs. It can therefore cross IDE/MCP boundaries without carrying bytes.
 */
export const ReferencePackSchema = z
  .object({
    version: z.literal(1).default(1),
    concept: ApprovedReferenceConceptSchema,
    scaleAnchor: ReferenceScaleAnchorSchema,
    assets: z.array(ReferenceAssetSchema),
  })
  .strict()
  .superRefine((pack, context) => {
    if (pack.assets.length !== referenceViewValues.length) {
      addReferencePackIssue(
        context,
        ['assets'],
        `Reference packs require exactly ${referenceViewValues.length} labeled assets; received ${pack.assets.length}.`,
      )
    }

    for (const requiredView of referenceViewValues) {
      const matches = pack.assets
        .map((asset, index) => ({ asset, index }))
        .filter(({ asset }) => asset.view === requiredView)

      if (matches.length === 0) {
        addReferencePackIssue(
          context,
          ['assets'],
          `Missing required reference view "${requiredView}". Add exactly one labeled ${requiredView} asset.`,
        )
      }

      if (matches.length > 1) {
        for (const { index } of matches.slice(1)) {
          addReferencePackIssue(
            context,
            ['assets', index, 'view'],
            `Duplicate reference view "${requiredView}". Keep exactly one asset for each canonical view.`,
          )
        }
      }
    }

    const firstAssetIndexByRef = new Map<string, number>()
    const firstAssetIndexByHash = new Map<string, number>()

    pack.assets.forEach((asset, index) => {
      const firstRefIndex = firstAssetIndexByRef.get(asset.assetRef)
      if (typeof firstRefIndex === 'number') {
        addReferencePackIssue(
          context,
          ['assets', index, 'assetRef'],
          `Asset reference is already used by the ${pack.assets[firstRefIndex]?.view ?? 'earlier'} view. Each labeled view needs its own image asset.`,
        )
      } else {
        firstAssetIndexByRef.set(asset.assetRef, index)
      }

      const normalizedHash = asset.sha256.toLowerCase()
      const firstHashIndex = firstAssetIndexByHash.get(normalizedHash)
      if (typeof firstHashIndex === 'number') {
        addReferencePackIssue(
          context,
          ['assets', index, 'sha256'],
          `Image digest is already used by the ${pack.assets[firstHashIndex]?.view ?? 'earlier'} view. Supply a distinct image for each labeled view.`,
        )
      } else {
        firstAssetIndexByHash.set(normalizedHash, index)
      }

      if (orthographicReferenceViewSet.has(asset.view) && asset.projection !== 'orthographic') {
        addReferencePackIssue(
          context,
          ['assets', index, 'projection'],
          `The ${asset.view} view must use orthographic projection so it can serve as a geometry source.`,
        )
      }
    })
  })

export type ReferenceAsset = z.infer<typeof ReferenceAssetSchema>
export type ApprovedReferenceConcept = z.infer<typeof ApprovedReferenceConceptSchema>
export type ReferenceImageDimensions = z.infer<typeof ReferenceImageDimensionsSchema>
export type ReferenceScaleAnchor = z.infer<typeof ReferenceScaleAnchorSchema>
export type ReferencePack = z.infer<typeof ReferencePackSchema>
export type ReferencePackInput = z.input<typeof ReferencePackSchema>

export type ReferencePackValidationIssueCode =
  | 'approved-concept-required'
  | 'asset-count-invalid'
  | 'duplicate-asset'
  | 'duplicate-view'
  | 'invalid-asset-ref'
  | 'invalid-dimensions'
  | 'invalid-projection'
  | 'invalid-scale-anchor'
  | 'invalid-sha256'
  | 'invalid-view'
  | 'missing-scale-anchor'
  | 'missing-view'
  | 'schema-invalid'

export type ReferencePackValidationIssue = {
  code: ReferencePackValidationIssueCode
  path: string[]
  message: string
  hint: string
}

export type ReferencePackValidationResult =
  | { valid: true; data: ReferencePack; errors: [] }
  | { valid: false; errors: ReferencePackValidationIssue[] }

const issueCodeFor = (
  path: readonly string[],
  message: string,
): ReferencePackValidationIssueCode => {
  if (message.startsWith('Missing required reference view')) return 'missing-view'
  if (message.startsWith('Duplicate reference view')) return 'duplicate-view'
  if (message.startsWith('Reference packs require exactly')) return 'asset-count-invalid'
  if (
    message.startsWith('Asset reference is already used') ||
    message.startsWith('Image digest is already used')
  ) {
    return 'duplicate-asset'
  }
  if (message.includes('must use orthographic projection')) return 'invalid-projection'

  const [root, , field] = path
  if (root === 'concept') return 'approved-concept-required'
  if (root === 'scaleAnchor' && path.length === 1) return 'missing-scale-anchor'
  if (root === 'scaleAnchor') return 'invalid-scale-anchor'
  if (root === 'assets' && field === 'assetRef') return 'invalid-asset-ref'
  if (root === 'assets' && field === 'sha256') return 'invalid-sha256'
  if (root === 'assets' && field === 'dimensions') return 'invalid-dimensions'
  if (root === 'assets' && field === 'projection') return 'invalid-projection'
  if (root === 'assets' && field === 'view') return 'invalid-view'
  return 'schema-invalid'
}

const hintFor = (code: ReferencePackValidationIssueCode): string => {
  switch (code) {
    case 'approved-concept-required':
      return 'Present the concept to the user and set concept.approved to true only after approval.'
    case 'asset-count-invalid':
    case 'missing-view':
    case 'duplicate-view':
      return 'Provide one front, back, left, right, top, bottom, left-45, and right-45 asset.'
    case 'duplicate-asset':
      return 'Use a distinct stored image for every labeled view.'
    case 'invalid-asset-ref':
      return 'Store image bytes outside the pack and replace the value with an opaque non-data URL.'
    case 'invalid-dimensions':
      return 'Set positive integer pixel width and height for the image.'
    case 'invalid-projection':
      return 'Use orthographic projection for front, back, left, right, top, and bottom.'
    case 'invalid-scale-anchor':
    case 'missing-scale-anchor':
      return 'Add a named real-world measurement in positive meters before tracing or fitting.'
    case 'invalid-sha256':
      return 'Calculate and send the 64-character hexadecimal SHA-256 digest of the stored image.'
    case 'invalid-view':
      return 'Use one of the eight canonical view labels defined by referenceViewValues.'
    case 'schema-invalid':
      return 'Correct the field at the reported path and submit the reference pack again.'
  }
}

/**
 * Prefer this at host boundaries instead of exposing raw Zod issues to an IDE agent.
 * It preserves every validation error and supplies an explicit corrective next step.
 */
export const validateReferencePack = (input: unknown): ReferencePackValidationResult => {
  const result = ReferencePackSchema.safeParse(input)
  if (result.success) {
    return { valid: true, data: result.data, errors: [] }
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment))
    const code = issueCodeFor(path, issue.message)
    return {
      code,
      path,
      message: issue.message,
      hint: hintFor(code),
    }
  })

  return { valid: false, errors }
}
