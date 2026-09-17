type ContextRecord = Record<string, unknown>

const MAX_ASSISTANT_SELECTED_SUMMARIES = 4
const MAX_ASSISTANT_SCENE_SUMMARIES = 12
const MAX_ASSISTANT_CATALOG_ITEMS = 24
const MAX_CAD_NODE_SUMMARIES = 24

const isRecord = (value: unknown): value is ContextRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeSearchValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenizePrompt = (prompt: string) =>
  Array.from(
    new Set(
      normalizeSearchValue(prompt)
        .split(' ')
        .filter((token) => token.length >= 3),
    ),
  )

const compactAssistantNodeSummary = (value: unknown) => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return null

  switch (value.type) {
    case 'site':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        pointCount: Array.isArray((value.polygon as ContextRecord | undefined)?.points)
          ? ((value.polygon as ContextRecord).points as unknown[]).length
          : Array.isArray(value.polygon)
            ? value.polygon.length
            : 0,
      }
    case 'building':
    case 'level':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        level: typeof value.level === 'number' ? value.level : undefined,
        childCount: Array.isArray(value.childIds) ? value.childIds.length : undefined,
      }
    case 'zone':
    case 'slab':
    case 'ceiling':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        pointCount: Array.isArray(value.polygon) ? value.polygon.length : 0,
        holeCount: Array.isArray(value.holes) ? value.holes.length : undefined,
        color: typeof value.color === 'string' ? value.color : undefined,
        elevation: typeof value.elevation === 'number' ? value.elevation : undefined,
        height: typeof value.height === 'number' ? value.height : undefined,
      }
    case 'wall':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        start: Array.isArray(value.start) ? value.start : undefined,
        end: Array.isArray(value.end) ? value.end : undefined,
        height: typeof value.height === 'number' ? value.height : undefined,
        thickness: typeof value.thickness === 'number' ? value.thickness : undefined,
      }
    case 'roof':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        position: Array.isArray(value.position) ? value.position : undefined,
        rotation: value.rotation,
        length: typeof value.length === 'number' ? value.length : undefined,
        height: typeof value.height === 'number' ? value.height : undefined,
      }
    case 'item':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        position: Array.isArray(value.position) ? value.position : undefined,
        rotation: Array.isArray(value.rotation) ? value.rotation : undefined,
        scale: Array.isArray(value.scale) ? value.scale : undefined,
        asset: isRecord(value.asset)
          ? {
              id: typeof value.asset.id === 'string' ? value.asset.id : undefined,
              name: typeof value.asset.name === 'string' ? value.asset.name : undefined,
              category: typeof value.asset.category === 'string' ? value.asset.category : undefined,
              attachTo: typeof value.asset.attachTo === 'string' ? value.asset.attachTo : null,
            }
          : undefined,
      }
    case 'door':
    case 'window':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        wallId: typeof value.wallId === 'string' ? value.wallId : undefined,
        position: Array.isArray(value.position) ? value.position : undefined,
        width: typeof value.width === 'number' ? value.width : undefined,
        height: typeof value.height === 'number' ? value.height : undefined,
        side: typeof value.side === 'string' ? value.side : undefined,
      }
    case 'cad-sketch':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        plane: typeof value.plane === 'string' ? value.plane : undefined,
        entityCount: typeof value.entityCount === 'number' ? value.entityCount : undefined,
        closedProfileCount: Array.isArray(value.closedProfileEntityIds)
          ? value.closedProfileEntityIds.length
          : undefined,
      }
    case 'cad-body':
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
        regenStatus: typeof value.regenStatus === 'string' ? value.regenStatus : undefined,
        sourceSketchIds: Array.isArray(value.sourceSketchIds) ? value.sourceSketchIds : [],
        operationKinds: Array.isArray(value.operationKinds) ? value.operationKinds : [],
        operationCount: Array.isArray(value.operations) ? value.operations.length : undefined,
      }
    default:
      return {
        id: value.id,
        type: value.type,
        name: typeof value.name === 'string' ? value.name : null,
        parentId: typeof value.parentId === 'string' ? value.parentId : null,
      }
  }
}

