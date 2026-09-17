import type {
  AssistantImageAnnotationHint,
  AssistantImageInterpretation,
  AssistantImageTargetHint,
} from '../../../packages/editor/src/lib/assistant/types'
import type { AssistantPlanRequest } from './assistant-ai-provider'
import type { AssistantImageAttachment } from './assistant-image-contract'

const workspaceCommandPattern =
  /\b(remove|delete|erase|clean|clear|wipe|empty|move|hide|replace|reset|borra|borrar|elimina|eliminar|limpia|limpiar|vaciar|mueve|mover|quita|quitar)\b/
const workspaceDeicticPattern =
  /\b(this|that|these|those|circled|highlighted|marked|area|object|window|wall|walls|roof|slab|ceiling|room|zone|reference|esto|esta|este|esa|ese|esas|esos|area|objeto|ventana|muro|muros|techo|habitacion|zona|referencia)\b/
const floorPlanPattern = /\b(floor ?plan|blueprint|plano|planta|layout|distribution)\b/
const sketchPattern = /\b(sketch|drawing|cad|profile|perfil|croquis|boceto)\b/
const roomReferencePattern = /\b(room|living room|bedroom|kitchen|bathroom|interior|habitacion|sala|cocina|bano)\b/

const assistantImageTargetPatterns: Array<{ pattern: RegExp; text: string; targetTypes: string[] }> = [
  { pattern: /\bwalls?\b|\bmuros?\b/, text: 'wall', targetTypes: ['wall'] },
  { pattern: /\bwindows?\b|\bventanas?\b/, text: 'window', targetTypes: ['window'] },
  { pattern: /\bdoors?\b|\bpuertas?\b/, text: 'door', targetTypes: ['door'] },
  { pattern: /\broof\b|\btecho\b/, text: 'roof', targetTypes: ['roof'] },
  { pattern: /\bslab\b|\blosa\b|\bpiso\b/, text: 'slab', targetTypes: ['slab'] },
  { pattern: /\bceiling\b|\bcielo\b/, text: 'ceiling', targetTypes: ['ceiling'] },
  { pattern: /\broom\b|\bhabitacion\b|\bcuarto\b/, text: 'room', targetTypes: ['zone'] },
  { pattern: /\bzone\b|\bzona\b|\barea\b/, text: 'area', targetTypes: ['zone', 'wall', 'slab', 'ceiling', 'roof', 'item'] },
  { pattern: /\breference\b|\bguia\b/, text: 'reference', targetTypes: ['guide', 'scan'] },
  { pattern: /\bitem\b|\bobject\b|\bobjeto\b/, text: 'object', targetTypes: ['item'] },
]

const detectDirection = (normalizedPrompt: string): AssistantImageAnnotationHint['direction'] => {
  if (/\b(left|izquierda)\b/.test(normalizedPrompt)) return 'left'
  if (/\b(right|derecha)\b/.test(normalizedPrompt)) return 'right'
  if (/\b(up|arriba)\b/.test(normalizedPrompt)) return 'up'
  if (/\b(down|abajo)\b/.test(normalizedPrompt)) return 'down'
  return undefined
}

const normalizePrompt = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

const buildPromptTargetHints = (normalizedPrompt: string): AssistantImageTargetHint[] => {
  const matches: AssistantImageTargetHint[] = []
  for (const entry of assistantImageTargetPatterns) {
    if (!entry.pattern.test(normalizedPrompt)) continue
    matches.push({
      text: entry.text,
      targetTypes: entry.targetTypes,
    })
  }
  return matches
}

const getNormalizedFilename = (image: AssistantImageAttachment) =>
  typeof image.filename === 'string' && image.filename.length > 0 ? normalizePrompt(image.filename) : ''

const getPromptOrFilenameMatch = (pattern: RegExp, normalizedPrompt: string, normalizedFilename: string) =>
  pattern.test(normalizedPrompt) || pattern.test(normalizedFilename)

const classifyImageKind = ({
  context,
  image,
  normalizedPrompt,
}: {
  context: AssistantPlanRequest['context']
  image: AssistantImageAttachment
  normalizedPrompt: string
}): AssistantImageInterpretation['kind'] => {
  if (image.kind !== 'auto') {
    if (image.kind === 'workspace') return 'workspace'
    if (image.kind === 'reference') return roomReferencePattern.test(normalizedPrompt)
      ? 'room-reference'
      : 'reference'
    if (image.kind === 'floorplan') return 'floorplan'
    return 'sketch'
  }

  const sceneSummary = Array.isArray(context?.sceneSummary) ? context.sceneSummary : []
  const normalizedFilename = getNormalizedFilename(image)
  const viewportMatchScore = image.analysis?.viewportMatchScore ?? 0
  const workspaceUiScore = image.analysis?.workspaceUiScore ?? 0
  const hasWorkspaceCues =
    (workspaceUiScore >= 0.5 && viewportMatchScore >= 0.35) ||
    (Boolean(image.analysis?.hasRedMarkup) && (workspaceUiScore >= 0.3 || viewportMatchScore >= 0.45)) ||
    (sceneSummary.length > 0 &&
      workspaceCommandPattern.test(normalizedPrompt) &&
      workspaceDeicticPattern.test(normalizedPrompt))

  if (hasWorkspaceCues) return 'workspace'
  if (getPromptOrFilenameMatch(floorPlanPattern, normalizedPrompt, normalizedFilename)) return 'floorplan'
  if (getPromptOrFilenameMatch(sketchPattern, normalizedPrompt, normalizedFilename)) return 'sketch'
  if (getPromptOrFilenameMatch(roomReferencePattern, normalizedPrompt, normalizedFilename)) return 'room-reference'
  if (getPromptOrFilenameMatch(/\b(reference|moodboard|inspiration|referencia)\b/, normalizedPrompt, normalizedFilename)) {
    return 'reference'
  }
  return 'unknown'
}

