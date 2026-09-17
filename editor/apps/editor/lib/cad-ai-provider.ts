import { Codex } from '@openai/codex-sdk'
import { type CadBrief, CadBriefSchema } from '../../../packages/core/src/schema/cad-brief'
import {
  buildDeterministicCadBrief as sharedBuildDeterministicCadBrief,
  buildFallbackCadBrief as sharedBuildFallbackCadBrief,
  isSimpleBoxPrompt as sharedIsSimpleBoxPrompt,
  shouldUseDeterministicCadFallback as sharedShouldUseDeterministicCadFallback,
} from './cad-deterministic-brief'
import {
  AiProviderError,
  getSharedAiConfig,
  readEnvValue,
  requestOpenAiResponses,
  requestOpenRouterResponses,
  type SharedAiConfig,
  type SharedOpenAiConfig,
  type SharedOpenRouterConfig,
} from './ai-provider-shared'
export { AiProviderError as CadAiProviderError } from './ai-provider-shared'

const DEFAULT_OPENAI_MODEL = 'gpt-5.4'
const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex'
const DEFAULT_CODEX_REASONING_EFFORT = 'medium'
const DEFAULT_OPENROUTER_MODEL = 'openrouter/free'
const DEFAULT_OPENROUTER_TITLE = 'Pistola'
const OPENAI_CAD_TIMEOUT_MS = 60_000
const OPENROUTER_CAD_TIMEOUT_MS = 60_000
const CODEX_CAD_TIMEOUT_MS = 90_000

const cadCodexReasoningEffortValues = ['low', 'medium', 'high', 'xhigh'] as const
type CadCodexReasoningEffort = (typeof cadCodexReasoningEffortValues)[number]

export type CadAiProvider = SharedAiConfig['provider'] | 'codex'

export type CadBriefRequest = {
  prompt: string
  retry?: number
  codexThreadId?: string
  context?: {
    levelId?: string | null
    nodes?: Array<Record<string, unknown>>
  }
}

type CodexCadAiConfig = {
  provider: 'codex'
  apiKey: string
  model: string
  reasoningEffort: CadCodexReasoningEffort
  workingDirectory: string
}

type OpenAiCadAiConfig = SharedOpenAiConfig
type OpenRouterCadAiConfig = SharedOpenRouterConfig
export type CadAiConfig = SharedAiConfig | CodexCadAiConfig

type CadBriefRequesterResult = {
  raw: string
  codexThreadId?: string
}

type CadAiRequesters = {
  requestOpenAiBrief?: (config: OpenAiCadAiConfig, body: CadBriefRequest) => Promise<string>
  requestOpenRouterBrief?: (
    config: OpenRouterCadAiConfig,
    body: CadBriefRequest,
  ) => Promise<string>
  requestCodexBrief?: (
    config: CodexCadAiConfig,
    body: CadBriefRequest,
  ) => Promise<CadBriefRequesterResult>
}

const CAD_BRIEF_SYSTEM_PROMPT = `You are the Pistola CAD planning assistant.
Return JSON only.
Generate a CadBrief object with exactly these top-level keys: intent, sketchPlans, operationGraph, assumptions, ambiguities.
Use sketchPlans[n] as the source for new solids by setting operationGraph[n].params.sketchIndex.
Use operationGraph[n].dependsOn to reference prior operation ids when an operation edits an existing body.
Prefer rectangles, circles, and polylines for simple prismatic parts.
All coordinates, distances, and dimensions must be in meters.
If the user omits dimensions for a common object and safe defaults preserve the basic geometry, infer realistic meter-scale dimensions and record them in assumptions instead of blocking.
For a simple chair or child-sized chair, assume standard seat, backrest, and leg dimensions unless the prompt explicitly requires a special form.
If the prompt is ambiguous and geometry truly cannot be planned, leave sketchPlans and operationGraph empty and put the missing requirements in ambiguities.
Only include ambiguities that block geometry generation or operation planning.
Do not ask about material, color, finish, tolerance, or manufacturing details unless the user explicitly requested them and they materially change the geometry.
For rectangle entities, points must contain exactly two [x,y] corner points.
For circle or arc entities, points must contain exactly the center and one point on the radius.
For extrude operations, use params.distance and params.sketchIndex. Do not use params.depth.
For Boolean edits, use operationGraph[n].op as boolean_union, boolean_cut, or boolean_intersect. Do not use the generic boolean op or params.operation.
For a simple box, cube, or rectangular prism prompt with three dimensions, produce exactly one rectangle sketch and one extrude operation.
Every assumption must be explicit.
Do not include markdown fences or prose outside JSON.`