const compactCatalogItem = (value: unknown) => {
  if (!isRecord(value)) return null
  return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.category === 'string'
    ? {
        id: value.id,
        name: value.name,
        category: value.category,
        attachTo: typeof value.attachTo === 'string' ? value.attachTo : null,
        tags: Array.isArray(value.tags)
          ? value.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      }
    : null
}

const compactTaskPlanSummary = (value: unknown) => {
  if (!isRecord(value)) return null

  const title = typeof value.title === 'string' ? value.title : null
  if (!title) return null

  const stepCount = Array.isArray(value.steps)
    ? value.steps.length
    : typeof value.stepCount === 'number'
      ? value.stepCount
      : 0

  return {
    title,
    stepCount,
  }
}

const compactAssistantSession = (value: unknown) => {
  if (!isRecord(value)) return null

  const taskPlanSummaries =
    Array.isArray(value.taskPlans) && value.taskPlans.length > 0
      ? value.taskPlans.map(compactTaskPlanSummary).filter(Boolean).slice(0, 2)
      : Array.isArray(value.taskPlanSummaries)
        ? value.taskPlanSummaries
            .map(compactTaskPlanSummary)
            .filter(Boolean)
            .slice(0, 2)
        : []

  return {
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined,
    chatMode: typeof value.chatMode === 'string' ? value.chatMode : undefined,
    codexThreadId: typeof value.codexThreadId === 'string' ? value.codexThreadId : undefined,
    cadMacroExpansion: value.cadMacroExpansion === true ? true : undefined,
    lastError: typeof value.lastError === 'string' ? value.lastError : null,
    recentSuccessfulPrompts: Array.isArray(value.recentSuccessfulPrompts)
      ? value.recentSuccessfulPrompts
          .filter((entry): entry is string => typeof entry === 'string')
          .slice(0, MAX_ASSISTANT_SELECTED_SUMMARIES)
      : [],
    failedPrompts: Array.isArray(value.failedPrompts)
      ? value.failedPrompts
          .filter((entry): entry is string => typeof entry === 'string')
          .slice(0, 3)
      : [],
    taskPlanSummaries,
    preferredComplexity:
      typeof value.preferredComplexity === 'string' &&
      (value.preferredComplexity === 'simple' || value.preferredComplexity === 'detailed')
        ? value.preferredComplexity
        : 'simple',
    recentReferencedNodes: Array.isArray(value.recentReferencedNodes)
      ? value.recentReferencedNodes
          .map(compactAssistantNodeSummary)
          .filter(Boolean)
          .slice(0, MAX_ASSISTANT_SELECTED_SUMMARIES)
      : [],
    lastCreatedNodes: Array.isArray(value.lastCreatedNodes)
      ? value.lastCreatedNodes
          .map(compactAssistantNodeSummary)
          .filter(Boolean)
          .slice(0, MAX_ASSISTANT_SELECTED_SUMMARIES)
      : [],
  }
}

const scoreCatalogPromptMatch = (
  item: ReturnType<typeof compactCatalogItem>,
  normalizedPrompt: string,
  promptTokens: string[],
) => {
  if (!item) return -1
  const searchTerms = [item.id, item.name, item.category, ...item.tags]
    .map(normalizeSearchValue)
    .filter((term) => term.length >= 3)

  const matchedTerms = searchTerms.filter(
    (term) => normalizedPrompt.includes(term) || promptTokens.some((token) => term.includes(token)),
  )
  if (matchedTerms.length === 0) return -1

  const longestTerm = Math.max(...matchedTerms.map((term) => term.length))
  const exactNameBoost = normalizedPrompt.includes(normalizeSearchValue(item.name)) ? 20 : 0
  const exactIdBoost = normalizedPrompt.includes(normalizeSearchValue(item.id)) ? 30 : 0
  return longestTerm + exactNameBoost + exactIdBoost
}