export const isWorkspaceImageCommandPrompt = (
  prompt: string,
  image: AssistantImageAttachment | null | undefined,
  context: AssistantPlanRequest['context'],
) => {
  if (!image) return false
  const normalizedPrompt = normalizePrompt(prompt)
  const kind = classifyImageKind({ context, image, normalizedPrompt })
  return kind === 'workspace' && workspaceCommandPattern.test(normalizedPrompt)
}

export const interpretAssistantImage = ({
  prompt,
  image,
  context,
}: {
  prompt: string
  image: AssistantImageAttachment | null
  context: AssistantPlanRequest['context']
}): AssistantImageInterpretation | null => {
  if (!image) return null

  const normalizedPrompt = normalizePrompt(prompt)
  const normalizedFilename = getNormalizedFilename(image)
  const kind = classifyImageKind({ context, image, normalizedPrompt })
  const targetHints = buildPromptTargetHints(normalizedPrompt)
  const annotationHints: AssistantImageAnnotationHint[] = []
  const buildHints: AssistantImageInterpretation['buildHints'] = []
  const ocrText: string[] = []
  const direction = detectDirection(normalizedPrompt)

  for (const kindHint of image.analysis?.annotationKinds ?? []) {
    if (kindHint === 'region') continue
    annotationHints.push({ kind: kindHint })
  }

  if (image.analysis?.redMarkupBounds) {
    annotationHints.push({
      kind: 'region',
      region: image.analysis.redMarkupBounds,
    })
  }

  if (direction) {
    annotationHints.push({
      kind: 'arrow',
      direction,
    })
  }

  const deleteLikeRequest = getPromptOrFilenameMatch(
    /\b(remove|delete|erase|borra|elimina|quita)\b/,
    normalizedPrompt,
    normalizedFilename,
  )
  const moveLikeRequest = getPromptOrFilenameMatch(
    /\b(move|mueve|mover|desplaza)\b/,
    normalizedPrompt,
    normalizedFilename,
  )
  const hideLikeRequest = getPromptOrFilenameMatch(
    /\b(hide|oculta|ocultar)\b/,
    normalizedPrompt,
    normalizedFilename,
  )

  if (deleteLikeRequest) {
    annotationHints.push({
      kind: 'label',
      label: 'remove',
    })
    if (image.analysis?.hasRedMarkup) ocrText.push('REMOVE')
  } else if (moveLikeRequest) {
    annotationHints.push({
      kind: 'label',
      label: 'move',
      ...(direction ? { direction } : {}),
    })
    if (image.analysis?.hasRedMarkup) ocrText.push('MOVE')
  } else if (hideLikeRequest) {
    annotationHints.push({
      kind: 'label',
      label: 'hide',
    })
    if (image.analysis?.hasRedMarkup) ocrText.push('HIDE')
  }

  if (kind === 'floorplan') {
    buildHints.push({
      text: 'Treat the image as an approximate floor plan and prefer editable structural geometry.',
    })
  } else if (kind === 'room-reference') {
    buildHints.push({
      text: 'Treat the image as a furnishing/layout reference and prefer editable catalog proxies.',
    })
  } else if (kind === 'sketch') {
    buildHints.push({
      text: 'Treat the image as a sketch or CAD concept and prefer simple editable approximation.',
    })
  } else if (kind === 'workspace') {
    buildHints.push({
      text: 'Treat the image as the current workspace and resolve targets against existing scene nodes before creating new geometry.',
    })
  } else {
    buildHints.push({
      text: 'The image did not strongly match workspace, floor-plan, room-reference, or sketch cues yet.',
    })
  }

  const confidenceBase =
    kind === 'workspace'
      ? 0.85
      : kind === 'floorplan' || kind === 'sketch' || kind === 'room-reference'
        ? 0.72
        : kind === 'unknown'
          ? 0.45
        : 0.6
  const confidence =
    Math.min(
      0.98,
      confidenceBase +
        (image.analysis?.hasRedMarkup ? 0.08 : 0) +
        (targetHints.length > 0 ? 0.05 : 0) +
        (annotationHints.length > 1 ? 0.03 : 0),
    )

  return {
    kind,
    ocrText,
    annotationHints,
    targetHints,
    buildHints,
    confidence,
  }
}