const NON_BLOCKING_AMBIGUITY_PATTERNS = [
  /\bmaterial\b/i,
  /\bcolor\b/i,
  /\bfinish\b/i,
  /\btolerance\b/i,
  /\bmanufacturing\b/i,
  /\bprocess\b/i,
  /\btexture\b/i,
] as const

const CAD_BRIEF_JSON_SCHEMA = {
  name: 'cad_brief',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'sketchPlans', 'operationGraph', 'assumptions', 'ambiguities'],
    properties: {
      intent: {
        type: 'string',
      },
      sketchPlans: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['plane', 'entities', 'dimensions', 'constraints'],
          properties: {
            plane: {
              type: 'string',
              enum: ['XY', 'XZ', 'YZ', 'level', 'face'],
            },
            entities: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'points', 'params'],
                properties: {
                  type: {
                    type: 'string',
                    enum: ['line', 'rectangle', 'circle', 'arc', 'polyline'],
                  },
                  points: {
                    type: 'array',
                    items: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 2,
                      items: {
                        type: 'number',
                      },
                    },
                  },
                  params: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              },
            },
            dimensions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
            constraints: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
        },
      },
      operationGraph: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'op', 'params', 'dependsOn'],
          properties: {
            id: {
              type: 'string',
            },
            op: {
              type: 'string',
              enum: [
                'extrude',
                'revolve',
                'boolean_union',
                'boolean_cut',
                'boolean_intersect',
                'fillet',
                'chamfer',
              ],
            },
            params: {
              type: 'object',
              additionalProperties: true,
            },
            dependsOn: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      },
      assumptions: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      ambiguities: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
  },
} as const

