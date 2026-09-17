import type {
  AssistantImageInterpretation,
  AssistantTargetCandidate,
} from '../../../packages/editor/src/lib/assistant/types'

export type AssistantTargetResolutionContext = Record<string, unknown> | undefined | null

export type AssistantTargetSelection = {
  id: string
  type: string
  name?: string | null
}

export type AssistantTargetResolutionSource =
  | 'selected'
  | 'explicit-id'
  | 'named-target'
  | 'last-created'
  | 'recent-reference'
  | 'image-annotation'
  | 'image-region'

export type AssistantTargetResolutionResult = {
  explicitSelectedTarget: AssistantTargetSelection | null
  recentAssistantTarget: AssistantTargetSelection | null
  target: AssistantTargetSelection | null
  source: AssistantTargetResolutionSource | null
  candidates: AssistantTargetCandidate[]
  explanation: string | null
}

type AssistantSelectionContext = {
  zoneId?: string | null
  selectedIds: string[]
}

type AssistantTargetRecord = Record<string, unknown> & {
  id: string
  type: string
}

type Bounds2d = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const parseAssistantTargetSummary = (value: unknown): AssistantTargetSelection | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.type === 'string'
    ? {
        id: record.id,
        type: record.type,
        name: typeof record.name === 'string' ? record.name : null,
      }
    : null
}

const getAssistantSessionRecord = (context: AssistantTargetResolutionContext) => {
  if (!context || typeof context !== 'object') return null
  const assistantSession = context.assistantSession
  return assistantSession && typeof assistantSession === 'object'
    ? (assistantSession as Record<string, unknown>)
      : null
}

const getAssistantTargetRecordMap = (context: AssistantTargetResolutionContext) => {
  const summaries = [
    ...getAssistantSessionNodeSummaries(context),
    ...(context && Array.isArray(context.selectedNodeSummary) ? context.selectedNodeSummary : []),
    ...(context && Array.isArray(context.sceneSummary) ? context.sceneSummary : []),
  ]

  const deduped = new Map<string, AssistantTargetRecord>()
  for (const value of summaries) {
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.type !== 'string' || deduped.has(record.id)) continue
    deduped.set(record.id, record as AssistantTargetRecord)
  }
  return deduped
}

export const getAssistantSessionNodeSummaries = (context: AssistantTargetResolutionContext) => {
  const record = getAssistantSessionRecord(context)
  if (!record) return []

  const recentReferencedNodes = Array.isArray(record.recentReferencedNodes)
    ? record.recentReferencedNodes
    : []
  const lastCreatedNodes = Array.isArray(record.lastCreatedNodes) ? record.lastCreatedNodes : []

  return [...recentReferencedNodes, ...lastCreatedNodes]
}

export const getAssistantTargetSummaries = (
  context: AssistantTargetResolutionContext,
): AssistantTargetSelection[] => {
  const summaries = [
    ...getAssistantSessionNodeSummaries(context),
    ...(context && Array.isArray(context.selectedNodeSummary) ? context.selectedNodeSummary : []),
    ...(context && Array.isArray(context.sceneSummary) ? context.sceneSummary : []),
  ]

  const deduped = new Map<string, AssistantTargetSelection>()
  for (const value of summaries) {
    const parsed = parseAssistantTargetSummary(value)
    if (!parsed || deduped.has(parsed.id)) continue
    deduped.set(parsed.id, parsed)
  }
  return Array.from(deduped.values())
}

export const findAssistantTargetById = (
  context: AssistantTargetResolutionContext,
  nodeId: string,
) => getAssistantTargetSummaries(context).find((item) => item.id === nodeId) ?? null

const isContainerTarget = (target: AssistantTargetSelection) =>
  target.type === 'site' || target.type === 'building' || target.type === 'level'

export const getSingleSelectedAssistantTarget = (
  context: AssistantTargetResolutionContext,
  selection: AssistantSelectionContext,
): AssistantTargetSelection | null => {
  if (selection.selectedIds.length === 1) {
    return findAssistantTargetById(context, selection.selectedIds[0] ?? '')
  }

  if (selection.selectedIds.length === 0 && selection.zoneId) {
    return findAssistantTargetById(context, selection.zoneId)
  }

  return null
}