export const shapeAssistantPlanningContext = (
  prompt: string,
  context: Record<string, unknown> | undefined,
) => {
  if (!isRecord(context)) return {}

  const promptTokens = tokenizePrompt(prompt)
  const normalizedPrompt = normalizeSearchValue(prompt)
  const catalogItems = Array.isArray(context.catalog)
    ? context.catalog.map(compactCatalogItem).filter(Boolean)
    : []

  const matchedCatalogItems = catalogItems
    .map((item) => ({ item, score: scoreCatalogPromptMatch(item, normalizedPrompt, promptTokens) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_ASSISTANT_CATALOG_ITEMS)
    .map((candidate) => candidate.item)

  const selection = isRecord(context.selection)
    ? {
        buildingId: typeof context.selection.buildingId === 'string' ? context.selection.buildingId : null,
        levelId: typeof context.selection.levelId === 'string' ? context.selection.levelId : null,
        zoneId: typeof context.selection.zoneId === 'string' ? context.selection.zoneId : null,
        selectedIds: Array.isArray(context.selection.selectedIds)
          ? context.selection.selectedIds.filter((value): value is string => typeof value === 'string')
          : [],
      }
    : undefined

  const cad = isRecord(context.cad)
    ? {
        helperStatus: typeof context.cad.helperStatus === 'string' ? context.cad.helperStatus : undefined,
        lastError: typeof context.cad.lastError === 'string' ? context.cad.lastError : null,
        activeSketchId: typeof context.cad.activeSketchId === 'string' ? context.cad.activeSketchId : null,
      }
    : undefined

  return {
    phase: typeof context.phase === 'string' ? context.phase : undefined,
    mode: typeof context.mode === 'string' ? context.mode : undefined,
    tool: typeof context.tool === 'string' ? context.tool : null,
    structureLayer: typeof context.structureLayer === 'string' ? context.structureLayer : undefined,
    availableActions: {
      cleanup: ['clear_level_contents'],
    },
    selection,
    selectedNodeSummary: Array.isArray(context.selectedNodeSummary)
      ? context.selectedNodeSummary
          .map(compactAssistantNodeSummary)
          .filter(Boolean)
          .slice(0, MAX_ASSISTANT_SELECTED_SUMMARIES)
      : [],
    levelSummary: compactAssistantNodeSummary(context.levelSummary),
    buildingSummary: compactAssistantNodeSummary(context.buildingSummary),
    sceneSummary: Array.isArray(context.sceneSummary)
      ? context.sceneSummary
          .map(compactAssistantNodeSummary)
          .filter(Boolean)
          .slice(0, MAX_ASSISTANT_SCENE_SUMMARIES)
      : [],
    assistantSession: compactAssistantSession(context.assistantSession),
    catalog: matchedCatalogItems,
    cad,
  }
}

const scoreCadNodeMatch = (
  value: ContextRecord,
  promptTokens: string[],
  levelId: string | null | undefined,
) => {
  let score = 0
  if (typeof value.type === 'string' && (value.type === 'cad-body' || value.type === 'cad-sketch')) score += 50
  if (typeof value.id === 'string' && value.id === levelId) score += 40
  if (typeof value.parentId === 'string' && value.parentId === levelId) score += 20

  const searchTerms = [
    typeof value.type === 'string' ? value.type : '',
    typeof value.name === 'string' ? value.name : '',
    typeof value.id === 'string' ? value.id : '',
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)

  for (const token of promptTokens) {
    if (searchTerms.some((term) => term.includes(token))) score += 10
  }

  return score
}

export const shapeCadPlanningContext = (
  prompt: string,
  context: { levelId: string | null; nodes: Array<Record<string, unknown>> },
) => {
  const promptTokens = tokenizePrompt(prompt)
  const rankedNodes = context.nodes
    .filter(isRecord)
    .map((node) => ({
      node,
      score: scoreCadNodeMatch(node, promptTokens, context.levelId),
    }))
    .sort((left, right) => right.score - left.score)

  const selectedNodes: Array<Record<string, unknown>> = []
  const seenIds = new Set<string>()
  for (const candidate of rankedNodes) {
    const id = typeof candidate.node.id === 'string' ? candidate.node.id : null
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)
    selectedNodes.push(candidate.node)
    if (selectedNodes.length >= MAX_CAD_NODE_SUMMARIES) break
  }

  return {
    levelId: context.levelId,
    nodes: selectedNodes,
  }
}