const getPromptContext = (prompt: string, context: CadBriefRequest['context'], retry: number) =>
  [
    `User CAD request: ${prompt}`,
    `Selected level id: ${context?.levelId ?? 'none'}`,
    `Scene summary: ${JSON.stringify(context?.nodes ?? [])}`,
    retry > 0
      ? 'Retry note: the previous response was not valid JSON. Return one JSON object only.'
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')

const parseMetricDimensions = (prompt: string) => {
  const normalizedPrompt = prompt
    .toLowerCase()
    .replaceAll('×', 'x')
    .replaceAll(' by ', ' x ')
    .replaceAll(' metres', ' m')
    .replaceAll(' meters', ' m')
    .replaceAll(' metre', ' m')
    .replaceAll(' meter', ' m')

  const match = normalizedPrompt.match(
    /(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?/,
  )

  if (!match) return null

  return match.slice(1, 4).map((value) => Number(value)) as [number, number, number]
}

const parseAgeYears = (prompt: string) => {
  const normalizedPrompt = prompt.toLowerCase()
  const match = normalizedPrompt.match(/(\d{1,2})\s*(?:years?\s*old|year-old|yo\b)/)
  if (!match) return null

  const age = Number(match[1])
  return Number.isFinite(age) ? age : null
}

const isChildSizedPrompt = (prompt: string) => {
  const normalizedPrompt = prompt.toLowerCase()
  const age = parseAgeYears(prompt)

  return (
    normalizedPrompt.includes('kid') ||
    normalizedPrompt.includes('child') ||
    normalizedPrompt.includes('children') ||
    normalizedPrompt.includes('toddler') ||
    (age !== null && age <= 12)
  )
}

const isSimpleBoxPrompt = (prompt: string) => {
  const normalizedPrompt = prompt.trim().toLowerCase()
  return (
    parseMetricDimensions(prompt) !== null &&
    (normalizedPrompt.includes('box') ||
      normalizedPrompt.includes('cube') ||
      normalizedPrompt.includes('rectangular prism'))
  )
}

const canUseDeterministicChairBrief = (prompt: string) => {
  const normalizedPrompt = prompt.trim().toLowerCase()
  if (!normalizedPrompt.includes('chair')) return false

  return ![
    'office',
    'gaming',
    'rocking',
    'wheelchair',
    'swivel',
    'recliner',
    'bean bag',
    'beanbag',
    'folding',
    'armrest',
    'arms',
  ].some((token) => normalizedPrompt.includes(token))
}

type ChairDimensions = {
  seatWidth: number
  seatDepth: number
  seatThickness: number
  seatHeight: number
  backrestHeight: number
  backrestThickness: number
  legThickness: number
}

const getChairDimensions = (prompt: string): ChairDimensions => {
  const age = parseAgeYears(prompt)

  if (isChildSizedPrompt(prompt)) {
    if (age !== null && age <= 6) {
      return {
        seatWidth: 0.3,
        seatDepth: 0.28,
        seatThickness: 0.03,
        seatHeight: 0.3,
        backrestHeight: 0.24,
        backrestThickness: 0.03,
        legThickness: 0.03,
      }
    }

    return {
      seatWidth: 0.34,
      seatDepth: 0.32,
      seatThickness: 0.03,
      seatHeight: 0.34,
      backrestHeight: 0.28,
      backrestThickness: 0.03,
      legThickness: 0.035,
    }
  }

  return {
    seatWidth: 0.42,
    seatDepth: 0.42,
    seatThickness: 0.035,
    seatHeight: 0.45,
    backrestHeight: 0.4,
    backrestThickness: 0.035,
    legThickness: 0.04,
  }
}

const createRectangleEntity = (
  centerX: number,
  centerY: number,
  width: number,
  depth: number,
) => ({
  type: 'rectangle' as const,
  points: [
    [centerX - width / 2, centerY - depth / 2],
    [centerX + width / 2, centerY + depth / 2],
  ] as [[number, number], [number, number]],
  params: {},
})

const buildDeterministicChairBrief = (
  prompt: string,
  context: CadBriefRequest['context'],
): CadBrief => {
  const plane = context?.levelId ? 'level' : 'XY'
  const {
    seatWidth,
    seatDepth,
    seatThickness,
    seatHeight,
    backrestHeight,
    backrestThickness,
    legThickness,
  } = getChairDimensions(prompt)

  const overallHeight = seatHeight + seatThickness + backrestHeight
  const rearZ = -seatDepth / 2 + backrestThickness / 2
  const legOffsetX = seatWidth / 2 - legThickness / 2
  const legOffsetZ = seatDepth / 2 - legThickness / 2

  return CadBriefSchema.parse({
    intent: prompt,
    sketchPlans: [
      {
        plane,
        entities: [createRectangleEntity(0, 0, seatWidth, seatDepth)],
        dimensions: [
          { kind: 'distance', value: seatWidth, label: 'seat width' },
          { kind: 'distance', value: seatDepth, label: 'seat depth' },
        ],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(0, rearZ, seatWidth, backrestThickness)],
        dimensions: [
          { kind: 'distance', value: seatWidth, label: 'backrest width' },
          { kind: 'distance', value: backrestThickness, label: 'backrest thickness' },
        ],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(-legOffsetX, -legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(legOffsetX, -legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(-legOffsetX, legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(legOffsetX, legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
    ],
    operationGraph: [
      {
        id: 'op_chair_seat',
        op: 'extrude',
        params: {
          sketchIndex: 0,
          distance: seatThickness,
          baseElevation: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_backrest',
        op: 'extrude',
        params: {
          sketchIndex: 1,
          distance: backrestHeight,
          baseElevation: seatHeight + seatThickness,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_fl',
        op: 'extrude',
        params: {
          sketchIndex: 2,
          distance: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_fr',
        op: 'extrude',
        params: {
          sketchIndex: 3,
          distance: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_rl',
        op: 'extrude',
        params: {
          sketchIndex: 4,
          distance: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_rr',
        op: 'extrude',
        params: {
          sketchIndex: 5,
          distance: seatHeight,
        },
        dependsOn: [],
      },
    ],
    assumptions: [
      `Used a deterministic ${isChildSizedPrompt(prompt) ? 'child-sized' : 'standard'} chair preset in meters.`,
      `Seat footprint assumed ${seatWidth.toFixed(2)} m x ${seatDepth.toFixed(2)} m.`,
      `Seat height assumed ${seatHeight.toFixed(2)} m above the floor.`,
      `Backrest height assumed ${backrestHeight.toFixed(2)} m above the seat.`,
      `Leg thickness assumed ${legThickness.toFixed(3)} m.`,
      `Overall chair height is ${overallHeight.toFixed(2)} m.`,
    ],
    ambiguities: [],
  })
}

const buildDeterministicBrief = (
  prompt: string,
  context: CadBriefRequest['context'],
) => sharedBuildDeterministicCadBrief(prompt, context ?? {})

const getRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const getPoint = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = Number(value[0])
  const y = Number(value[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return [x, y]
}

const normalizeRectanglePoints = (points: unknown, params: Record<string, unknown>) => {
  if (Array.isArray(points) && points.length === 2) return points

  if (Array.isArray(points) && points.length >= 4) {
    const normalizedPoints = points.map(getPoint).filter((point): point is [number, number] => point !== null)
    if (normalizedPoints.length >= 4) {
      const xs = normalizedPoints.map((point) => point[0])
      const ys = normalizedPoints.map((point) => point[1])

      return [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ]
    }
  }

  const width = Number(params.width ?? params.length ?? 0)
  const height = Number(params.height ?? params.depth ?? 0)
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return [
      [-width / 2, -height / 2],
      [width / 2, height / 2],
    ]
  }

  return points
}

const normalizeCircleLikePoints = (
  points: unknown,
  params: Record<string, unknown>,
  fallbackRadius = 0.5,
) => {
  if (Array.isArray(points) && points.length === 2) return points

  const center = getPoint(params.center) ?? [0, 0]
  const radius = Number(params.radius ?? fallbackRadius)
  if (Number.isFinite(radius) && radius > 0) {
    return [center, [center[0] + radius, center[1]]]
  }

  return points
}

const normalizeLinePoints = (points: unknown, params: Record<string, unknown>) => {
  if (Array.isArray(points) && points.length === 2) return points

  const start = getPoint(params.start)
  const end = getPoint(params.end)
  if (start && end) {
    return [start, end]
  }

  return points
}

const normalizeEntityCandidate = (entity: unknown) => {
  const record = getRecord(entity)
  if (!record) return entity

  const type = typeof record.type === 'string' ? record.type : null
  const params = getRecord(record.params) ?? {}
  const nextEntity: Record<string, unknown> = {
    ...record,
    params,
  }

  if (type === 'rectangle') {
    nextEntity.points = normalizeRectanglePoints(record.points, params)
  } else if (type === 'circle' || type === 'arc') {
    nextEntity.points = normalizeCircleLikePoints(record.points, params)
  } else if (type === 'line') {
    nextEntity.points = normalizeLinePoints(record.points, params)
  }

  return nextEntity
}

const normalizeSketchCandidate = (sketch: unknown) => {
  const record = getRecord(sketch)
  if (!record) return sketch

  const normalizedSketch: Record<string, unknown> = {
    ...record,
    entities: Array.isArray(record.entities)
      ? record.entities.map(normalizeEntityCandidate)
      : [],
    dimensions: Array.isArray(record.dimensions) ? record.dimensions : [],
    constraints: Array.isArray(record.constraints) ? record.constraints : [],
  }

  if (typeof normalizedSketch.plane !== 'string' && typeof record.view === 'string') {
    const view = record.view.toLowerCase()
    normalizedSketch.plane =
      view === 'top' ? 'XY' : view === 'front' ? 'XZ' : view === 'side' ? 'YZ' : undefined
  }

  return normalizedSketch
}

const normalizeOperationCandidate = (operation: unknown) => {
  const record = getRecord(operation)
  if (!record) return operation

  const params = getRecord(record.params) ?? {}
  if (typeof params.distance !== 'number') {
    const nextDistance = Number(params.distance ?? params.depth ?? params.extrudeDepth)
    if (Number.isFinite(nextDistance) && nextDistance > 0) {
      params.distance = nextDistance
    }
  }

  return {
    ...record,
    params,
    dependsOn: Array.isArray(record.dependsOn) ? record.dependsOn : [],
  }
}

const normalizeCadBriefCandidate = (raw: string) => {
  const parsed = JSON.parse(raw)
  const record = getRecord(parsed)
  if (!record) return parsed

  return {
    ...record,
    sketchPlans: Array.isArray(record.sketchPlans)
      ? record.sketchPlans.map(normalizeSketchCandidate)
      : [],
    operationGraph: Array.isArray(record.operationGraph)
      ? record.operationGraph.map(normalizeOperationCandidate)
      : [],
    assumptions: Array.isArray(record.assumptions) ? record.assumptions : [],
    ambiguities: Array.isArray(record.ambiguities) ? record.ambiguities : [],
  }
}

const isNonBlockingAmbiguity = (ambiguity: string) =>
  NON_BLOCKING_AMBIGUITY_PATTERNS.some((pattern) => pattern.test(ambiguity))

const trimNonBlockingAmbiguities = (brief: CadBrief) => {
  if (brief.sketchPlans.length === 0 && brief.operationGraph.length === 0) {
    return brief
  }

  return {
    ...brief,
    ambiguities: brief.ambiguities.filter((ambiguity) => !isNonBlockingAmbiguity(ambiguity)),
  }
}

const assertSimpleBoxBrief = (brief: CadBrief) => {
  if (brief.ambiguities.length > 0) {
    throw new Error('The CAD planner returned ambiguities for a simple box prompt.')
  }

  if (brief.sketchPlans.length !== 1) {
    throw new Error('The CAD planner returned multiple sketches for a simple box prompt.')
  }

  if (brief.operationGraph.length !== 1) {
    throw new Error('The CAD planner returned multiple operations for a simple box prompt.')
  }

  const sketch = brief.sketchPlans[0]
  const operation = brief.operationGraph[0]
  if (!sketch || !operation) {
    throw new Error('The CAD planner returned an incomplete box brief.')
  }

  const entity = sketch.entities[0]

  if (sketch.entities.length !== 1 || entity?.type !== 'rectangle') {
    throw new Error('The CAD planner must return exactly one rectangle sketch for a simple box prompt.')
  }

  if (!Array.isArray(entity.points) || entity.points.length !== 2) {
    throw new Error('The CAD planner returned an unusable rectangle definition for a simple box prompt.')
  }

  const [start, end] = entity.points
  if (!start || !end) {
    throw new Error('The CAD planner returned an incomplete rectangle for a simple box prompt.')
  }

  if (start[0] === end[0] || start[1] === end[1]) {
    throw new Error('The CAD planner returned a degenerate rectangle for a simple box prompt.')
  }

  if (operation.op !== 'extrude') {
    throw new Error('The CAD planner must return one extrude operation for a simple box prompt.')
  }

  const params = getRecord(operation.params) ?? {}
  if (params.sketchIndex !== 0) {
    throw new Error('The CAD planner returned an extrude operation that does not reference the first sketch.')
  }

  if (typeof params.distance !== 'number' || params.distance <= 0) {
    throw new Error('The CAD planner returned an extrude operation without a valid distance.')
  }
}

export const validateCadBriefSemantics = (prompt: string, brief: CadBrief) => {
  if (sharedIsSimpleBoxPrompt(prompt)) {
    assertSimpleBoxBrief(brief)
  }
}

export const normalizeCadBrief = (raw: string, prompt: string) => {
  const normalizedCandidate = normalizeCadBriefCandidate(raw)
  const brief = trimNonBlockingAmbiguities(CadBriefSchema.parse(normalizedCandidate))
  validateCadBriefSemantics(prompt, brief)
  return JSON.stringify(brief)
}

const buildCadBaseRemoteRequest = (body: CadBriefRequest, model: string) => ({
  model,
  input: [
    {
      type: 'message' as const,
      role: 'system' as const,
      content: CAD_BRIEF_SYSTEM_PROMPT,
    },
    {
      type: 'message' as const,
      role: 'user' as const,
      content: getPromptContext(body.prompt, body.context, body.retry ?? 0),
    },
  ],
  store: false as const,
  stream: false as const,
  temperature: 0.1,
  truncation: 'disabled' as const,
})

export const buildOpenAiCadRemoteRequest = (body: CadBriefRequest, model: string) => ({
  ...buildCadBaseRemoteRequest(body, model),
  text: {
    format: {
      type: 'json_schema' as const,
      ...CAD_BRIEF_JSON_SCHEMA,
    },
  },
})

export const buildOpenRouterCadRemoteRequest = (body: CadBriefRequest, model: string) =>
  buildCadBaseRemoteRequest(body, model)

const normalizeCadCodexReasoningEffort = (
  value: string | undefined,
): CadCodexReasoningEffort => {
  const normalized = readEnvValue(value)?.toLowerCase()
  return cadCodexReasoningEffortValues.includes(normalized as CadCodexReasoningEffort)
    ? (normalized as CadCodexReasoningEffort)
    : DEFAULT_CODEX_REASONING_EFFORT
}

export const getCadAiConfig = (
  env: Record<string, string | undefined> = process.env,
): CadAiConfig => {
  const requestedProvider = readEnvValue(env.PISTOLA_CAD_AI_PROVIDER)?.toLowerCase()

  if (requestedProvider === 'codex') {
    const apiKey = readEnvValue(env.OPENAI_API_KEY)
    if (!apiKey) return { provider: 'fallback' }

    return {
      provider: 'codex',
      apiKey,
      model: readEnvValue(env.PISTOLA_CAD_MODEL) ?? DEFAULT_CODEX_MODEL,
      reasoningEffort: normalizeCadCodexReasoningEffort(env.PISTOLA_CAD_REASONING_EFFORT),
      workingDirectory: process.cwd(),
    }
  }

  return getSharedAiConfig(env, {
    modelEnvVar: 'PISTOLA_CAD_MODEL',
    baseUrlEnvVar: 'PISTOLA_CAD_AI_BASE_URL',
    providerEnvVar: 'PISTOLA_CAD_AI_PROVIDER',
    httpRefererEnvVar: 'PISTOLA_CAD_AI_HTTP_REFERER',
    titleEnvVar: 'PISTOLA_CAD_AI_TITLE',
    legacyOpenRouterApiKeyEnvVar: 'PISTOLA_CAD_AI_API_KEY',
    openAiModelDefault: DEFAULT_OPENAI_MODEL,
    openRouterModelDefault: DEFAULT_OPENROUTER_MODEL,
    openRouterTitleDefault: DEFAULT_OPENROUTER_TITLE,
  })
}

export const buildFallbackBrief = (
  prompt: string,
  context: CadBriefRequest['context'],
): CadBrief => sharedBuildFallbackCadBrief(prompt, context ?? {})

export const requestOpenAiBrief = async (
  config: OpenAiCadAiConfig,
  body: CadBriefRequest,
) =>
  requestOpenAiResponses(
    config,
    buildOpenAiCadRemoteRequest(body, config.model),
    OPENAI_CAD_TIMEOUT_MS,
    'OpenAI CAD planning',
  )

export const requestOpenRouterBrief = async (
  config: OpenRouterCadAiConfig,
  body: CadBriefRequest,
) =>
  requestOpenRouterResponses(
    config,
    buildOpenRouterCadRemoteRequest(body, config.model),
    OPENROUTER_CAD_TIMEOUT_MS,
    'OpenRouter CAD planning',
  )

const buildCodexCadBriefPrompt = (body: CadBriefRequest) =>
  [
    CAD_BRIEF_SYSTEM_PROMPT,
    'Return exactly one JSON object that matches the provided output schema.',
    getPromptContext(body.prompt, body.context, body.retry ?? 0),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')

const stringifyCodexCadOutput = (value: unknown) => {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  throw new Error('Codex CAD planning returned an empty response.')
}

const isTimeoutLikeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /timeout|timed out|aborted/i.test(message)
}

const getCodexCadProviderFailureMessage = (label: string, timeoutMs: number, error: unknown) => {
  if (isTimeoutLikeError(error)) {
    return `${label} timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`
  }
  return error instanceof Error && error.message ? error.message : `${label} request failed.`
}

export const requestCodexBrief = async (
  config: CodexCadAiConfig,
  body: CadBriefRequest,
): Promise<CadBriefRequesterResult> => {
  const timeoutMs = CODEX_CAD_TIMEOUT_MS

  try {
    const codex = new Codex({
      apiKey: config.apiKey,
    })
    const threadOptions = {
      model: config.model,
      modelReasoningEffort: config.reasoningEffort,
      approvalPolicy: 'never' as const,
      sandboxMode: 'read-only' as const,
      networkAccessEnabled: false,
      webSearchMode: 'disabled' as const,
      workingDirectory: config.workingDirectory,
      skipGitRepoCheck: true,
    }
    const thread = body.codexThreadId
      ? codex.resumeThread(body.codexThreadId, threadOptions)
      : codex.startThread(threadOptions)
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new Error(
              `Codex CAD planning timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`,
            ),
          )
        }, timeoutMs)
      })
      const turn = await Promise.race([
        thread.run(buildCodexCadBriefPrompt(body), {
          outputSchema: CAD_BRIEF_JSON_SCHEMA.schema as never,
        }),
        timeoutPromise,
      ])

      return {
        raw: stringifyCodexCadOutput(turn.finalResponse),
        codexThreadId: thread.id ?? body.codexThreadId,
      }
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError(
      'codex',
      getCodexCadProviderFailureMessage('Codex CAD planning', timeoutMs, error),
      isTimeoutLikeError(error) ? 'timeout' : 'provider',
    )
  }
}

export type CadBriefResult = {
  raw: string
  provider: CadAiProvider
  codexThreadId?: string
}

export const createCadBriefResult = async (
  body: CadBriefRequest,
  env: Record<string, string | undefined> = process.env,
  requesters: CadAiRequesters = {},
): Promise<CadBriefResult> => {
  const deterministicBrief = buildDeterministicBrief(body.prompt, body.context)
  if (deterministicBrief) {
    return {
      raw: JSON.stringify(deterministicBrief),
      provider: 'fallback',
    }
  }

  if (sharedShouldUseDeterministicCadFallback(body.prompt)) {
    return {
      raw: JSON.stringify(buildFallbackBrief(body.prompt, body.context)),
      provider: 'fallback',
    }
  }

  const config = getCadAiConfig(env)

  if (config.provider === 'fallback') {
    return {
      raw: JSON.stringify(buildFallbackBrief(body.prompt, body.context)),
      provider: 'fallback',
    }
  }

  try {
    if (config.provider === 'codex') {
      const codexResult = await (requesters.requestCodexBrief ?? requestCodexBrief)(config, body)
      return {
        raw: normalizeCadBrief(codexResult.raw, body.prompt),
        provider: 'codex',
        codexThreadId: codexResult.codexThreadId,
      }
    }

    const raw =
      config.provider === 'openrouter'
        ? await (requesters.requestOpenRouterBrief ?? requestOpenRouterBrief)(config, body)
        : await (requesters.requestOpenAiBrief ?? requestOpenAiBrief)(config, body)

    return {
      raw: normalizeCadBrief(raw, body.prompt),
      provider: config.provider,
    }
  } catch (error) {
    if (
      error instanceof AiProviderError &&
      /timed out/i.test(error.message) &&
      sharedShouldUseDeterministicCadFallback(body.prompt)
    ) {
      return {
        raw: JSON.stringify(buildFallbackBrief(body.prompt, body.context)),
        provider: 'fallback',
      }
    }

    throw error
  }
}