const getSingleRecentAssistantTarget = (
  context: AssistantTargetResolutionContext,
): { source: Extract<AssistantTargetResolutionSource, 'last-created' | 'recent-reference'> | null; target: AssistantTargetSelection | null } => {
  const record = getAssistantSessionRecord(context)
  const lastCreatedTargets = (Array.isArray(record?.lastCreatedNodes) ? record.lastCreatedNodes : [])
    .map(parseAssistantTargetSummary)
    .filter((item): item is AssistantTargetSelection => Boolean(item))

  if (lastCreatedTargets.length === 1) {
    return {
      source: 'last-created',
      target: lastCreatedTargets[0] ?? null,
    }
  }

  const recentTargets = (Array.isArray(record?.recentReferencedNodes) ? record.recentReferencedNodes : [])
    .map(parseAssistantTargetSummary)
    .filter((item): item is AssistantTargetSelection => Boolean(item))

  return recentTargets.length === 1
    ? {
        source: 'recent-reference',
        target: recentTargets[0] ?? null,
      }
    : {
        source: null,
        target: null,
      }
}

const findExplicitPromptTargetById = (
  context: AssistantTargetResolutionContext,
  normalizedPrompt: string,
) => {
  const searchablePrompt = normalizeSearchValue(normalizedPrompt)
  const matches = getAssistantTargetSummaries(context)
    .map((target) => ({
      target,
      normalizedId: normalizeSearchValue(target.id),
    }))
    .filter(({ normalizedId }) => {
      if (!normalizedId) return false
      return searchablePrompt.includes(normalizedId) && (normalizedId.length >= 4 || /\d/.test(normalizedId))
    })
    .sort((left, right) => right.normalizedId.length - left.normalizedId.length)

  const best = matches[0]
  const second = matches[1]
  if (!best) return null
  if (second && second.normalizedId.length === best.normalizedId.length && second.target.id !== best.target.id) {
    return null
  }
  return best.target
}

const scorePromptTargetMatch = (
  target: AssistantTargetSelection,
  normalizedPrompt: string,
) => {
  const terms = [target.name, target.id]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normalizeSearchValue)
    .filter((value) => value.length >= 3)

  let bestScore = -1
  for (const term of terms) {
    if (normalizedPrompt.includes(term)) {
      bestScore = Math.max(bestScore, term.length + (target.name ? 20 : 0))
      continue
    }

    const tokens = term.split(' ').filter((token) => token.length >= 3)
    if (tokens.length > 0 && tokens.every((token) => normalizedPrompt.includes(token))) {
      bestScore = Math.max(bestScore, tokens.length * 8 + term.length)
    }
  }

  return bestScore
}

const findNamedTargetByPrompt = (
  context: AssistantTargetResolutionContext,
  normalizedPrompt: string,
) => {
  const searchablePrompt = normalizeSearchValue(normalizedPrompt)
  const matches = getAssistantTargetSummaries(context)
    .map((target) => ({
      target,
      score: scorePromptTargetMatch(target, searchablePrompt),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)

  const best = matches[0]
  const second = matches[1]
  if (!best) return null
  if (second && second.score === best.score && second.target.id !== best.target.id) return null
  return best.target
}

const isPluralImagePrompt = (normalizedPrompt: string) =>
  /\b(walls|windows|doors|rooms|objects|targets|muros|ventanas|puertas|habitaciones|objetos|todos|todas)\b/.test(
    normalizedPrompt,
  )

const getContextLevelId = (context: AssistantTargetResolutionContext) => {
  if (!context || typeof context !== 'object') return null
  const selection = context.selection
  if (selection && typeof selection === 'object' && typeof (selection as Record<string, unknown>).levelId === 'string') {
    return (selection as Record<string, unknown>).levelId as string
  }
  const levelSummary = context.levelSummary
  return levelSummary && typeof levelSummary === 'object' && typeof (levelSummary as Record<string, unknown>).id === 'string'
    ? ((levelSummary as Record<string, unknown>).id as string)
    : null
}

const getPoint2 = (value: unknown): [number, number] | null =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number'
    ? [value[0], value[1]]
    : null

const getPoint3 = (value: unknown): [number, number, number] | null =>
  Array.isArray(value) &&
  value.length >= 3 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number' &&
  typeof value[2] === 'number'
    ? [value[0], value[1], value[2]]
    : null

const getPolygonPoints = (value: unknown): Array<[number, number]> | null => {
  if (Array.isArray(value)) {
    const points = value.map(getPoint2).filter((point): point is [number, number] => Boolean(point))
    return points.length > 0 ? points : null
  }

  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).points)) {
    const points = ((value as Record<string, unknown>).points as unknown[])
      .map(getPoint2)
      .filter((point): point is [number, number] => Boolean(point))
    return points.length > 0 ? points : null
  }

  return null
}

