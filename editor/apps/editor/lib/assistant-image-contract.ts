import { z } from 'zod'

export const assistantImageKindValues = [
  'auto',
  'workspace',
  'reference',
  'floorplan',
  'sketch',
] as const

export const assistantImageSourceValues = ['upload', 'paste'] as const

export const AssistantImageKindSchema = z.enum(assistantImageKindValues)
export const AssistantImageSourceSchema = z.enum(assistantImageSourceValues)

export const AssistantImageBoundsSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
})

export const AssistantViewportMetadataSchema = z
  .object({
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    devicePixelRatio: z.number().positive().optional(),
    cameraMode: z.string().min(1).optional(),
    levelMode: z.string().min(1).optional(),
    phase: z.string().min(1).optional(),
    tool: z.string().nullable().optional(),
  })
  .strict()
  .partial()

export const AssistantImageClientAnalysisSchema = z
  .object({
    hasRedMarkup: z.boolean().default(false),
    redMarkupBounds: AssistantImageBoundsSchema.nullable().optional(),
    imageWidth: z.number().int().positive().optional(),
    imageHeight: z.number().int().positive().optional(),
    redPixelCount: z.number().int().nonnegative().optional(),
    viewportMatchScore: z.number().min(0).max(1).optional(),
    workspaceUiScore: z.number().min(0).max(1).optional(),
    annotationKinds: z.array(z.enum(['circle', 'arrow', 'cross', 'highlight', 'region'])).default([]),
  })
  .strict()

export const AssistantImageAttachmentSchema = z
  .object({
    dataUrl: z.string().min(1),
    kind: AssistantImageKindSchema.default('auto'),
    source: AssistantImageSourceSchema,
    filename: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    viewport: AssistantViewportMetadataSchema.optional(),
    analysis: AssistantImageClientAnalysisSchema.optional(),
  })
  .strict()

export type AssistantImageKind = z.infer<typeof AssistantImageKindSchema>
export type AssistantImageSource = z.infer<typeof AssistantImageSourceSchema>
export type AssistantImageBounds = z.infer<typeof AssistantImageBoundsSchema>
export type AssistantViewportMetadata = z.infer<typeof AssistantViewportMetadataSchema>
export type AssistantImageClientAnalysis = z.infer<typeof AssistantImageClientAnalysisSchema>
export type AssistantImageAttachment = z.infer<typeof AssistantImageAttachmentSchema>

export const normalizeAssistantImageAttachment = (
  image: unknown,
): AssistantImageAttachment | null => {
  const parsed = AssistantImageAttachmentSchema.safeParse(image)
  return parsed.success ? parsed.data : null
}

export const createLegacyAssistantImageAttachment = (
  imageDataUrl: string | null | undefined,
  viewport?: AssistantViewportMetadata | null,
): AssistantImageAttachment | null =>
  typeof imageDataUrl === 'string' && imageDataUrl.length > 0
    ? {
        dataUrl: imageDataUrl,
        kind: 'auto',
        source: 'upload',
        ...(viewport ? { viewport } : {}),
      }
    : null