const getBoundsFromPoints = (points: Array<[number, number]>): Bounds2d | null => {
  if (points.length === 0) return null
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

const getTargetBounds = (record: AssistantTargetRecord): Bounds2d | null => {
  const polygon = getPolygonPoints(record.polygon)
  if (polygon) return getBoundsFromPoints(polygon)

  const start = getPoint2(record.start)
  const end = getPoint2(record.end)
  if (start && end) return getBoundsFromPoints([start, end])

  const position3 = getPoint3(record.position)
  if (position3) {
    return {
      minX: position3[0],
      minY: position3[2],
      maxX: position3[0],
      maxY: position3[2],
    }
  }

  const position2 = getPoint2(record.position)
  if (position2) return getBoundsFromPoints([position2])

  return null
}

const expandFlatBounds = (bounds: Bounds2d): Bounds2d => {
  const minSize = 0.2
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  if (width >= minSize && height >= minSize) return bounds

  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return {
    minX: cx - Math.max(width, minSize) / 2,
    maxX: cx + Math.max(width, minSize) / 2,
    minY: cy - Math.max(height, minSize) / 2,
    maxY: cy + Math.max(height, minSize) / 2,
  }
}

const getSceneBounds = (records: AssistantTargetRecord[]) => {
  const bounds = records
    .map(getTargetBounds)
    .filter((item): item is Bounds2d => Boolean(item))
    .map(expandFlatBounds)

  if (bounds.length === 0) return null

  const [firstBounds, ...restBounds] = bounds
  if (!firstBounds) return null

  return restBounds.reduce<Bounds2d>(
    (acc, next) => ({
      minX: Math.min(acc.minX, next.minX),
      minY: Math.min(acc.minY, next.minY),
      maxX: Math.max(acc.maxX, next.maxX),
      maxY: Math.max(acc.maxY, next.maxY),
    }),
    firstBounds,
  )
}

const normalizeBounds = (bounds: Bounds2d, sceneBounds: Bounds2d) => {
  const sceneWidth = Math.max(0.0001, sceneBounds.maxX - sceneBounds.minX)
  const sceneHeight = Math.max(0.0001, sceneBounds.maxY - sceneBounds.minY)
  return {
    x: (bounds.minX - sceneBounds.minX) / sceneWidth,
    y: (bounds.minY - sceneBounds.minY) / sceneHeight,
    width: Math.max(0.03, (bounds.maxX - bounds.minX) / sceneWidth),
    height: Math.max(0.03, (bounds.maxY - bounds.minY) / sceneHeight),
  }
}

const getRegionOverlapScore = (
  region: NonNullable<AssistantImageInterpretation['annotationHints'][number]['region']>,
  candidateBounds: ReturnType<typeof normalizeBounds>,
) => {
  const regionRight = region.x + region.width
  const regionBottom = region.y + region.height
  const candidateRight = candidateBounds.x + candidateBounds.width
  const candidateBottom = candidateBounds.y + candidateBounds.height

  const overlapWidth = Math.max(0, Math.min(regionRight, candidateRight) - Math.max(region.x, candidateBounds.x))
  const overlapHeight = Math.max(0, Math.min(regionBottom, candidateBottom) - Math.max(region.y, candidateBounds.y))
  const overlapArea = overlapWidth * overlapHeight
  const unionArea =
    region.width * region.height +
    candidateBounds.width * candidateBounds.height -
    overlapArea
  const iou = unionArea > 0 ? overlapArea / unionArea : 0

  const regionCx = region.x + region.width / 2
  const regionCy = region.y + region.height / 2
  const candidateCx = candidateBounds.x + candidateBounds.width / 2
  const candidateCy = candidateBounds.y + candidateBounds.height / 2
  const centerDistance = Math.hypot(regionCx - candidateCx, regionCy - candidateCy)
  const centerScore = Math.max(0, 1 - centerDistance / 0.9)

  return Math.max(iou, centerScore * 0.75)
}

const getImageCandidateSource = (
  imageInterpretation: AssistantImageInterpretation,
): Extract<AssistantTargetResolutionSource, 'image-annotation' | 'image-region'> =>
  imageInterpretation.annotationHints.some((hint) => hint.kind === 'label' || hint.kind === 'arrow')
    ? 'image-annotation'
    : 'image-region'

const getImageTargetCandidates = ({
  context,
  imageInterpretation,
  normalizedPrompt,
}: {
  context: AssistantTargetResolutionContext
  imageInterpretation: AssistantImageInterpretation
  normalizedPrompt: string
}) => {
  const allTargets = getAssistantTargetSummaries(context).filter((target) => !isContainerTarget(target))
  if (allTargets.length === 0) {
    return {
      source: getImageCandidateSource(imageInterpretation),
      candidates: [] as AssistantTargetCandidate[],
      target: null as AssistantTargetSelection | null,
      explanation: 'The uploaded image looked actionable, but there were no visible scene targets to ground it against.',
    }
  }

  const hintedTypes = Array.from(
    new Set(imageInterpretation.targetHints.flatMap((hint) => hint.targetTypes)),
  )
  const promptTerms = new Set(
    imageInterpretation.targetHints.map((hint) => normalizeSearchValue(hint.text)).filter(Boolean),
  )
  const targetRecordMap = getAssistantTargetRecordMap(context)
  const currentLevelId = getContextLevelId(context)
  const recentIds = new Set(
    getAssistantSessionNodeSummaries(context)
      .map(parseAssistantTargetSummary)
      .filter((item): item is AssistantTargetSelection => Boolean(item))
      .map((item) => item.id),
  )
  const source = getImageCandidateSource(imageInterpretation)
  const regionHint = imageInterpretation.annotationHints.find((hint) => hint.region)?.region
  const filteredTargets =
    hintedTypes.length > 0
      ? allTargets.filter((target) => hintedTypes.includes(target.type))
      : allTargets
  const candidateSceneBounds = getSceneBounds(
    filteredTargets
      .map((target) => targetRecordMap.get(target.id))
      .filter((record): record is AssistantTargetRecord => Boolean(record)),
  )

  const scored = filteredTargets
    .map((target) => {
      const normalizedName = normalizeSearchValue(target.name ?? '')
      const targetRecord = targetRecordMap.get(target.id)
      let score = imageInterpretation.confidence * 0.4

      if (hintedTypes.includes(target.type)) score += 0.4
      if (promptTerms.size > 0 && [...promptTerms].some((term) => normalizedName.includes(term))) score += 0.18
      if (normalizeSearchValue(normalizedPrompt).includes(normalizeSearchValue(target.id))) score += 0.12
      if (recentIds.has(target.id)) score += 0.1
      if (target.type === 'zone' && /\b(area|room|zone|habitacion|zona)\b/.test(normalizedPrompt)) score += 0.08
      if (currentLevelId && targetRecord?.parentId === currentLevelId) score += 0.08
      if (regionHint && targetRecord && candidateSceneBounds) {
        const targetBounds = getTargetBounds(targetRecord)
        if (targetBounds) {
          const regionScore = getRegionOverlapScore(regionHint, normalizeBounds(expandFlatBounds(targetBounds), candidateSceneBounds))
          score += regionScore * 0.22
        }
      }

      return {
        id: target.id,
        type: target.type,
        name: target.name ?? null,
        source,
        confidence: Math.min(0.98, Number(score.toFixed(2))),
      } satisfies AssistantTargetCandidate
    })
    .sort((left, right) => right.confidence - left.confidence)

  if (scored.length === 0) {
    return {
      source,
      candidates: [] as AssistantTargetCandidate[],
      target: null as AssistantTargetSelection | null,
      explanation:
        imageInterpretation.kind === 'workspace'
          ? 'The uploaded screenshot appeared to be the current workspace, but I could not map the highlighted region to a concrete scene target.'
          : 'The uploaded image did not expose a confident scene target for this command.',
    }
  }

  if (isPluralImagePrompt(normalizedPrompt) && scored.length > 1) {
    return {
      source,
      candidates: scored.slice(0, 8),
      target: null as AssistantTargetSelection | null,
      explanation: `Using the uploaded screenshot as workspace context. I found ${Math.min(scored.length, 8)} plausible highlighted targets.`,
    }
  }

  const best = scored[0]
  const second = scored[1]
  const confidentSingleTarget =
    best &&
    ((best.confidence >= 0.62 &&
      (!second || best.confidence - second.confidence >= 0.12)) ||
      (scored.length === 1 && imageInterpretation.confidence >= 0.75))

  if (confidentSingleTarget && best) {
    return {
      source,
      candidates: [best],
      target: {
        id: best.id,
        type: best.type,
        name: best.name ?? null,
      },
      explanation:
        source === 'image-annotation'
          ? `Using "${best.name ?? best.id}" from the annotated screenshot target.`
          : `Using "${best.name ?? best.id}" from the highlighted screenshot region.`,
    }
  }

  return {
    source,
    candidates: scored.slice(0, 5),
    target: null as AssistantTargetSelection | null,
    explanation: `Using the uploaded screenshot as workspace context. I found ${Math.min(scored.length, 5)} plausible targets but none was confident enough to execute blindly.`,
  }
}

export const resolveAssistantPromptTarget = ({
  allowRecentAssistantFallback = false,
  context,
  imageInterpretation,
  normalizedPrompt,
  selection,
}: {
  allowRecentAssistantFallback?: boolean
  context: AssistantTargetResolutionContext
  imageInterpretation?: AssistantImageInterpretation | null
  normalizedPrompt: string
  selection: AssistantSelectionContext
}): AssistantTargetResolutionResult => {
  const explicitSelectedTarget = getSingleSelectedAssistantTarget(context, selection)
  const explicitPromptTarget = findExplicitPromptTargetById(context, normalizedPrompt)
  const namedPromptTarget =
    explicitPromptTarget == null ? findNamedTargetByPrompt(context, normalizedPrompt) : null
  const recentAssistantTargetCandidate = allowRecentAssistantFallback
    ? getSingleRecentAssistantTarget(context)
    : { source: null, target: null }
  const imageTargetCandidate =
    imageInterpretation != null
      ? getImageTargetCandidates({
          context,
          imageInterpretation,
          normalizedPrompt,
        })
      : {
          source: null,
          candidates: [] as AssistantTargetCandidate[],
          target: null as AssistantTargetSelection | null,
          explanation: null,
        }

  const target =
    explicitSelectedTarget ??
    explicitPromptTarget ??
    namedPromptTarget ??
    recentAssistantTargetCandidate.target ??
    imageTargetCandidate.target

  const source: AssistantTargetResolutionSource | null =
    target == null
      ? null
      : target.id === explicitSelectedTarget?.id
        ? 'selected'
        : target.id === explicitPromptTarget?.id
          ? 'explicit-id'
          : target.id === namedPromptTarget?.id
            ? 'named-target'
            : target.id === recentAssistantTargetCandidate.target?.id
              ? recentAssistantTargetCandidate.source
              : target.id === imageTargetCandidate.target?.id
                ? (imageTargetCandidate.source as AssistantTargetResolutionSource | null)
                : null

  return {
    explicitSelectedTarget,
    recentAssistantTarget: recentAssistantTargetCandidate.target,
    target,
    source,
    candidates: imageTargetCandidate.candidates,
    explanation:
      imageTargetCandidate.explanation ??
      (source != null && target != null ? `Using "${target.name ?? target.id}" as the resolved target.` : null),
  }
}
