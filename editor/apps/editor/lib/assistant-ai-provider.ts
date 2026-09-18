import { Codex } from '@openai/codex-sdk'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import {
  AssistantActionSchema,
  AssistantTurnResultSchema,
  assistantActionTypeValues,
  assistantCameraModeValues,
  assistantCameraOrbitDirectionValues,
  assistantCatalogCategoryValues,
  assistantCadBooleanModeValues,
  assistantCadExtrudeDirectionValues,
  assistantCadRevolveAxisValues,
  assistantCadWorkplaneValues,
  assistantDestructiveActionTypes,
  assistantLevelViewModeValues,
  assistantModeValues,
  assistantPhaseValues,
  assistantPlacementValues,
  assistantSafeImmediateActionTypes,
  assistantSceneExportFormatValues,
  assistantSideValues,
  assistantStructureLayerValues,
  assistantThemeValues,
  assistantToolValues,
  assistantTransformModeValues,
  assistantTransformPivotValues,
  assistantWallViewModeValues,
  type AssistantCadExtrudeDirection,
  type AssistantCadRevolveAxis,
  isDestructiveAssistantActionType,
  isSafeImmediateAssistantActionType,
  type AssistantAction,
  type AssistantContinuation,
  type AssistantTurnResult,
} from '../../../packages/editor/src/lib/assistant/types'
import {
  type AssistantActionSequenceIssue,
  validateAssistantActionSequence,
} from '../../../packages/editor/src/lib/assistant/sequence-validation'
import { findMatchingRecipe } from '../../../packages/editor/src/lib/assistant/recipes/creation-recipes'
import {
  AiProviderError,
  cleanJsonString,
  getSharedAiConfig,
  readEnvValue,
  requestOpenAiResponses,
  requestOpenRouterResponses,
  type SharedAiConfig,
  type SharedOpenAiConfig,
  type SharedOpenRouterConfig,
} from './ai-provider-shared'
import { applyInstalledAiConfigToEnv } from './installed-ai-config'
import { shapeAssistantPlanningContext } from './ai-context-shaping'
import {
  AssistantChatModeSchema,
} from './assistant-chat-contract'
import {
  findAssistantTargetById,
  getAssistantSessionNodeSummaries,
  getAssistantTargetSummaries,
  resolveAssistantPromptTarget,
  type AssistantTargetResolutionSource,
  type AssistantTargetSelection as SelectedTargetContext,
} from './assistant-target-resolution'
import {
  createLegacyAssistantImageAttachment,
  normalizeAssistantImageAttachment,
  AssistantImageAttachmentSchema,
} from './assistant-image-contract'
import {
  interpretAssistantImage,
  isWorkspaceImageCommandPrompt,
} from './assistant-image-interpretation'
import { buildFallbackCadBrief, normalizeCadPrompt } from './cad-deterministic-brief'
import { analyzeImageWithGemini } from './gemini-vision'
import { isGeminiPlannerAvailable, requestGeminiPlannerTurn } from './gemini-planner'
import {
  classifyRequestComplexity,
  decomposeIntoAgentTasks,
  type RequestComplexity,
} from './assistant-agent-router'
export { AiProviderError as AssistantAiProviderError } from './ai-provider-shared'
export { AssistantTurnResultSchema } from '../../../packages/editor/src/lib/assistant/types'

const DEFAULT_OPENAI_MODEL = 'gpt-5.4'
const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex'
const DEFAULT_CODEX_REASONING_EFFORT = 'medium'
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.4'
const DEFAULT_OPENROUTER_TITLE = 'Pistola'
const OPENAI_ASSISTANT_TIMEOUT_MS = 60_000
const OPENROUTER_ASSISTANT_TIMEOUT_MS = 300_000
const REMOTE_ASSISTANT_CHAT_TIMEOUT_MS = 180_000
const COMPLEX_ASSISTANT_TIMEOUT_MS = 300_000
const LOCAL_ASSISTANT_MODEL = 'deterministic-local'
const GEMINI_ASSISTANT_MODEL = 'gemini-2.5-flash'

const assistantCodexReasoningEffortValues = ['low', 'medium', 'high', 'xhigh'] as const
type AssistantCodexReasoningEffort = (typeof assistantCodexReasoningEffortValues)[number]

const AssistantPlanContinuationSchema = z
  .object({
    kind: z.literal('local-sequence'),
    intentId: z.string().min(1),
    originPrompt: z.string().min(1),
    summary: z.string().min(1),
    stepIndex: z.number().int().positive(),
    totalSteps: z.number().int().positive(),
    remainingActions: z.array(z.unknown()).default([]),
    resolvedRefs: z.record(z.string(), z.string()).default({}),
    autoContinue: z.boolean().default(true),
  })
  .transform(
    (value) =>
      ({
        ...value,
        remainingActions: value.remainingActions as AssistantAction[],
      }) as AssistantContinuation,
  )

export const AssistantPlanRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  provider: z.string().optional(),
  retry: z.number().int().nonnegative().optional(),
  repairFeedback: z.string().optional(),
  chatMode: AssistantChatModeSchema.default('create'),
  complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  sessionId: z.string().min(1).optional(),
  codexThreadId: z.string().min(1).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  image: AssistantImageAttachmentSchema.optional(),
  imageDataUrl: z.string().optional(),
  continuation: AssistantPlanContinuationSchema.optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string(),
      }),
    )
    .optional(),
  /** Gemini vision description injected by the server before planning. */
  geminiVisionDescription: z.string().optional(),
})

export type AssistantPlanRequest = z.infer<typeof AssistantPlanRequestSchema>
type CodexAssistantConfig = {
  provider: 'codex'
  apiKey?: string
  model: string
  reasoningEffort: AssistantCodexReasoningEffort
  workingDirectory: string
}

export type AssistantAiConfig = SharedAiConfig | CodexAssistantConfig
type OpenAiAssistantConfig = SharedOpenAiConfig
type OpenRouterAssistantConfig = SharedOpenRouterConfig
type AssistantRequesterResult = {
  raw: string
  codexThreadId?: string
}

type AssistantAiRequesters = {
  requestOpenAiTurn?: (
    config: OpenAiAssistantConfig,
    body: AssistantPlanRequest,
  ) => Promise<string | AssistantRequesterResult>
  requestOpenRouterTurn?: (
    config: OpenRouterAssistantConfig,
    body: AssistantPlanRequest,
  ) => Promise<string | AssistantRequesterResult>
  requestOpenAiChatTurn?: (
    config: OpenAiAssistantConfig,
    body: AssistantPlanRequest,
  ) => Promise<string | AssistantRequesterResult>
  requestOpenRouterChatTurn?: (
    config: OpenRouterAssistantConfig,
    body: AssistantPlanRequest,
  ) => Promise<string | AssistantRequesterResult>
  requestCodexTurn?: (
    config: CodexAssistantConfig,
    body: AssistantPlanRequest,
  ) => Promise<AssistantRequesterResult>
}

type AssistantSelectionContext = {
  buildingId?: string | null
  levelId?: string | null
  zoneId?: string | null
  selectedIds: string[]
}

type AssistantTurnMetadata = Pick<
  AssistantTurnResult,
  'targetingExplanation' | 'targetCandidates' | 'imageInterpretation' | 'providerMeta'
>

type AssistantTurnDraft = Omit<AssistantTurnResult, 'targetCandidates'> & {
  targetCandidates?: AssistantTurnResult['targetCandidates']
}

const getAssistantPlanImage = (body: Pick<AssistantPlanRequest, 'image' | 'imageDataUrl'>) =>
  normalizeAssistantImageAttachment(body.image) ??
  createLegacyAssistantImageAttachment(body.imageDataUrl)

const ASSISTANT_ACTION_TYPE_ENUM = assistantActionTypeValues
const enumShape = (values: readonly string[]) => values.join('|')
const ASSISTANT_BOX_BRIEF_EXAMPLE = {
  intent: 'create a box 1m x 2m x 0.5m',
  sketchPlans: [
    {
      plane: 'level',
      entities: [
        {
          type: 'rectangle',
          points: [
            [-0.5, -1],
            [0.5, 1],
          ],
          params: {},
        },
      ],
      dimensions: [
        { kind: 'distance', value: 1, label: 'width' },
        { kind: 'distance', value: 2, label: 'depth' },
      ],
      constraints: [],
    },
  ],
  operationGraph: [
    {
      id: 'op_box_extrude_1',
      op: 'extrude',
      params: {
        sketchIndex: 0,
        distance: 0.5,
        direction: [0, 1, 0],
        symmetric: false,
      },
      dependsOn: [],
    },
  ],
  assumptions: [
    'Interpreted the prompt as a rectangular box with a 1 m by 2 m footprint.',
    'Extruded the footprint 0.5 m upward on the level workplane.',
  ],
  ambiguities: [],
} as const

const ASSISTANT_ACTION_GUIDE = [
  { type: 'reset_workspace_selection', shape: { type: 'reset_workspace_selection' } },
  { type: 'set_phase', shape: { type: 'set_phase', phase: enumShape(assistantPhaseValues) } },
  { type: 'set_mode', shape: { type: 'set_mode', mode: enumShape(assistantModeValues) } },
  { type: 'set_structure_layer', shape: { type: 'set_structure_layer', layer: enumShape(assistantStructureLayerValues) } },
  { type: 'set_camera_mode', shape: { type: 'set_camera_mode', cameraMode: enumShape(assistantCameraModeValues) } },
  { type: 'set_theme', shape: { type: 'set_theme', theme: enumShape(assistantThemeValues) } },
  { type: 'set_level_view_mode', shape: { type: 'set_level_view_mode', levelMode: enumShape(assistantLevelViewModeValues) } },
  { type: 'set_wall_view_mode', shape: { type: 'set_wall_view_mode', wallMode: enumShape(assistantWallViewModeValues) } },
  { type: 'set_preview_mode', shape: { type: 'set_preview_mode', enabled: true } },
  { type: 'set_scans_visibility', shape: { type: 'set_scans_visibility', enabled: true } },
  { type: 'set_guides_visibility', shape: { type: 'set_guides_visibility', enabled: true } },
  { type: 'set_grid_visibility', shape: { type: 'set_grid_visibility', enabled: true } },
  { type: 'set_cad_workplane', shape: { type: 'set_cad_workplane', workplane: enumShape(assistantCadWorkplaneValues) } },
  { type: 'set_transform_mode', shape: { type: 'set_transform_mode', transformMode: enumShape(assistantTransformModeValues) } },
  { type: 'set_transform_pivot', shape: { type: 'set_transform_pivot', pivot: enumShape(assistantTransformPivotValues) } },
  { type: 'camera_top_view', shape: { type: 'camera_top_view' } },
  { type: 'orbit_camera', shape: { type: 'orbit_camera', direction: enumShape(assistantCameraOrbitDirectionValues) } },
  { type: 'set_fullscreen', shape: { type: 'set_fullscreen', enabled: true } },
  { type: 'undo_history', shape: { type: 'undo_history' } },
  { type: 'redo_history', shape: { type: 'redo_history' } },
  { type: 'export_scene', shape: { type: 'export_scene', format: enumShape(assistantSceneExportFormatValues) } },
  { type: 'copy_share_link', shape: { type: 'copy_share_link' } },
  { type: 'take_screenshot', shape: { type: 'take_screenshot' } },
  { type: 'capture_camera_snapshot', shape: { type: 'capture_camera_snapshot', nodeId: 'node_id' } },
  { type: 'view_camera_snapshot', shape: { type: 'view_camera_snapshot', nodeId: 'node_id' } },
  { type: 'clear_camera_snapshot', shape: { type: 'clear_camera_snapshot', nodeId: 'node_id' } },
  { type: 'close_cad_sketch', shape: { type: 'close_cad_sketch', sketchId: 'cad_sketch_id optional if active sketch should be used' } },
  {
    type: 'delete_cad_sketch_constraint',
    shape: {
      type: 'delete_cad_sketch_constraint',
      sketchId: 'cad_sketch_id optional if active sketch should be used',
      constraintId: 'constraint_id',
    },
  },
  {
    type: 'update_cad_sketch_dimension',
    shape: {
      type: 'update_cad_sketch_dimension',
      sketchId: 'cad_sketch_id optional if active sketch should be used',
      dimensionId: 'dimension_id',
      value: 1.2,
    },
  },
  {
    type: 'activate_tool',
    shape: {
      type: 'activate_tool',
      tool: 'one of the allowed tool values',
      catalogCategory: `${enumShape(assistantCatalogCategoryValues)} optional for item flows`,
    },
  },
  { type: 'focus_building', shape: { type: 'focus_building', buildingId: 'building_id' } },
  { type: 'focus_level', shape: { type: 'focus_level', levelId: 'level_id' } },
  { type: 'select_nodes', shape: { type: 'select_nodes', nodeIds: ['node_id'], zoneId: 'zone_id optional' } },
  { type: 'reposition_target', shape: { type: 'reposition_target', nodeId: 'item_or_door_or_window_id optional if selected' } },
  { type: 'create_level', shape: { type: 'create_level', buildingId: 'building_id optional', level: 1, name: 'Level 1 optional' } },
  { type: 'rename_level', shape: { type: 'rename_level', levelId: 'level_id', name: 'New level name' } },
  { type: 'rename_node', shape: { type: 'rename_node', nodeId: 'node_id', name: 'New node name' } },
  { type: 'set_node_visibility', shape: { type: 'set_node_visibility', nodeIds: ['node_id'], visible: false } },
  { type: 'update_zone_color', shape: { type: 'update_zone_color', nodeId: 'zone_id', color: '#f97316' } },
  { type: 'update_polygon_node', shape: { type: 'update_polygon_node', nodeId: 'node_id', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] } },
  { type: 'update_polygon_holes', shape: { type: 'update_polygon_holes', nodeId: 'node_id', holes: [[[1, 1], [2, 1], [2, 2], [1, 2]]] } },
  { type: 'create_wall', shape: { type: 'create_wall', levelId: 'level_id optional', start: [0, 0], end: [4, 0], height: 2.5, thickness: 0.15 } },
  { type: 'create_zone', shape: { type: 'create_zone', levelId: 'level_id optional', name: 'Room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] } },
  { type: 'create_slab', shape: { type: 'create_slab', levelId: 'level_id optional', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], holes: [] } },
  { type: 'create_ceiling', shape: { type: 'create_ceiling', levelId: 'level_id optional', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], holes: [] } },
  { type: 'create_roof', shape: { type: 'create_roof', levelId: 'level_id optional', corner1: [0, 0], corner2: [4, 4], height: 1.5 } },
  {
    type: 'place_item',
    shape: {
      type: 'place_item',
      assetId: 'catalog_item_id',
      targetNodeId: 'zone_or_slab_or_wall_or_ceiling optional',
      parentId: 'parent node id optional',
      placement: enumShape(assistantPlacementValues),
      position: [2, 0, 2],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      side: `${enumShape(assistantSideValues)} optional`,
    },
  },
  { type: 'place_door', shape: { type: 'place_door', wallId: 'wall_id', localX: 2, width: 0.9, height: 2.1, side: `${enumShape(assistantSideValues)} optional` } },
  { type: 'place_window', shape: { type: 'place_window', wallId: 'wall_id', localX: 2, localY: 1.5, width: 1.5, height: 1.5, side: `${enumShape(assistantSideValues)} optional` } },
  { type: 'update_item_properties', shape: { type: 'update_item_properties', nodeId: 'item_id', position: [2, 0, 2], rotation: [0, 1.57, 0], scale: [1.2, 1.2, 1.2] } },
  { type: 'update_door_properties', shape: { type: 'update_door_properties', nodeId: 'door_id', width: 1, height: 2.2, side: 'back' } },
  { type: 'update_window_properties', shape: { type: 'update_window_properties', nodeId: 'window_id', width: 1.8, height: 1.8, sill: true } },
  { type: 'update_wall_properties', shape: { type: 'update_wall_properties', nodeId: 'wall_id', height: 2.8, thickness: 0.18 } },
  { type: 'update_slab_properties', shape: { type: 'update_slab_properties', nodeId: 'slab_id', elevation: 0.05 } },
  { type: 'update_ceiling_properties', shape: { type: 'update_ceiling_properties', nodeId: 'ceiling_id', height: 2.7 } },
  { type: 'update_roof_properties', shape: { type: 'update_roof_properties', nodeId: 'roof_id', height: 1.8, rotation: 1.57 } },
  { type: 'update_reference_properties', shape: { type: 'update_reference_properties', nodeId: 'guide_or_scan_id', position: [0, 0, 0], scale: 1.2, opacity: 70 } },
  { type: 'update_site_properties', shape: { type: 'update_site_properties', nodeId: 'site_id', polygon: [[-15, -15], [15, -15], [15, 15], [-15, 15]] } },
  { type: 'move_target', shape: { type: 'move_target', nodeId: 'node_id optional if selected', delta: [1, 0, 0] } },
  { type: 'rotate_target', shape: { type: 'rotate_target', nodeId: 'node_id optional if selected', rotationY: 1.57 } },
  { type: 'scale_target', shape: { type: 'scale_target', nodeId: 'node_id optional if selected', scale: [1, 1, 1] } },
  { type: 'duplicate_target', shape: { type: 'duplicate_target', nodeId: 'node_id optional if selected' } },
  { type: 'duplicate_reposition_target', shape: { type: 'duplicate_reposition_target', nodeId: 'item_or_door_or_window_id optional if selected' } },
  { type: 'delete_target', shape: { type: 'delete_target', nodeId: 'node_id optional if selected' } },
  { type: 'delete_nodes', shape: { type: 'delete_nodes', nodeIds: ['node_id_1', 'node_id_2'] } },
  { type: 'clear_level_contents', shape: { type: 'clear_level_contents', levelId: 'level_id optional if current level should be cleared' } },
  { type: 'execute_cad_brief', shape: { type: 'execute_cad_brief', brief: ASSISTANT_BOX_BRIEF_EXAMPLE } },
  { type: 'create_default_cad_sketch', shape: { type: 'create_default_cad_sketch', position: [0, 0.01, 0] } },
  {
    type: 'extrude_cad_sketch',
    shape: {
      type: 'extrude_cad_sketch',
      sketchId: 'cad_sketch_id optional if active sketch should be used',
      depth: 0.6,
      direction: enumShape(assistantCadExtrudeDirectionValues),
    },
  },
  {
    type: 'revolve_cad_sketch',
    shape: {
      type: 'revolve_cad_sketch',
      sketchId: 'cad_sketch_id optional if active sketch should be used',
      angle: 180,
      axis: enumShape(assistantCadRevolveAxisValues),
      customAxis: [0, 1, 0],
    },
  },
  { type: 'regenerate_cad_body', shape: { type: 'regenerate_cad_body', bodyId: 'cad_body_id optional if selected', depth: 0.5 } },
  { type: 'retry_cad_body', shape: { type: 'retry_cad_body', bodyId: 'cad_body_id optional if selected' } },
  {
    type: 'set_cad_body_operation_suppressed',
    shape: {
      type: 'set_cad_body_operation_suppressed',
      bodyId: 'cad_body_id optional if selected body should be used',
      operationId: 'cad_operation_id',
      suppressed: true,
    },
  },
  {
    type: 'apply_cad_boolean',
    shape: {
      type: 'apply_cad_boolean',
      operation: enumShape(assistantCadBooleanModeValues),
      targetBodyId: 'cad_body_id optional if first selected body should be used',
      toolBodyId: 'cad_body_id optional if second selected body should be used',
    },
  },
  {
    type: 'apply_cad_fillet',
    shape: {
      type: 'apply_cad_fillet',
      bodyId: 'cad_body_id optional if selected body should be used',
      radius: 0.08,
      edgeRefs: ['edge-1 optional'],
    },
  },
  {
    type: 'apply_cad_chamfer',
    shape: {
      type: 'apply_cad_chamfer',
      bodyId: 'cad_body_id optional if selected body should be used',
      distance: 0.06,
      edgeRefs: ['edge-1 optional'],
    },
  },
  {
    type: 'add_cad_box_ears',
    shape: {
      type: 'add_cad_box_ears',
      bodyId: 'cad_body_id optional if selected body should be used',
    },
  },
  {
    type: 'extrude_cad_body_face',
    shape: {
      type: 'extrude_cad_body_face',
      bodyId: 'cad_body_id optional if selected body should be used',
      face: 'top|bottom|left|right|front|back',
      distance: 0.12,
    },
  },
  {
    type: 'shell_cad_body',
    shape: {
      type: 'shell_cad_body',
      bodyId: 'cad_body_id optional if selected body should be used',
      thickness: 0.04,
    },
  },
  { type: 'export_cad_body_step', shape: { type: 'export_cad_body_step', bodyId: 'cad_body_id optional if selected' } },
  { type: 'create_site', shape: { type: 'create_site', name: 'Site name optional' } },
  { type: 'create_building', shape: { type: 'create_building', siteId: 'site_id optional', name: 'Building name optional' } },
  { type: 'focus_camera_on_nodes', shape: { type: 'focus_camera_on_nodes', nodeIds: ['node_id_1', 'node_id_2'] } },
  {
    type: 'add_cad_sketch_entities',
    shape: {
      type: 'add_cad_sketch_entities',
      sketchId: 'cad_sketch_id optional if active sketch should be used',
      entities: [{ kind: 'rectangle|circle|line|arc|polyline' }],
    },
  },
  {
    type: 'set_cad_sketch_plane',
    shape: {
      type: 'set_cad_sketch_plane',
      sketchId: 'cad_sketch_id optional if active sketch should be used',
      plane: enumShape(assistantCadWorkplaneValues),
    },
  },
  { type: 'reparent_node', shape: { type: 'reparent_node', nodeId: 'node_id', newParentId: 'new_parent_id' } },
  { type: 'set_node_metadata', shape: { type: 'set_node_metadata', nodeId: 'node_id', key: 'status', value: 'approved' } },
] as const

const ASSISTANT_PLANNING_EXAMPLES = [
  {
    request: 'switch to structure and open the wall tool',
    result: {
      reply: 'I will switch to structure and activate the wall tool.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [
        { type: 'set_phase', phase: 'structure' },
        { type: 'activate_tool', tool: 'wall' },
      ],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'open the kitchen item tool',
    result: {
      reply: 'I will open the kitchen item tool.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'activate_tool', tool: 'item', catalogCategory: 'kitchen' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'switch the camera to orthographic',
    result: {
      reply: 'I will switch the camera to orthographic mode.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'set_camera_mode', cameraMode: 'orthographic' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'enter preview mode',
    result: {
      reply: 'I will enter preview mode.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'set_preview_mode', enabled: true }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'hide scans',
    result: {
      reply: 'I will hide the scans.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'set_scans_visibility', enabled: false }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'top view',
    result: {
      reply: 'I will switch to the top view camera.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'camera_top_view' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'enter fullscreen',
    result: {
      reply: 'I will enter fullscreen mode.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'set_fullscreen', enabled: true }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'undo',
    result: {
      reply: 'I will undo the last scene change.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'undo_history' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'export the scene as IFC',
    result: {
      reply: 'I will export the scene as IFC.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'export_scene', format: 'ifc' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'take a camera snapshot of the selected node',
    result: {
      reply: 'I will capture a camera snapshot for the selected node.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'capture_camera_snapshot', nodeId: 'node_id' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'switch the CAD workplane to XZ',
    result: {
      reply: 'I will switch to the XZ CAD workplane.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'set_cad_workplane', workplane: 'XZ' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'add a new level 1 to this building',
    result: {
      reply: 'I can add a new editable level scaffold to the current building.',
      mode: 'plan',
      assumptions: ['Using the current building as the parent for the new level scaffold.'],
      ambiguities: [],
      actions: [{ type: 'create_level', buildingId: 'building_id', level: 1, name: 'Level 1' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'create a 4m x 4m room on level 0 with walls, slab, and roof',
    result: {
      reply: 'I can create a rectangular editable room with structure and basic envelope elements.',
      mode: 'plan',
      assumptions: ['Using the requested editable room footprint of 4 m x 4 m.', 'Using a standard wall height of 2.7 m.'],
      ambiguities: [],
      actions: [
        { type: 'create_zone', levelId: 'level_id', name: 'Room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], color: '#eab308' },
        { type: 'create_wall', levelId: 'level_id', start: [0, 0], end: [4, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_id', start: [4, 0], end: [4, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_id', start: [4, 4], end: [0, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_id', start: [0, 4], end: [0, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_slab', levelId: 'level_id', name: 'Room Slab', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
        { type: 'create_ceiling', levelId: 'level_id', name: 'Room Ceiling', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], height: 2.7 },
        { type: 'create_roof', levelId: 'level_id', name: 'Room Roof', corner1: [0, 0], corner2: [4, 4], height: 1.4 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'put a sofa in the center of the room',
    result: {
      reply: 'I can place a sofa in the center of the selected room.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_id', placement: 'center' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'make a small two-bedroom house with kitchen and living room',
    result: {
      reply: 'I can create a compact editable house shell with rooms, structure, and basic openings.',
      mode: 'plan',
      assumptions: [
        'Using a compact prototype-grade layout with editable rectangular rooms.',
        'Approximating the house shell with standard room proportions and simple openings.',
      ],
      ambiguities: [],
      actions: [
        { type: 'create_zone', levelId: 'level_id', name: 'Living Room', polygon: [[0, 0], [4.4, 0], [4.4, 4], [0, 4]] },
        { type: 'create_zone', levelId: 'level_id', name: 'Kitchen', polygon: [[4.4, 0], [8, 0], [8, 4], [4.4, 4]] },
        { type: 'create_zone', levelId: 'level_id', name: 'Bedroom 1', polygon: [[0, 4], [4, 4], [4, 7.2], [0, 7.2]] },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'furnish the living room with a sofa, coffee table, rug, and TV wall',
    result: {
      reply: 'I can furnish that room with editable catalog items and proxies.',
      mode: 'plan',
      assumptions: [
        'Using zone "Living Room" as the furnishing target.',
        'Approximating the requested rug with the nearest editable rug-like catalog asset.',
      ],
      ambiguities: [],
      actions: [
        { type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'coffee-table', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'television', targetNodeId: 'zone_living', placement: 'center' },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'recreate this floor plan approximately from the attached image',
    result: {
      reply: 'I can recreate that floor plan approximately.',
      mode: 'plan',
      assumptions: ['Using the attached image as a rough floor-plan reference.'],
      ambiguities: [],
      actions: [{ type: 'create_zone', levelId: 'level_id', name: 'Approx Room', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'rename this room kitchen',
    result: {
      reply: 'I can rename that room to Kitchen.',
      mode: 'plan',
      assumptions: ['Using the current room target for the rename request.'],
      ambiguities: [],
      actions: [{ type: 'rename_node', nodeId: 'zone_id', name: 'Kitchen' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'create a box 1m x 2m x 0.5m',
    result: {
      reply: 'I can run a CAD build for that box.',
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions: [{ type: 'execute_cad_brief', brief: ASSISTANT_BOX_BRIEF_EXAMPLE }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'extrude the selected sketch 0.5m',
    result: {
      reply: 'I can extrude the selected CAD sketch.',
      mode: 'plan',
      assumptions: ['Using the active CAD sketch as the extrusion source.'],
      ambiguities: [],
      actions: [{ type: 'extrude_cad_sketch', sketchId: 'cad_sketch_id', depth: 0.5, direction: 'positive' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'close the active sketch',
    result: {
      reply: 'I can close the active CAD sketch.',
      mode: 'plan',
      assumptions: ['Using the active CAD sketch.'],
      ambiguities: [],
      actions: [{ type: 'close_cad_sketch', sketchId: 'cad_sketch_id' }],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'retry the selected CAD body',
    result: {
      reply: 'I can retry regeneration for the selected CAD body.',
      mode: 'plan',
      assumptions: ['Using the selected CAD body as the regeneration target.'],
      ambiguities: [],
      actions: [{ type: 'retry_cad_body', bodyId: 'cad_body_id' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'suppress the last fillet on the selected CAD body',
    result: {
      reply: 'I can suppress that CAD body operation.',
      mode: 'plan',
      assumptions: ['Using the selected CAD body and the latest matching operation.'],
      ambiguities: [],
      actions: [{ type: 'set_cad_body_operation_suppressed', bodyId: 'cad_body_id', operationId: 'cad_op_id', suppressed: true }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'fillet the selected CAD body',
    result: {
      reply: 'I can apply a fillet to the selected CAD body.',
      mode: 'plan',
      assumptions: ['Using the currently selected CAD body.'],
      ambiguities: [],
      actions: [{ type: 'apply_cad_fillet', bodyId: 'cad_body_id', radius: 0.08 }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'make a furnished house',
    result: {
      reply: 'I will break this into a structure-first house build, then layout and furnishing passes.',
      mode: 'task-plan',
      assumptions: ['Using editable prototype-grade rooms and catalog approximations.'],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Create the house shell and main rooms.',
          agent: 'structure',
          actions: [{ type: 'create_level', buildingId: 'building_id', name: 'Ground Floor' }],
        },
        {
          description: 'Add openings and primary layout edits.',
          agent: 'layout',
          actions: [{ type: 'focus_level', levelId: 'level_id' }],
        },
        {
          description: 'Furnish the key rooms with editable assets.',
          agent: 'furnish',
          actions: [{ type: 'place_item', assetId: 'sofa', placement: 'explicit', position: [2, 0, 2] }],
        },
        {
          description: 'Apply final refinement adjustments to the created layout.',
          agent: 'layout',
          actions: [{ type: 'move_target', nodeId: 'sofa_id', delta: [0.3, 0, 0] }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'build a room with door, windows, and furniture',
    result: {
      reply: 'I will build the room shell first, then add openings, then furnish it.',
      mode: 'task-plan',
      assumptions: ['Using standard editable wall openings and catalog furniture.'],
      ambiguities: [],
      actions: [],
      steps: [
        {
          description: 'Create the room shell.',
          agent: 'structure',
          actions: [{ type: 'create_zone', levelId: 'level_id', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }],
        },
        {
          description: 'Add the door and windows.',
          agent: 'layout',
          actions: [{ type: 'place_window', wallId: 'wall_id', width: 1.2, height: 1.1, localX: 0.5 }],
        },
        {
          description: 'Place the requested furniture.',
          agent: 'furnish',
          actions: [{ type: 'place_item', assetId: 'chair', placement: 'explicit', position: [1, 0, 1] }],
        },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    request: 'add a nice entrance',
    result: {
      reply: 'I need more detail before changing the scene.',
      mode: 'clarify',
      assumptions: [],
      ambiguities: ['Do you want a new door, porch, path, canopy, or entry furniture?'],
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
] as const

export const buildAssistantActionGuide = () => ({
  allowedActions: assistantActionTypeValues,
  allowedPhases: assistantPhaseValues,
  allowedModes: assistantModeValues,
  allowedStructureLayers: assistantStructureLayerValues,
  allowedCameraModes: assistantCameraModeValues,
  allowedLevelViewModes: assistantLevelViewModeValues,
  allowedWallViewModes: assistantWallViewModeValues,
  allowedCadWorkplanes: assistantCadWorkplaneValues,
  allowedTransformModes: assistantTransformModeValues,
  allowedTransformPivots: assistantTransformPivotValues,
  allowedTools: assistantToolValues,
  allowedCatalogCategories: assistantCatalogCategoryValues,
  safeImmediateActions: assistantSafeImmediateActionTypes,
  destructiveActions: assistantDestructiveActionTypes,
  examples: ASSISTANT_ACTION_GUIDE,
})

const ASSISTANT_JSON_SCHEMA = {
  name: 'assistant_turn_result',
  // Strict mode off: each action type carries different fields so items allow extra properties
  strict: false,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'reply',
      'mode',
      'assumptions',
      'ambiguities',
      'actions',
      'requiresReview',
      'destructiveActionCount',
    ],
    properties: {
      reply: { type: 'string' },
      mode: { type: 'string', enum: ['chat', 'clarify', 'plan', 'task-plan'] },
      assumptions: { type: 'array', items: { type: 'string' } },
      ambiguities: { type: 'array', items: { type: 'string' } },
      actions: {
        type: 'array',
        maxItems: 25,
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ASSISTANT_ACTION_TYPE_ENUM },
          },
        },
      },
      requiresReview: { type: 'boolean' },
      destructiveActionCount: { type: 'integer', minimum: 0 },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'actions', 'agent'],
          properties: {
            description: { type: 'string' },
            agent: {
              type: 'string',
              enum: ['structure', 'furnish', 'cad', 'layout', 'general'],
            },
            actions: {
              type: 'array',
              maxItems: 25,
              items: {
                type: 'object',
                additionalProperties: true,
                required: ['type'],
                properties: {
                  type: { type: 'string', enum: ASSISTANT_ACTION_TYPE_ENUM },
                },
              },
            },
          },
        },
      },
      continuation: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: true,
            required: ['kind', 'intentId', 'originPrompt', 'summary', 'stepIndex', 'totalSteps'],
            properties: {
              kind: { type: 'string', enum: ['local-sequence'] },
              intentId: { type: 'string' },
              originPrompt: { type: 'string' },
              summary: { type: 'string' },
              stepIndex: { type: 'integer', minimum: 1 },
              totalSteps: { type: 'integer', minimum: 1 },
              autoContinue: { type: 'boolean' },
              remainingActions: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  required: ['type'],
                  properties: {
                    type: { type: 'string', enum: ASSISTANT_ACTION_TYPE_ENUM },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
} as const

const ASSISTANT_SYSTEM_PROMPT = `You are the Pistola always-on editor assistant.
Return JSON only.
You help across site, structure, furnish, and cad workspaces.
Use response mode "chat" for general conversation or when the request is unsupported and you must explain the limitation plus the nearest buildable fallback.
Use response mode "clarify" when the request is missing geometry, placement, target, or selection details needed to act. Clarify with ambiguities and zero actions.
Use response mode "plan" only when you are proposing executable editor actions.
Use response mode "task-plan" when the request is broad enough that the work should be split into explicit executable steps before running it.
The request may include chatMode "ask", "create", or "refine". Respect it: "ask" favors direct explanation, "create" favors executable build or precise clarification, and "refine" favors editing the current or recent result instead of starting over.
Never exceed 25 actions.
If the full build would exceed 25 actions, return only the next executable chunk and include structured continuation metadata.
For task-plan mode, return a "steps" array where each step has a description, agent domain, and at most 25 executable actions.
Only use allowlisted action types. Do not invent new action types or fields. Any action with an unrecognized type will be rejected.
All allowed action types: ${ASSISTANT_ACTION_TYPE_ENUM.join(', ')}.
Safe immediate actions (no review required): ${assistantSafeImmediateActionTypes.join(', ')}.
Destructive actions: ${assistantDestructiveActionTypes.join(', ')}.
Agent domains: structure for shells and rooms, layout for transforms/openings/positioning, furnish for items and furniture, cad for sketches and parametric modeling, general only when no sharper domain fits.
Action field constraints (use only these exact values):
- set_phase: phase must be one of ${assistantPhaseValues.map((v) => `'${v}'`).join(', ')}
- set_mode: mode must be one of ${assistantModeValues.map((v) => `'${v}'`).join(', ')} (these are editor interaction modes, not response modes)
- set_structure_layer: layer must be one of ${assistantStructureLayerValues.map((v) => `'${v}'`).join(', ')}
- set_camera_mode: cameraMode must be one of ${assistantCameraModeValues.map((v) => `'${v}'`).join(', ')}
- set_theme: theme must be one of ${assistantThemeValues.map((v) => `'${v}'`).join(', ')}
- set_level_view_mode: levelMode must be one of ${assistantLevelViewModeValues.map((v) => `'${v}'`).join(', ')}
- set_wall_view_mode: wallMode must be one of ${assistantWallViewModeValues.map((v) => `'${v}'`).join(', ')}
- set_cad_workplane: workplane must be one of ${assistantCadWorkplaneValues.map((v) => `'${v}'`).join(', ')}
- set_transform_mode: transformMode must be one of ${assistantTransformModeValues.map((v) => `'${v}'`).join(', ')}
- set_transform_pivot: pivot must be one of ${assistantTransformPivotValues.map((v) => `'${v}'`).join(', ')}
- export_scene: format must be one of ${assistantSceneExportFormatValues.map((v) => `'${v}'`).join(', ')}
- activate_tool: tool must be one of ${assistantToolValues.map((v) => `'${v}'`).join(', ')}
- activate_tool: catalogCategory, when used, must be one of ${assistantCatalogCategoryValues.map((v) => `'${v}'`).join(', ')}
Any mutating scene plan must require review before execution.
Use catalog item ids exactly as provided in the workspace context.
Available procedural primitives for place_item: primitive-box, primitive-sphere, primitive-cylinder, primitive-cone, primitive-torus, primitive-capsule, primitive-wedge. Use them to construct compound assemblies (robots, vehicles, airplanes, furniture) when an explicit catalog model does not exist.
Use execute_cad_brief for FreeCAD interactive prismatic CAD (sketches, extrudes, simple solids) so the assistant returns a structured CAD brief. Use generate_mac_part for standalone mechanical / printable parts that need Multi-Agent-CAD (mechanisms, complex solids, print-in-place, geneva, gears, cages). Prefer generate_mac_part when the user asks for a complete engineered part rather than a sketch-based edit. Use run_cad_prompt only as a backward-compatible internal macro when you genuinely cannot translate the request into direct CAD/body actions, and never emit run_cad_prompt when assistantSession.cadMacroExpansion is true. Use extrude_cad_sketch or revolve_cad_sketch only when the user explicitly asks to operate on the active or selected CAD sketch.
If the user provides an image and asks to recreate, approximate, furnish, or model something buildable, return an executable plan or a clarification when geometry is blocked. Do not force image requests into chat-only responses.
Prefer editable approximations over fake precision when the exact asset or geometry is unavailable.
If the user asks for a vague aesthetic change such as "nice entrance", ask clarifying questions instead of mutating the scene.
When the workspace context includes assistantSession.lastError, avoid repeating the same broken target or action pattern.
When the workspace context includes assistantSession.recentReferencedNodes or assistantSession.lastCreatedNodes, use those ids before inventing new ambiguous targets.
Preferred execution order for broad builds: structure first, then layout/openings, then furnishing, then refinement.
If you return actions, the reply should briefly explain what the plan will do.
Forward references: When a plan creates a node and a later action in the same plan needs to reference it, add a "refId" field (e.g. "$ref_0") to the creating action and use that same string as the node ID in subsequent actions. Example: [{"type":"create_wall","refId":"$ref_0","levelId":"level_1","points":[[0,0],[5,0]]},{"type":"place_door","wallId":"$ref_0","position":0.5}]. The runtime resolves $ref_N to the real ID after each action executes. Only use $ref_N when the ID does not exist yet; prefer real IDs when they are available.
You have prior conversation context below. Use it to maintain continuity, refer to previous requests, and avoid repeating clarifications.`

const ASSISTANT_CHAT_SYSTEM_PROMPT = `You are the Pistola always-on editor assistant.
Answer in plain text, not JSON.
Use the workspace context, conversation history, and any attached image to answer directly.
If the user asks what is visible in the image or workspace, describe only what can be supported by the visible scene and provided context.
If the user asks about prior requests or recent results, use the conversation history and assistant session context to keep continuity.
Do not claim that scene mutations were applied unless they already happened in the prior context.
Be concise, concrete, and honest about uncertainty.`

const normalizePrompt = (prompt: string) => normalizeCadPrompt(prompt)

const formatAssistantToolLabel = (tool: (typeof assistantToolValues)[number]) =>
  tool.startsWith('cad-')
    ? tool.replace(/^cad-/, 'CAD ').replaceAll('-', ' ')
    : tool.replaceAll('-', ' ')

const parseMetricDimensions = (prompt: string) => {
  const match = normalizePrompt(prompt).match(
    /(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?/,
  )

  if (!match) return null
  return match.slice(1, 4).map((value) => Number(value)) as [number, number, number]
}

const parsePlanarMetricDimensions = (prompt: string) => {
  const threeAxis = parseMetricDimensions(prompt)
  if (threeAxis) return { width: threeAxis[0], depth: threeAxis[1], height: threeAxis[2] }

  const match = normalizePrompt(prompt).match(
    /(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?(?!\s*x)/,
  )
  if (!match) return null

  return {
    width: Number(match[1]),
    depth: Number(match[2]),
    height: null,
  }
}

const parseSingleMetricValue = (prompt: string) => {
  const match = normalizePrompt(prompt).match(/(\d+(?:\.\d+)?)\s*m\b/)
  return match ? Number(match[1]) : null
}

const parseExtrudeDirection = (normalizedPrompt: string): AssistantCadExtrudeDirection => {
  if (/\b(symmetric|symmetrical|both sides|both directions|simetrico|simetrica)\b/.test(normalizedPrompt)) {
    return 'symmetric'
  }
  if (/\b(negative|down|downward|below|abajo|negativo|negativa)\b/.test(normalizedPrompt)) {
    return 'negative'
  }
  return 'positive'
}

const parseRevolveAngle = (prompt: string) => {
  const match = normalizePrompt(prompt).match(
    /(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees|grado|grados|°)(?:\b|$)/,
  )
  return match ? Number(match[1]) : null
}

const parseRevolveAxis = (normalizedPrompt: string): AssistantCadRevolveAxis => {
  if (/\b(?:around|about|axis|eje)\s*x\b|\bx axis\b|\beje x\b/.test(normalizedPrompt)) return 'X'
  if (/\b(?:around|about|axis|eje)\s*y\b|\by axis\b|\beje y\b/.test(normalizedPrompt)) return 'Y'
  if (/\b(?:around|about|axis|eje)\s*z\b|\bz axis\b|\beje z\b/.test(normalizedPrompt)) return 'Z'
  return 'Z'
}

const parseCadWorkplane = (normalizedPrompt: string) => {
  if (/\bxy\b|\bxy plane\b|\bxy workplane\b|\bplano xy\b/.test(normalizedPrompt)) return 'XY' as const
  if (/\bxz\b|\bxz plane\b|\bxz workplane\b|\bplano xz\b/.test(normalizedPrompt)) return 'XZ' as const
  if (/\byz\b|\byz plane\b|\byz workplane\b|\bplano yz\b/.test(normalizedPrompt)) return 'YZ' as const
  if (
    /\blevel (?:plane|workplane)\b|\bnivel (?:plane|workplane)\b|\b(?:plane|workplane|plano) level\b|\b(?:plane|workplane|plano) nivel\b/.test(
      normalizedPrompt,
    )
  ) {
    return 'level' as const
  }
  return null
}

const parseRotationDegrees = (prompt: string) => {
  const match = normalizePrompt(prompt).match(
    /(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees|grado|grados|°)(?:\b|$)/,
  )
  return match ? Number(match[1]) : null
}

const parseRotationAxis = (normalizedPrompt: string): 'X' | 'Y' | 'Z' => {
  if (/\b(?:around|about|axis|eje)\s*x\b|\bx axis\b|\beje x\b/.test(normalizedPrompt)) return 'X'
  if (/\b(?:around|about|axis|eje)\s*z\b|\bz axis\b|\beje z\b/.test(normalizedPrompt)) return 'Z'
  return 'Y'
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

const parseScaleFactor = (normalizedPrompt: string) => {
  const multipleMatch = normalizedPrompt.match(/(\d+(?:\.\d+)?)\s*x\b/)
  if (multipleMatch) return Number(multipleMatch[1])

  const percentMatch = normalizedPrompt.match(/(\d+(?:\.\d+)?)\s*%/)
  if (percentMatch) return Number(percentMatch[1]) / 100

  if (/\b(double|doble)\b/.test(normalizedPrompt)) return 2
  if (/\b(half|mitad)\b/.test(normalizedPrompt)) return 0.5
  if (/\b(smaller|shrink|reduce|encoge|reduce|smaller)\b/.test(normalizedPrompt)) return 0.75
  if (/\b(bigger|larger|grow|agranda|aumenta)\b/.test(normalizedPrompt)) return 1.25
  return null
}

const parseMoveDelta = (prompt: string, normalizedPrompt: string): [number, number, number] | null => {
  const amount = parseSingleMetricValue(prompt) ?? 1

  if (/\b(left|izquierda)\b/.test(normalizedPrompt)) return [-amount, 0, 0]
  if (/\b(right|derecha)\b/.test(normalizedPrompt)) return [amount, 0, 0]
  if (/\b(up|raise|higher|arriba|sube)\b/.test(normalizedPrompt)) return [0, amount, 0]
  if (/\b(down|lower|below|baja)\b/.test(normalizedPrompt)) return [0, -amount, 0]
  if (/\bpositive x\b|\bx positive\b|\balong x\b|\bon x\b/.test(normalizedPrompt)) return [amount, 0, 0]
  if (/\bnegative x\b|\bx negative\b/.test(normalizedPrompt)) return [-amount, 0, 0]
  if (/\bpositive y\b|\by positive\b|\balong y\b|\bon y\b/.test(normalizedPrompt)) return [0, amount, 0]
  if (/\bnegative y\b|\by negative\b/.test(normalizedPrompt)) return [0, -amount, 0]
  if (/\bpositive z\b|\bz positive\b|\balong z\b|\bon z\b/.test(normalizedPrompt)) return [0, 0, amount]
  if (/\bnegative z\b|\bz negative\b/.test(normalizedPrompt)) return [0, 0, -amount]

  return null
}

const cadOperationKinds = [
  'extrude',
  'revolve',
  'boolean',
  'boolean_union',
  'boolean_cut',
  'boolean_intersect',
  'fillet',
  'chamfer',
] as const
type CadOperationKind = (typeof cadOperationKinds)[number]

const parseCadOperationKind = (normalizedPrompt: string): CadOperationKind | null => {
  if (/\b(fillet|round|rounded|redondea|redondeado)\b/.test(normalizedPrompt)) return 'fillet'
  if (/\b(chamfer|bevel|bisel)\b/.test(normalizedPrompt)) return 'chamfer'
  if (/\b(cut|subtract|difference|resta)\b/.test(normalizedPrompt)) return 'boolean_cut'
  if (/\b(intersect|common|overlap|interseccion)\b/.test(normalizedPrompt)) return 'boolean_intersect'
  if (/\b(union|join|combine|merge|join them)\b/.test(normalizedPrompt)) return 'boolean_union'
  if (/\bboolean\b/.test(normalizedPrompt)) return 'boolean'
  if (/\b(extrude|pad|extruir)\b/.test(normalizedPrompt)) return 'extrude'
  if (/\b(revolve|gira|spin|lathe|revoluciona)\b/.test(normalizedPrompt)) return 'revolve'
  return null
}

const parseCadBoxFace = (normalizedPrompt: string) => {
  if (/\bbottom\b|\bbase\b|\bunderside\b|\binferior\b/.test(normalizedPrompt)) return 'bottom' as const
  if (/\bleft\b|\bizquierda\b/.test(normalizedPrompt)) return 'left' as const
  if (/\bright\b|\bderecha\b/.test(normalizedPrompt)) return 'right' as const
  if (/\bfront\b|\bfrontal\b|\bdelantera\b/.test(normalizedPrompt)) return 'front' as const
  if (/\bback\b|\brear\b|\bposterior\b|\btrasera\b/.test(normalizedPrompt)) return 'back' as const
  return 'top' as const
}

const resolveCadOperationTarget = (
  body: SelectedCadBodyContext,
  normalizedPrompt: string,
): SelectedCadBodyContext['operations'][number] | null => {
  const operations = body.operations
  if (operations.length === 0) return null

  const operationKind = parseCadOperationKind(normalizedPrompt)
  const matchingOperations = operationKind
    ? operations.filter((operation) =>
      operationKind === 'boolean'
        ? operation.kind === 'boolean' ||
        operation.kind === 'boolean_union' ||
        operation.kind === 'boolean_cut' ||
        operation.kind === 'boolean_intersect'
        : operation.kind === operationKind,
    )
    : operations

  if (matchingOperations.length === 1) {
    return matchingOperations[0] ?? null
  }

  if (/\b(last|latest|most recent|ultimo|ultima|reciente)\b/.test(normalizedPrompt)) {
    return matchingOperations[matchingOperations.length - 1] ?? null
  }

  return operationKind ? matchingOperations[matchingOperations.length - 1] ?? null : null
}

const getSelectionContext = (context: AssistantPlanRequest['context']): AssistantSelectionContext => {
  const selection =
    context && typeof context.selection === 'object' && context.selection !== null
      ? (context.selection as Record<string, unknown>)
      : null

  return {
    buildingId: typeof selection?.buildingId === 'string' ? selection.buildingId : null,
    levelId: typeof selection?.levelId === 'string' ? selection.levelId : null,
    zoneId: typeof selection?.zoneId === 'string' ? selection.zoneId : null,
    selectedIds: Array.isArray(selection?.selectedIds)
      ? selection.selectedIds.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

type SelectedCadBodyContext = {
  id: string
  operations: Array<{
    id: string
    kind: string
    suppressed: boolean
  }>
}

type SelectedCadSketchContext = {
  id: string
  closedProfileCount: number | null
}

type AssistantCatalogItemContext = {
  id: string
  name: string
  category: string
  attachTo: string | null
  tags: string[]
}

const hasSelectedCadBody = (context: AssistantPlanRequest['context']) => {
  const selectedNodeSummary =
    context && Array.isArray(context.selectedNodeSummary)
      ? context.selectedNodeSummary
      : []

  return selectedNodeSummary.some((item: unknown) => {
    if (!item || typeof item !== 'object') return false
    const record = item as Record<string, unknown>
    return record.type === 'cad-body'
  })
}

const getSelectedCadBodies = (context: AssistantPlanRequest['context']): SelectedCadBodyContext[] => {
  const selectedNodeSummary =
    context && Array.isArray(context.selectedNodeSummary)
      ? context.selectedNodeSummary
      : []

  return selectedNodeSummary.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return record.type === 'cad-body' && typeof record.id === 'string'
      ? [
        {
          id: record.id,
          operations: Array.isArray(record.operations)
            ? record.operations.flatMap((operation: unknown) => {
              if (!operation || typeof operation !== 'object') return []
              const operationRecord = operation as Record<string, unknown>
              return typeof operationRecord.id === 'string' && typeof operationRecord.kind === 'string'
                ? [
                  {
                    id: operationRecord.id,
                    kind: operationRecord.kind,
                    suppressed: Boolean(operationRecord.suppressed),
                  },
                ]
                : []
            })
            : [],
        },
      ]
      : []
  })
}

const parseCadSketchSummary = (value: unknown): SelectedCadSketchContext | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.type !== 'cad-sketch' || typeof record.id !== 'string') return null

  return {
    id: record.id,
    closedProfileCount: Array.isArray(record.closedProfileEntityIds)
      ? record.closedProfileEntityIds.length
      : null,
  }
}

const getCadSketchSummaries = (context: AssistantPlanRequest['context']) => {
  const sources = [
    ...(context && Array.isArray(context.selectedNodeSummary) ? context.selectedNodeSummary : []),
    ...(context && Array.isArray(context.sceneSummary) ? context.sceneSummary : []),
  ]
  const seen = new Set<string>()
  const sketches: SelectedCadSketchContext[] = []

  for (const source of sources) {
    const sketch = parseCadSketchSummary(source)
    if (!sketch || seen.has(sketch.id)) continue
    seen.add(sketch.id)
    sketches.push(sketch)
  }

  return sketches
}

const getActiveCadSketchId = (context: AssistantPlanRequest['context']) => {
  if (!context || typeof context !== 'object') return null
  const cad =
    'cad' in context && typeof context.cad === 'object' && context.cad !== null
      ? (context.cad as Record<string, unknown>)
      : null
  return typeof cad?.activeSketchId === 'string' ? cad.activeSketchId : null
}

const getSelectedCadSketch = (context: AssistantPlanRequest['context']): SelectedCadSketchContext | null => {
  const activeSketchId = getActiveCadSketchId(context)
  const sketches = getCadSketchSummaries(context)

  if (activeSketchId) {
    return sketches.find((sketch) => sketch.id === activeSketchId) ?? {
      id: activeSketchId,
      closedProfileCount: null,
    }
  }

  return sketches[0] ?? null
}

const getNodeSummaries = (context: AssistantPlanRequest['context']) => [
  ...getAssistantSessionNodeSummaries(context),
  ...(context && Array.isArray(context.selectedNodeSummary) ? context.selectedNodeSummary : []),
  ...(context && Array.isArray(context.sceneSummary) ? context.sceneSummary : []),
]

const getCatalogItems = (context: AssistantPlanRequest['context']): AssistantCatalogItemContext[] =>
  context && Array.isArray(context.catalog)
    ? context.catalog.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      return typeof record.id === 'string' &&
        typeof record.name === 'string' &&
        typeof record.category === 'string'
        ? [
          {
            id: record.id,
            name: record.name,
            category: record.category,
            attachTo: typeof record.attachTo === 'string' ? record.attachTo : null,
            tags: Array.isArray(record.tags)
              ? record.tags.filter((tag): tag is string => typeof tag === 'string')
              : [],
          },
        ]
        : []
    })
    : []

const normalizeSearchValue = (value: string) =>
  normalizePrompt(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const describeResolvedTargetAssumption = (
  selectedTarget: SelectedTargetContext,
  actionLabel: string,
  resolutionSource: AssistantTargetResolutionSource | null,
) => {
  if (resolutionSource === 'explicit-id' || resolutionSource === 'named-target') {
    return `Using "${selectedTarget.name ?? selectedTarget.id}" as the ${actionLabel} target.`
  }

  if (resolutionSource === 'last-created') {
    return `Using the most recently assistant-created ${selectedTarget.type} as the ${actionLabel} target.`
  }

  if (resolutionSource === 'recent-reference') {
    return `Using the most recently referenced ${selectedTarget.type} as the ${actionLabel} target.`
  }

  if (resolutionSource === 'image-annotation') {
    return `Using "${selectedTarget.name ?? selectedTarget.id}" from the annotated uploaded screenshot as the ${actionLabel} target.`
  }

  if (resolutionSource === 'image-region') {
    return `Using "${selectedTarget.name ?? selectedTarget.id}" from the highlighted uploaded screenshot region as the ${actionLabel} target.`
  }

  return `Using the selected ${selectedTarget.type} as the ${actionLabel} target.`
}

const getTargetResolutionMetadata = ({
  explanation,
  imageInterpretation,
  targetCandidates,
}: {
  explanation?: string | null
  imageInterpretation?: AssistantTurnResult['imageInterpretation'] | null
  targetCandidates?: AssistantTurnResult['targetCandidates'] | null
}): Partial<AssistantTurnMetadata> => ({
  ...(explanation ? { targetingExplanation: explanation } : {}),
  ...(targetCandidates && targetCandidates.length > 0 ? { targetCandidates } : {}),
  ...(imageInterpretation ? { imageInterpretation } : {}),
})

const getDefaultSnapshotTargetId = (selection: AssistantSelectionContext) => {
  if (selection.selectedIds.length === 1) return selection.selectedIds[0] ?? null
  if (selection.zoneId) return selection.zoneId
  if (selection.levelId) return selection.levelId
  return null
}

const centerPlacementTargetTypes = new Set(['zone', 'slab', 'ceiling', 'wall', 'level', 'site'])

const getPlacementTargetId = (
  context: AssistantPlanRequest['context'],
  selection: AssistantSelectionContext,
  selectedTarget: SelectedTargetContext | null,
) => {
  if (selectedTarget && centerPlacementTargetTypes.has(selectedTarget.type)) {
    return selectedTarget.id
  }

  if (selection.zoneId) return selection.zoneId

  const nodeSummaries = getAssistantTargetSummaries(context as Record<string, unknown> | undefined)
  const zoneTargets = nodeSummaries.filter((node) => node.type === 'zone')

  if (zoneTargets.length === 1) {
    return zoneTargets[0]?.id ?? null
  }

  if (selection.levelId) return selection.levelId
  return null
}

/**
 * Matches a normalized catalog term against a normalized prompt on whole-word
 * boundaries.
 *
 * Both sides are already lowercase, space-separated word sequences (see
 * `normalizeSearchValue`), so this compares word by word rather than by raw
 * substring. Substring matching made short tags match inside unrelated words:
 * the tag "wall" matched the "walls" in "add a 4m x 4m room with walls", which
 * resolved a room-building request to the first wall-mounted catalog item.
 */
const matchesNormalizedTerm = (normalizedPrompt: string, term: string) => {
  const termWords = term.split(' ').filter(Boolean)
  if (termWords.length === 0) return false

  const promptWords = normalizedPrompt.split(' ').filter(Boolean)

  return promptWords.some((_, start) =>
    termWords.every((termWord, offset) => promptWords[start + offset] === termWord),
  )
}

const scoreCatalogItemMatch = (
  item: AssistantCatalogItemContext,
  normalizedPrompt: string,
) => {
  const idTerm = normalizeSearchValue(item.id)
  const nameTerm = normalizeSearchValue(item.name)
  const categoryTerm = normalizeSearchValue(item.category)
  const tagTerms = item.tags.map(normalizeSearchValue).filter(Boolean)
  const matchedTerms = [idTerm, nameTerm, categoryTerm, ...tagTerms].filter(
    (term) => term.length >= 3 && matchesNormalizedTerm(normalizedPrompt, term),
  )

  if (matchedTerms.length === 0) return -1

  const bestLength = Math.max(...matchedTerms.map((term) => term.length))
  const exactIdBoost = matchesNormalizedTerm(normalizedPrompt, idTerm) ? 40 : 0
  const exactNameBoost = matchesNormalizedTerm(normalizedPrompt, nameTerm) ? 30 : 0
  const tagBoost = matchedTerms.some((term) => tagTerms.includes(term)) ? 10 : 0

  return bestLength + exactIdBoost + exactNameBoost + tagBoost
}

const findCatalogItemFromPrompt = (
  context: AssistantPlanRequest['context'],
  normalizedPrompt: string,
) => {
  const catalogItems = getCatalogItems(context)
  let bestMatch: AssistantCatalogItemContext | null = null
  let bestScore = -1

  for (const item of catalogItems) {
    const score = scoreCatalogItemMatch(item, normalizedPrompt)
    if (score <= bestScore) continue
    bestScore = score
    bestMatch = item
  }

  return bestMatch
}

type AssistantNodeRecord = {
  id: string
  type: string
  name: string | null
  parentId: string | null
  record: Record<string, unknown>
}

const withRefId = <T extends AssistantAction>(action: T, refId: string) =>
  ({ ...action, refId }) as T

const parseAssistantNodeRecord = (value: unknown): AssistantNodeRecord | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.type !== 'string') return null

  return {
    id: record.id,
    type: record.type,
    name:
      typeof record.name === 'string'
        ? record.name
        : record.asset && typeof record.asset === 'object' && record.asset !== null && typeof (record.asset as Record<string, unknown>).name === 'string'
          ? ((record.asset as Record<string, unknown>).name as string)
          : null,
    parentId: typeof record.parentId === 'string' ? record.parentId : null,
    record,
  }
}

const getAssistantNodeRecords = (context: AssistantPlanRequest['context']) => {
  const seen = new Set<string>()
  return getNodeSummaries(context)
    .map(parseAssistantNodeRecord)
    .filter((node): node is AssistantNodeRecord => Boolean(node))
    .filter((node) => {
      if (seen.has(node.id)) return false
      seen.add(node.id)
      return true
    })
}

const getAssistantNodeRecordById = (
  context: AssistantPlanRequest['context'],
  nodeId: string | null | undefined,
) =>
  typeof nodeId === 'string'
    ? getAssistantNodeRecords(context).find((node) => node.id === nodeId) ?? null
    : null

const getReplacementPrompt = (normalizedPrompt: string) => {
  const replacementMatch = normalizedPrompt.match(
    /\b(?:replace|swap|switch out|cambia|cambiar|reemplaza|reemplazar|sustituye|sustituir)\b[\s\S]*?\b(?:with|for|to|por|con)\b\s+(.+)$/,
  )
  return replacementMatch?.[1]?.trim() || normalizedPrompt
}

const roomKeywordMap = [
  { key: 'living-room', aliases: ['living room', 'livingroom', 'living', 'salon', 'sala'] },
  { key: 'kitchen', aliases: ['kitchen', 'cocina'] },
  { key: 'bedroom', aliases: ['bedroom', 'bed room', 'habitacion', 'habitación', 'dormitorio', 'cuarto'] },
  { key: 'bathroom', aliases: ['bathroom', 'bath room', 'bano', 'baño'] },
  { key: 'dining', aliases: ['dining room', 'dining', 'comedor'] },
  { key: 'studio', aliases: ['studio', 'estudio', 'atelier'] },
] as const

const getPromptRoomKind = (normalizedPrompt: string) =>
  roomKeywordMap.find((entry) => entry.aliases.some((alias) => normalizedPrompt.includes(alias))) ?? null

const findZoneByPrompt = (
  context: AssistantPlanRequest['context'],
  normalizedPrompt: string,
) => {
  const roomKind = getPromptRoomKind(normalizedPrompt)
  if (!roomKind) return null

  const zones = getAssistantNodeRecords(context).filter((node) => node.type === 'zone')
  const matches = zones.filter((zone) => {
    const normalizedName = normalizeSearchValue(zone.name ?? '')
    return roomKind.aliases.some((alias) => normalizedName.includes(alias))
  })

  return matches.length === 1 ? matches[0] : null
}

const getNodePosition = (node: AssistantNodeRecord): [number, number, number] | null => {
  const { position } = node.record
  return Array.isArray(position) && position.length === 3
    ? (position as [number, number, number])
    : null
}

const getNodePolygon = (node: AssistantNodeRecord): Array<[number, number]> | null => {
  const polygon = node.record.polygon
  return Array.isArray(polygon)
    ? (polygon as Array<[number, number]>)
    : polygon && typeof polygon === 'object' && Array.isArray((polygon as Record<string, unknown>).points)
      ? ((polygon as Record<string, unknown>).points as Array<[number, number]>)
      : null
}

const getNodeNumber = (node: AssistantNodeRecord, key: string): number | null => {
  const value = node.record[key]
  return typeof value === 'number' ? value : null
}

const getNodePoint2 = (node: AssistantNodeRecord, key: string): [number, number] | null => {
  const value = node.record[key]
  return Array.isArray(value) && value.length === 2 ? (value as [number, number]) : null
}

const getAssetRecord = (node: AssistantNodeRecord) =>
  node.record.asset && typeof node.record.asset === 'object'
    ? (node.record.asset as Record<string, unknown>)
    : null

const findUniqueItemMatch = (
  context: AssistantPlanRequest['context'],
  normalizedPrompt: string,
) => {
  const candidates = getAssistantNodeRecords(context).filter((node) => node.type === 'item')
  const matches = candidates.filter((candidate) => {
    const asset = getAssetRecord(candidate)
    const fields = [
      candidate.name ?? '',
      typeof asset?.id === 'string' ? asset.id : '',
      typeof asset?.name === 'string' ? asset.name : '',
    ]
    return fields.some((field) => {
      const normalizedField = normalizeSearchValue(field)
      return normalizedField.length >= 3 && normalizedPrompt.includes(normalizedField)
    })
  })

  return matches.length === 1 ? matches[0] : null
}

const getWindowNodes = (context: AssistantPlanRequest['context']) =>
  getAssistantNodeRecords(context).filter((node) => node.type === 'window')

const getWallNodes = (context: AssistantPlanRequest['context']) =>
  getAssistantNodeRecords(context).filter((node) => node.type === 'wall')

const getStructureEnvelopeNodes = (context: AssistantPlanRequest['context']) =>
  getAssistantNodeRecords(context).filter((node) =>
    node.type === 'zone' || node.type === 'slab' || node.type === 'ceiling',
  )

const getReferenceTarget = (
  context: AssistantPlanRequest['context'],
  selectedTarget: SelectedTargetContext | null,
) => {
  if (selectedTarget && (selectedTarget.type === 'guide' || selectedTarget.type === 'scan')) {
    return selectedTarget
  }

  const references = getAssistantNodeRecords(context).filter(
    (node) => node.type === 'guide' || node.type === 'scan',
  )
  return references.length === 1 ? references[0] : null
}

const calculateLevelBoundingBox = (
  nodes: AssistantNodeRecord[],
  levelId: string,
) => {
  const levelNodes = nodes.filter((node) => node.parentId === levelId || node.id === levelId)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false

  for (const node of levelNodes) {
    const polygon = getNodePolygon(node)
    if (polygon) {
      for (const [x, y] of polygon) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        found = true
      }
    }
  }

  return found ? { minX, minY, maxX, maxY } : null
}

const getRecipeLevelTarget = (
  context: AssistantPlanRequest['context'],
  selection: AssistantSelectionContext,
) => {
  if (selection.levelId) {
    return { levelId: selection.levelId, levelRefId: null, actions: [] as AssistantAction[] }
  }

  const buildingId =
    selection.buildingId ??
    (context &&
      typeof context.buildingSummary === 'object' &&
      context.buildingSummary !== null &&
      typeof (context.buildingSummary as Record<string, unknown>).id === 'string'
      ? ((context.buildingSummary as Record<string, unknown>).id as string)
      : null)

  if (!buildingId) {
    const buildingRefId = '$ref_building_0'
    const levelRefId = '$ref_level_0'
    return {
      levelId: levelRefId,
      levelRefId,
      actions: [
        withRefId({ type: 'create_building', name: 'Building 1' }, buildingRefId),
        withRefId({ type: 'create_level', buildingId: buildingRefId, name: 'Level 0', level: 0 }, levelRefId),
      ],
    }
  }

  const levelRefId = '$ref_level_0'
  return {
    levelId: levelRefId,
    levelRefId,
    actions: [withRefId({ type: 'create_level', buildingId, name: 'Level 0', level: 0 }, levelRefId)],
  }
}

const CREATION_REQUEST_PATTERN = /\b(create|build|make|generate|crea[\p{L}]*|construye[\p{L}]*|haz[\p{L}]*|genera[\p{L}]*|diseña[\p{L}]*|arma[\p{L}]*)\b/u
const HOUSE_NOUN_PATTERN = /\b(house|home|casa[\p{L}\p{N}_-]*|casita[\p{L}\p{N}_-]*)\b/u
const PET_SHELTER_NOUN_PATTERN =
  /\b(casa[\p{L}\p{N}_-]*|casita[\p{L}\p{N}_-]*|house|home|shelter|refugio|kennel|dog ?house|doghouse|pet house)\b/u
const FULL_HOUSE_PROGRAM_PATTERN =
  /\b(dream house|family house|living room|kitchen|bed(room)?s?|bath(room)?s?|dining room|garage|hallway|stairs?|rooms?|floor plan|plano)\b/u
const EXECUTION_INTENT_PATTERN =
  /\b(create|build|make|generate|add|place|switch|set|move|rename|delete|edit|remove|furnish|refine|adjust|change|resize|scale|extrude|revolve|focus|export|select|open|close|activate|run|recreate|approximate|model|crea[\p{L}]*|construye[\p{L}]*|haz[\p{L}]*|genera[\p{L}]*|agrega[\p{L}]*|coloca[\p{L}]*|cambia[\p{L}]*|pon[\p{L}]*|mueve[\p{L}]*|renombra[\p{L}]*|borra[\p{L}]*|edita[\p{L}]*|refina[\p{L}]*|ajusta[\p{L}]*|extruye[\p{L}]*|revoluciona[\p{L}]*|exporta[\p{L}]*|recrea[\p{L}]*|modela[\p{L}]*)\b/u
const INFORMATIONAL_PROMPT_PATTERN =
  /\b(what|what's|whats|waht|where|which|who|why|how|is|are|does|do|did|explain|describe|tell me|que|qué|cual|cuál|donde|dónde|como|cómo|por que|por qué)\b/u
const IMAGE_SPATIAL_QUESTION_PATTERN =
  /\b(middle|center|centre|left|right|top|bottom|inside|outside|front|back|en medio|centro|izquierda|derecha|arriba|abajo)\b/u

const isBroadHouseProgramPrompt = (normalizedPrompt: string) =>
  FULL_HOUSE_PROGRAM_PATTERN.test(normalizedPrompt) &&
  (/\b(house|home|casa|hogar)\b/u.test(normalizedPrompt) || /\bdream house\b/u.test(normalizedPrompt))

const buildLevelScaffoldTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
) => {
  const shouldCreateLevel =
    /\b(level|floor|planta|piso)\b/.test(normalizedPrompt) &&
    /\b(create|add|make|new|another|crea|agrega|haz|nuevo|otra)\b/.test(normalizedPrompt) &&
    !/\b(room|zone|space|house|home|casa|sala|habitacion|habitación|cuarto|dormitorio|kitchen|cocina|bathroom|bano|baño)\b/.test(
      normalizedPrompt,
    )

  if (!shouldCreateLevel) return null

  const buildingId =
    selection.buildingId ??
    (body.context &&
      typeof body.context.buildingSummary === 'object' &&
      body.context.buildingSummary !== null &&
      typeof (body.context.buildingSummary as Record<string, unknown>).id === 'string'
      ? ((body.context.buildingSummary as Record<string, unknown>).id as string)
      : null)

  if (!buildingId) {
    return buildClarifyTurn('I need a building target before I can add a new level.', [
      'Select a building first so I know where to place the new level scaffold.',
    ])
  }

  const levelIndexMatch = normalizedPrompt.match(/\b(?:level|floor|planta|piso)\s*(\d+)\b/)
  const requestedLevel = levelIndexMatch ? Number(levelIndexMatch[1]) : undefined
  const levelLabel = typeof requestedLevel === 'number' ? `Level ${requestedLevel}` : 'Next Level'

  return buildReviewPlanTurn(
    'I can add a new editable level scaffold to the current building.',
    [
      {
        type: 'create_level',
        buildingId,
        ...(typeof requestedLevel === 'number' ? { level: requestedLevel } : {}),
        name: levelLabel,
      },
    ],
    ['Using the current building as the parent for the new level scaffold.'],
  )
}

const buildRoomRecipeTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
) => {
  const roomRequest =
    /\b(room|zone|space|studio|estudio|sala|habitacion|habitación|cuarto|dormitorio|cocina|bathroom|bano|baño)\b/.test(
      normalizedPrompt,
    ) && CREATION_REQUEST_PATTERN.test(normalizedPrompt)

  if (!roomRequest || HOUSE_NOUN_PATTERN.test(normalizedPrompt) || /\b(reception|lobby|lounge)\b/.test(normalizedPrompt)) return null

  const target = getRecipeLevelTarget(body.context, selection)
  if (!target) {
    return buildClarifyTurn('I need a building or level target before I can create a room.', [
      'Select a building or level first so I know where to place the generated room.',
    ])
  }

  const requestedDimensions = parsePlanarMetricDimensions(body.prompt)
  const width = requestedDimensions?.width ?? (/\bsmall|pequena|pequeña\b/.test(normalizedPrompt) ? 3.6 : 4)
  const depth = requestedDimensions?.depth ?? (/\bsmall|pequena|pequeña\b/.test(normalizedPrompt) ? 3.6 : 4)
  const wallHeight = requestedDimensions?.height ?? 2.7
  const roomKind = getPromptRoomKind(normalizedPrompt)
  const roomName =
    roomKind?.key === 'living-room'
      ? 'Living Room'
      : roomKind?.key === 'kitchen'
        ? 'Kitchen'
        : roomKind?.key === 'bedroom'
          ? 'Bedroom'
          : roomKind?.key === 'bathroom'
            ? 'Bathroom'
            : roomKind?.key === 'dining'
              ? 'Dining Room'
              : roomKind?.key === 'studio'
                ? 'Studio'
                : 'Room'
  const levelId = target.levelId
  const wantsRoof = /\broof|techo\b/.test(normalizedPrompt)
  const wantsCeiling = wantsRoof || /\bceiling|cielo\b/.test(normalizedPrompt)
  const wantsDoor = /\bdoor|puerta\b/.test(normalizedPrompt)
  const wantsWindow = /\bwindow|windows|ventana|ventanas\b/.test(normalizedPrompt)
  const wantsSouthWall = /\b(south( wall)?|pared sur)\b/.test(normalizedPrompt)
  const wantsLargeWindow = /\b(large|big|grandes?|amplias?)\b/.test(normalizedPrompt)
  const isOakOrWood = /\b(oak|wood|madera|roble|parquet)\b/.test(normalizedPrompt)
  const slabName = isOakOrWood ? `${roomName} Oak Floor Slab` : `${roomName} Slab`

  const windowWallId = wantsSouthWall ? '$ref_room_wall_0' : '$ref_room_wall_2'
  const windowWidth = wantsLargeWindow
    ? Math.min(3.0, Number((width * 0.4).toFixed(3)))
    : Math.min(1.5, Number((width * 0.35).toFixed(3)))
  const windowHeight = wantsLargeWindow ? 1.6 : 1.2
  const windowY = wantsLargeWindow ? 1.1 : 1.4

  const polygon = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ] as Array<[number, number]>

  const actions: AssistantAction[] = [
    ...target.actions,
    withRefId(
      {
        type: 'create_zone',
        levelId,
        name: roomName,
        polygon,
        color: isOakOrWood ? '#b45309' : '#eab308',
      },
      '$ref_zone_room',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [0, 0], end: [width, 0], height: wallHeight, thickness: 0.15 },
      '$ref_room_wall_0',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [width, 0], end: [width, depth], height: wallHeight, thickness: 0.15 },
      '$ref_room_wall_1',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [width, depth], end: [0, depth], height: wallHeight, thickness: 0.15 },
      '$ref_room_wall_2',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [0, depth], end: [0, 0], height: wallHeight, thickness: 0.15 },
      '$ref_room_wall_3',
    ),
    { type: 'create_slab', levelId, name: slabName, polygon },
    ...(wantsCeiling ? [{ type: 'create_ceiling' as const, levelId, name: `${roomName} Ceiling`, polygon, height: wallHeight }] : []),
    ...(wantsRoof ? [{ type: 'create_roof' as const, levelId, name: `${roomName} Roof`, corner1: [0, 0] as [number, number], corner2: [width, depth] as [number, number], height: 1.4 }] : []),
    ...(wantsDoor
      ? [{ type: 'place_door' as const, wallId: wantsSouthWall ? '$ref_room_wall_2' : '$ref_room_wall_0', localX: Number((width * 0.3).toFixed(3)), width: 0.9, height: 2.1 }]
      : []),
    ...(wantsWindow
      ? [{ type: 'place_window' as const, wallId: windowWallId, localX: Number((width * 0.5).toFixed(3)), localY: windowY, width: windowWidth, height: windowHeight }]
      : []),
  ]

  const assumptions = [
    requestedDimensions
      ? `Using the requested editable room footprint of ${width} m x ${depth} m.`
      : `Using a default prototype room footprint of ${width} m x ${depth} m because exact dimensions were not provided.`,
    `Using a standard wall height of ${wallHeight} m.`,
    ...(isOakOrWood ? ['Configured slab with natural oak finish.'] : []),
    ...(wantsSouthWall && wantsWindow ? ['Positioned large windows on the south wall ($ref_room_wall_0).'] : []),
  ]

  return buildReviewPlanTurn(
    'I can create a rectangular editable room with structure and basic envelope elements.',
    actions,
    assumptions,
  )
}

const buildPetHouseRecipeTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
) => {
  const mentionsPetTarget = /\b(perro|mascota|pet|dog)\b/.test(normalizedPrompt)
  const mentionsShelter = PET_SHELTER_NOUN_PATTERN.test(normalizedPrompt)
  const mentionsPrimaryHouseProgram = isBroadHouseProgramPrompt(normalizedPrompt)
  const petHouseRequest =
    CREATION_REQUEST_PATTERN.test(normalizedPrompt) && mentionsPetTarget && mentionsShelter

  if (!petHouseRequest || mentionsPrimaryHouseProgram) return null

  const target = getRecipeLevelTarget(body.context, selection)
  if (!target) {
    return buildClarifyTurn('I need a building or level target before I can create a pet house.', [
      'Select a building or level first so I know where to place the generated shelter.',
    ])
  }

  const requestedDimensions = parsePlanarMetricDimensions(body.prompt)
  const wantsCompact = /\b(small|compact|mini|pequena|pequeña)\b/.test(normalizedPrompt)
  const wantsLarge = /\b(large|big|grande)\b/.test(normalizedPrompt)
  const width = Number(
    (requestedDimensions?.width ?? (wantsCompact ? 0.9 : wantsLarge ? 1.5 : 1.2)).toFixed(3),
  )
  const depth = Number(
    (requestedDimensions?.depth ?? (wantsCompact ? 1.0 : wantsLarge ? 1.8 : 1.4)).toFixed(3),
  )
  const wallHeight = Number((requestedDimensions?.height ?? (wantsLarge ? 1.0 : 0.8)).toFixed(3))
  const roofHeight = Number((Math.max(0.4, wallHeight * 0.6)).toFixed(3))
  const levelId = target.levelId

  // Smarter placement: Find the bounding box of the level and place the dog house to the right
  const nodes = getAssistantNodeRecords(body.context)
  const levelBBox = levelId ? calculateLevelBoundingBox(nodes, levelId) : null
  const offsetX = levelBBox ? levelBBox.maxX + 3 : 0
  const offsetY = levelBBox ? (levelBBox.minY + levelBBox.maxY) / 2 - depth / 2 : 0

  const polygon = [
    [offsetX, offsetY],
    [offsetX + width, offsetY],
    [offsetX + width, offsetY + depth],
    [offsetX, offsetY + depth],
  ] as Array<[number, number]>

  const wallThickness = 0.05
  const wallColor = '#92400e' // Wooden brown
  const roofColor = '#14532d' // Dark green

  const actions: AssistantAction[] = [
    ...target.actions,
    withRefId(
      {
        type: 'create_zone',
        levelId,
        name: 'Dog House',
        polygon,
        color: '#fde68a', // Light sand/wood
      },
      '$ref_pet_house_zone',
    ),
    // Left wall
    withRefId(
      { type: 'create_wall', levelId, start: [offsetX, offsetY], end: [offsetX, offsetY + depth], height: wallHeight, thickness: wallThickness },
      '$ref_pet_house_wall_left',
    ),
    // Back wall
    withRefId(
      {
        type: 'create_wall',
        levelId,
        start: [offsetX, offsetY + depth],
        end: [offsetX + width, offsetY + depth],
        height: wallHeight,
        thickness: wallThickness,
      },
      '$ref_pet_house_wall_back',
    ),
    // Right wall
    withRefId(
      {
        type: 'create_wall',
        levelId,
        start: [offsetX + width, offsetY + depth],
        end: [offsetX + width, offsetY],
        height: wallHeight,
        thickness: wallThickness,
      },
      '$ref_pet_house_wall_right',
    ),
    // Front wall (the missing one!)
    withRefId(
      {
        type: 'create_wall',
        levelId,
        start: [offsetX + width, offsetY],
        end: [offsetX, offsetY],
        height: wallHeight,
        thickness: wallThickness,
      },
      '$ref_pet_house_wall_front',
    ),
    { type: 'create_slab', levelId, name: 'Dog House Slab', polygon },
    { type: 'create_roof', levelId, name: 'Dog House Roof', corner1: [offsetX, offsetY], corner2: [offsetX + width, offsetY + depth], height: roofHeight },
    // Add the entrance door
    { type: 'place_door', wallId: '$ref_pet_house_wall_front', localX: width / 2, width: width * 0.45, height: wallHeight * 0.7 },
    // Add the little gable window
    { type: 'place_window', wallId: '$ref_pet_house_wall_front', localX: width / 2, localY: wallHeight * 0.85, width: width * 0.25, height: wallHeight * 0.25 },
  ]

  const assumptions = [
    requestedDimensions
      ? `Using the requested pet-house footprint of ${width} m x ${depth} m.`
      : `Using a compact editable pet-house footprint of ${width} m x ${depth} m.`,
    `Placed 3 meters to the right of existing structures to avoid overlap.`,
    `Added a front wall with a door and a gable window to match your reference image.`,
  ]

  return buildReviewPlanTurn(
    'I can create a detailed wooden dog house outside your main building.',
    actions,
    assumptions,
  )
}

const buildHouseShellRecipeTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
) => {
  const houseRequest =
    HOUSE_NOUN_PATTERN.test(normalizedPrompt) && CREATION_REQUEST_PATTERN.test(normalizedPrompt)

  if (!houseRequest) return null

  const target = getRecipeLevelTarget(body.context, selection)
  if (!target) {
    return buildClarifyTurn('I need a building or level target before I can create a house shell.', [
      'Select a building or level first so I know where to place the generated structure.',
    ])
  }

  const levelId = target.levelId
  const assumptions = [
    'Using a compact prototype-grade layout with editable rectangular rooms.',
    'Approximating the house shell with standard room proportions and simple openings.',
  ]

  const isTwoBedroom = /\b(two|2)\s*[- ]?\s*bed(room)?\b|\bdos\b.*\bhabitaciones?\b/.test(
    normalizedPrompt,
  )
  const wantsKitchen = /\bkitchen|cocina\b/.test(normalizedPrompt)
  const wantsLiving = /\bliving room|living|salon|sala\b/.test(normalizedPrompt)
  const wantsFurnishingBundle = /\b(furnish|furnished|furniture|amuebla|amueblada)\b/.test(
    normalizedPrompt,
  )
  const zoneSpecs = [
    {
      name: wantsLiving ? 'Living Room' : 'Main Room',
      polygon: [
        [0, 0],
        [4.4, 0],
        [4.4, 4],
        [0, 4],
      ] as Array<[number, number]>,
    },
    {
      name: wantsKitchen ? 'Kitchen' : 'Service',
      polygon: [
        [4.4, 0],
        [8, 0],
        [8, 4],
        [4.4, 4],
      ] as Array<[number, number]>,
    },
    ...(isTwoBedroom
      ? [
        {
          name: 'Bedroom 1',
          polygon: [
            [0, 4],
            [4, 4],
            [4, 7.2],
            [0, 7.2],
          ] as Array<[number, number]>,
        },
        {
          name: 'Bedroom 2',
          polygon: [
            [4, 4],
            [8, 4],
            [8, 7.2],
            [4, 7.2],
          ] as Array<[number, number]>,
        },
      ]
      : []),
  ]

  const wallSpecs = [
    { start: [0, 0] as [number, number], end: [8, 0] as [number, number], refId: '$ref_wall_0' },
    { start: [8, 0] as [number, number], end: [8, 7.2] as [number, number], refId: '$ref_wall_1' },
    { start: [8, 7.2] as [number, number], end: [0, 7.2] as [number, number], refId: '$ref_wall_2' },
    { start: [0, 7.2] as [number, number], end: [0, 0] as [number, number], refId: '$ref_wall_3' },
    { start: [4.4, 0] as [number, number], end: [4.4, 4] as [number, number], refId: '$ref_wall_4' },
    ...(isTwoBedroom
      ? [
        { start: [0, 4] as [number, number], end: [8, 4] as [number, number], refId: '$ref_wall_5' },
        { start: [4, 4] as [number, number], end: [4, 7.2] as [number, number], refId: '$ref_wall_6' },
      ]
      : []),
  ]

  const actions: AssistantAction[] = [
    ...target.actions,
    ...zoneSpecs.map((zone, index) =>
      withRefId(
        {
          type: 'create_zone',
          levelId,
          name: zone.name,
          polygon: zone.polygon,
          color: ['#eab308', '#f97316', '#38bdf8', '#22c55e'][index] ?? '#eab308',
        },
        `$ref_zone_${index}`,
      ),
    ),
    ...wallSpecs.map((wall) =>
      withRefId(
        {
          type: 'create_wall',
          levelId,
          start: wall.start,
          end: wall.end,
          height: 2.7,
          thickness: 0.15,
        },
        wall.refId,
      ),
    ),
    { type: 'create_slab', levelId, name: 'Main Slab', polygon: [[0, 0], [8, 0], [8, 7.2], [0, 7.2]] },
    { type: 'create_ceiling', levelId, name: 'Main Ceiling', polygon: [[0, 0], [8, 0], [8, 7.2], [0, 7.2]], height: 2.7 },
    { type: 'create_roof', levelId, name: 'Main Roof', corner1: [0, 0], corner2: [8, 7.2], height: 1.6 },
    { type: 'place_door', wallId: '$ref_wall_0', localX: 1.2, width: 1, height: 2.2 },
    { type: 'place_window', wallId: '$ref_wall_1', localX: 2.2, localY: 1.45, width: 1.6, height: 1.3 },
    { type: 'place_window', wallId: '$ref_wall_2', localX: 1.8, localY: 1.45, width: 1.6, height: 1.3 },
    { type: 'place_window', wallId: '$ref_wall_2', localX: 6.2, localY: 1.45, width: 1.6, height: 1.3 },
    { type: 'place_window', wallId: '$ref_wall_3', localX: 2.4, localY: 1.45, width: 1.6, height: 1.3 },
    ...(wantsFurnishingBundle
      ? ([
        { type: 'place_item', assetId: 'sofa', targetNodeId: '$ref_zone_0', placement: 'center' },
        { type: 'place_item', assetId: 'coffee-table', targetNodeId: '$ref_zone_0', placement: 'center' },
        { type: 'place_item', assetId: 'tv-stand', targetNodeId: '$ref_zone_0', placement: 'center' },
        { type: 'place_item', assetId: 'television', targetNodeId: '$ref_zone_0', placement: 'center' },
        { type: 'place_item', assetId: 'shower-rug', targetNodeId: '$ref_zone_0', placement: 'center' },
        ...(isTwoBedroom
          ? ([
            { type: 'place_item', assetId: 'double-bed', targetNodeId: '$ref_zone_2', placement: 'center' },
            { type: 'place_item', assetId: 'single-bed', targetNodeId: '$ref_zone_3', placement: 'center' },
          ] satisfies AssistantAction[])
          : []),
      ] satisfies AssistantAction[])
      : []),
  ]

  return chunkPlanActions({
    prompt: body.prompt,
    reply: 'I can create a compact editable house shell with rooms, structure, and basic openings.',
    summary: 'Creating the requested house shell.',
    actions,
    assumptions,
    intentId: 'house_shell_recipe',
  })
}

const buildCafeRecipeTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
) => {
  const cafeRequest =
    /\b(cafe|café|coffee shop|cafeteria)\b/.test(normalizedPrompt) &&
    CREATION_REQUEST_PATTERN.test(normalizedPrompt)

  if (!cafeRequest) return null

  const target = getRecipeLevelTarget(body.context, selection)
  if (!target) {
    return buildClarifyTurn('I need a building or level target before I can create a cafe layout.', [
      'Select a building or level first so I know where to place the generated cafe.',
    ])
  }

  const levelId = target.levelId
  const width = /\bsmall|compact|pequena|pequeña\b/.test(normalizedPrompt) ? 6.5 : 8
  const depth = /\bsmall|compact|pequena|pequeña\b/.test(normalizedPrompt) ? 5.5 : 6.8
  const wallHeight = 2.8
  const wantsFurnishingBundle =
    /\b(furnish|furnished|furniture|counter|seating|tables|chairs|amuebla|amueblada|mostrador|mesas|sillas)\b/.test(
      normalizedPrompt,
    )
  const polygon = [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ] as Array<[number, number]>

  const actions: AssistantAction[] = [
    ...target.actions,
    withRefId(
      {
        type: 'create_zone',
        levelId,
        name: 'Cafe',
        polygon,
        color: '#f59e0b',
      },
      '$ref_zone_cafe',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [0, 0], end: [width, 0], height: wallHeight, thickness: 0.15 },
      '$ref_cafe_wall_0',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [width, 0], end: [width, depth], height: wallHeight, thickness: 0.15 },
      '$ref_cafe_wall_1',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [width, depth], end: [0, depth], height: wallHeight, thickness: 0.15 },
      '$ref_cafe_wall_2',
    ),
    withRefId(
      { type: 'create_wall', levelId, start: [0, depth], end: [0, 0], height: wallHeight, thickness: 0.15 },
      '$ref_cafe_wall_3',
    ),
    { type: 'create_slab', levelId, name: 'Cafe Slab', polygon },
    { type: 'create_ceiling', levelId, name: 'Cafe Ceiling', polygon, height: wallHeight },
    { type: 'create_roof', levelId, name: 'Cafe Roof', corner1: [0, 0], corner2: [width, depth], height: 1.4 },
    { type: 'place_door', wallId: '$ref_cafe_wall_0', localX: Number((width * 0.48).toFixed(3)), width: 1.1, height: 2.2 },
    {
      type: 'place_window',
      wallId: '$ref_cafe_wall_1',
      localX: Number((depth * 0.4).toFixed(3)),
      localY: 1.45,
      width: 1.6,
      height: 1.3,
    },
    {
      type: 'place_window',
      wallId: '$ref_cafe_wall_3',
      localX: Number((depth * 0.6).toFixed(3)),
      localY: 1.45,
      width: 1.6,
      height: 1.3,
    },
    ...(wantsFurnishingBundle
      ? ([
        {
          type: 'place_item',
          assetId: 'kitchen-counter',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [Number((width - 1.2).toFixed(3)), 0, 0.9],
        },
        {
          type: 'place_item',
          assetId: 'coffee-machine',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [Number((width - 1.3).toFixed(3)), 0, 1.5],
        },
        {
          type: 'place_item',
          assetId: 'stool',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [Number((width - 2.1).toFixed(3)), 0, 1.4],
        },
        {
          type: 'place_item',
          assetId: 'stool',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [Number((width - 2.1).toFixed(3)), 0, 2.1],
        },
        {
          type: 'place_item',
          assetId: 'dining-table',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [1.8, 0, 1.8],
        },
        {
          type: 'place_item',
          assetId: 'dining-chair',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [1.2, 0, 1.8],
        },
        {
          type: 'place_item',
          assetId: 'dining-chair',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [2.4, 0, 1.8],
        },
        {
          type: 'place_item',
          assetId: 'dining-table',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [3.7, 0, 3.3],
        },
        {
          type: 'place_item',
          assetId: 'dining-chair',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [3.1, 0, 3.3],
        },
        {
          type: 'place_item',
          assetId: 'dining-chair',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [4.3, 0, 3.3],
        },
        {
          type: 'place_item',
          assetId: 'indoor-plant',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [0.8, 0, Number((depth - 0.7).toFixed(3))],
        },
        {
          type: 'place_item',
          assetId: 'floor-lamp',
          targetNodeId: '$ref_zone_cafe',
          placement: 'explicit',
          position: [Number((width - 0.8).toFixed(3)), 0, Number((depth - 0.8).toFixed(3))],
        },
      ] satisfies AssistantAction[])
      : []),
  ]

  const assumptions = [
    `Using a compact editable cafe footprint of ${width} m x ${depth} m.`,
    'Approximating the cafe with a simple service counter, seating area, and editable catalog furniture.',
  ]

  return buildReviewPlanTurn(
    wantsFurnishingBundle
      ? 'I can create a small furnished cafe with a service counter and seating.'
      : 'I can create a small editable cafe shell.',
    actions,
    assumptions,
  )
}

const buildFurnishRoomRecipeTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
) => {
  const furnishRequest =
    /\b(furnish|decorate|stage|amuebla|amueblar|decora)\b/.test(normalizedPrompt) ||
    (/\b(add|place|put)\b/.test(normalizedPrompt) &&
      /\bsofa|coffee table|rug|tv|television|living room|sala\b/.test(normalizedPrompt))

  if (!furnishRequest) return null

  const zone =
    findZoneByPrompt(body.context, normalizedPrompt) ??
    (selection.zoneId
      ? getAssistantNodeRecords(body.context).find((node) => node.id === selection.zoneId) ?? null
      : null)
  if (!zone) return null

  const requestedCatalogIds = [
    /\bsofa|couch\b/.test(normalizedPrompt) ? 'sofa' : null,
    /\bcoffee table|mesa de centro\b/.test(normalizedPrompt) ? 'coffee-table' : null,
    /\btv wall|television|tv\b/.test(normalizedPrompt) ? 'television' : null,
    /\btv wall|television|tv\b/.test(normalizedPrompt) ? 'tv-stand' : null,
    /\brug|carpet|alfombra\b/.test(normalizedPrompt) ? 'shower-rug' : null,
  ].filter((item): item is string => Boolean(item))

  if (requestedCatalogIds.length === 0) return null

  const assumptions: string[] = [`Using zone "${zone.name ?? zone.id}" as the furnishing target.`]
  if (requestedCatalogIds.includes('shower-rug')) {
    assumptions.push('Approximating the requested rug with the nearest editable rug-like catalog asset.')
  }
  if (requestedCatalogIds.includes('television') || requestedCatalogIds.includes('tv-stand')) {
    assumptions.push('Approximating the TV wall request with a TV plus stand placed near the room center.')
  }

  return buildReviewPlanTurn(
    'I can furnish that room with editable catalog items and proxies.',
    requestedCatalogIds.map((assetId) => ({
      type: 'place_item',
      assetId,
      targetNodeId: zone.id,
      placement: 'center' as const,
    })),
    assumptions,
  )
}

const buildRefinementTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selection: AssistantSelectionContext,
  selectedTarget: SelectedTargetContext | null,
) => {
  const zone = findZoneByPrompt(body.context, normalizedPrompt)
  const selectedNode = selectedTarget
    ? findAssistantTargetById(body.context as Record<string, unknown> | undefined, selectedTarget.id)
    : null

  if (
    /\b(rename|call|name|renombra|llama)\b/.test(normalizedPrompt) &&
    (selectedTarget?.type === 'zone' || zone)
  ) {
    const nextName =
      /\bkitchen|cocina\b/.test(normalizedPrompt)
        ? 'Kitchen'
        : /\bliving room|living|salon|sala\b/.test(normalizedPrompt)
          ? 'Living Room'
          : /\bbedroom\b|\bhabitacion\b|\bhabitación\b|\bdormitorio\b/.test(normalizedPrompt)
            ? 'Bedroom'
            : null

    if (nextName) {
      const nodeId = selectedTarget?.type === 'zone' ? selectedTarget.id : zone?.id
      if (nodeId) {
        return buildReviewPlanTurn(
          `I can rename that room to ${nextName}.`,
          [{ type: 'rename_node', nodeId, name: nextName }],
          ['Using the current room target for the rename request.'],
        )
      }
    }
  }

  if (/\b(hide|show|oculta|muestra)\b/.test(normalizedPrompt)) {
    const referenceTarget = getReferenceTarget(body.context, selectedTarget)
    if (referenceTarget) {
      return buildReviewPlanTurn(
        /\b(show|muestra)\b/.test(normalizedPrompt)
          ? 'I can show that reference.'
          : 'I can hide that reference.',
        [
          {
            type: 'set_node_visibility',
            nodeIds: [referenceTarget.id],
            visible: /\b(show|muestra)\b/.test(normalizedPrompt),
          },
        ],
        ['Using the current reference target.'],
      )
    }
  }

  if (/\b(window|windows|ventana|ventanas)\b/.test(normalizedPrompt) && /\b(taller|higher|mas altas|más altas|tall)\b/.test(normalizedPrompt)) {
    const delta = parseSingleMetricValue(body.prompt) ?? 0.3
    const targets =
      selectedTarget?.type === 'window'
        ? [selectedTarget]
        : getWindowNodes(body.context)

    if (targets.length > 0) {
      const actions = targets.map((target) => {
        const record = getAssistantNodeRecords(body.context).find((node) => node.id === target.id)
        const currentHeight = record ? getNodeNumber(record, 'height') ?? 1.5 : 1.5
        return {
          type: 'update_window_properties' as const,
          nodeId: target.id,
          height: Number((currentHeight + delta).toFixed(3)),
        }
      })

      return chunkPlanActions({
        prompt: body.prompt,
        reply: 'I can make the windows taller.',
        summary: 'Updating the requested windows.',
        actions,
        assumptions: [delta === 0.3 ? 'Using a default height increase of 0.3 m.' : `Increasing the windows by ${delta} m.`],
        intentId: 'window_refinement',
      })
    }
  }

  if (/\b(add|place|put|insert|agrega|pon|coloca)\b/.test(normalizedPrompt) && /\b(roof|techo)\b/.test(normalizedPrompt)) {
    const selectedEnvelope =
      selectedTarget && (selectedTarget.type === 'zone' || selectedTarget.type === 'slab' || selectedTarget.type === 'ceiling')
        ? getAssistantNodeRecords(body.context).find((node) => node.id === selectedTarget.id) ?? null
        : null
    const envelope =
      selectedEnvelope ??
      (getStructureEnvelopeNodes(body.context).length === 1 ? getStructureEnvelopeNodes(body.context)[0] ?? null : null)

    if (envelope) {
      const polygon = getNodePolygon(envelope)
      if (polygon && polygon.length >= 3) {
        const xs = polygon.map((point) => point[0])
        const ys = polygon.map((point) => point[1])
        const corner1: [number, number] = [Math.min(...xs), Math.min(...ys)]
        const corner2: [number, number] = [Math.max(...xs), Math.max(...ys)]
        const height = parseSingleMetricValue(body.prompt) ?? 1.4

        return buildReviewPlanTurn(
          'I can add a roof over that target.',
          [
            {
              type: 'create_roof',
              levelId: envelope.parentId ?? selection.levelId ?? undefined,
              name: `${envelope.name ?? 'Selected'} Roof`,
              corner1,
              corner2,
              height: Number(height.toFixed(3)),
            },
          ],
          [
            `Using ${envelope.name ? `"${envelope.name}"` : `the selected ${envelope.type}`} as the roof footprint target.`,
            'Approximating the roof footprint from the target bounding box so the result stays editable.',
          ],
        )
      }
    }
  }

  if (
    /\b(add|place|put|insert|agrega|pon|coloca)\b/.test(normalizedPrompt) &&
    /\b(window|windows|ventana|ventanas)\b/.test(normalizedPrompt)
  ) {
    const requestedCount = /\b(two|2|dos)\b/.test(normalizedPrompt) ? 2 : 1
    const selectedWall =
      selectedTarget?.type === 'wall'
        ? getAssistantNodeRecords(body.context).find((node) => node.id === selectedTarget.id) ?? null
        : null
    const wall = selectedWall ?? (getWallNodes(body.context).length === 1 ? getWallNodes(body.context)[0] ?? null : null)

    if (wall) {
      const start = getNodePoint2(wall, 'start')
      const end = getNodePoint2(wall, 'end')
      const wallLength = start && end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : 4
      const offsets =
        requestedCount === 2
          ? [wallLength * 0.33, wallLength * 0.66]
          : [wallLength * 0.5]

      return buildReviewPlanTurn(
        requestedCount === 2 ? 'I can add two windows to that wall.' : 'I can add a window to that wall.',
        offsets.map((localX) => ({
          type: 'place_window' as const,
          wallId: wall.id,
          localX: Number(localX.toFixed(3)),
          localY: 1.4,
          width: Math.min(1.4, Number((wallLength * 0.22).toFixed(3))),
          height: 1.2,
        })),
        [`Using wall "${wall.name ?? wall.id}" as the window placement target.`],
      )
    }
  }

  if (/\b(move|mueve|desplaza)\b/.test(normalizedPrompt) && /\bsofa|couch\b/.test(normalizedPrompt)) {
    const sofa = selectedTarget?.type === 'item' ? selectedNode : findUniqueItemMatch(body.context, normalizedPrompt)
    const delta = parseMoveDelta(body.prompt, normalizedPrompt)
    if (sofa && delta) {
      return buildReviewPlanTurn(
        'I can move the sofa.',
        [{ type: 'move_target', nodeId: sofa.id, delta }],
        ['Using the matching sofa in the current scene.'],
      )
    }
  }

  return null
}

const isUnsupportedCreationPrompt = (normalizedPrompt: string) =>
  /\b(exact|identical|1:1|photoreal|photorealistic)\b.*\b(ferrari|porsche|tesla|iphone|lego|disney)\b/.test(
    normalizedPrompt,
  ) ||
  /\b(animated|animation|rigged|rig|walk cycle|skeletal)\b/.test(normalizedPrompt) ||
  /\b(organic sculpture|zbrush creature|realistic human|exact character)\b/.test(normalizedPrompt)

const buildHelpTurn = (): AssistantTurnResult => ({
  reply:
    'I can explain the current workspace, switch phases or tools, control viewer modes, place items, edit scene elements, and run CAD builds when the request is specific enough to execute safely.',
  mode: 'chat',
  assumptions: [],
  ambiguities: [],
  actions: [],
  requiresReview: false,
  destructiveActionCount: 0,
})

const normalizeConversationalPrompt = (normalizedPrompt: string) =>
  normalizedPrompt.replace(/[¡!¿?.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()

const buildConversationalTurn = (
  normalizedPrompt: string,
): AssistantTurnResult | null => {
  const conversationalPrompt = normalizeConversationalPrompt(normalizedPrompt)
  const conversationalTokens = conversationalPrompt.split(' ').filter(Boolean)
  const startsWithGreeting =
    /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hello|hi|hey)\b/.test(
      conversationalPrompt,
    )
  const hasExecutionIntent = EXECUTION_INTENT_PATTERN.test(conversationalPrompt)

  if (
    /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hello|hi|hey)(?: assistant)?$/.test(
      conversationalPrompt,
    )
  ) {
    const isSpanish = /\b(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)\b/.test(
      conversationalPrompt,
    )
    return buildChatTurn(
      isSpanish
        ? '¡Hola! Puedo ayudarte a crear, editar y refinar escenas, colocar elementos o construir piezas CAD. Dime qué quieres hacer.'
        : 'Hello! I can help create, edit, and refine scenes, place items, or build CAD parts. Tell me what you want to make.',
    )
  }

  if (startsWithGreeting && !hasExecutionIntent && conversationalTokens.length <= 4) {
    const isSpanish = /\b(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches)\b/.test(
      conversationalPrompt,
    )
    return buildChatTurn(
      isSpanish
        ? '¡Hola! Puedo ayudarte a crear, editar y refinar escenas, colocar elementos o construir piezas CAD. Dime qué quieres hacer.'
        : 'Hello! I can help create, edit, and refine scenes, place items, or build CAD parts. Tell me what you want to make.',
    )
  }

  if (/^(thanks|thank you|gracias|muchas gracias|ok gracias|vale gracias)$/.test(conversationalPrompt)) {
    const isSpanish = /\b(gracias|vale)\b/.test(conversationalPrompt)
    return buildChatTurn(
      isSpanish
        ? 'De nada. Si quieres, dime qué necesitas crear o cambiar y lo ejecuto.'
        : "You're welcome. Tell me what you want to create or change, and I'll handle it.",
    )
  }

  return null
}

const buildChatTurn = (reply: string, assumptions: string[] = []): AssistantTurnResult => ({
  reply,
  mode: 'chat',
  assumptions,
  ambiguities: [],
  actions: [],
  requiresReview: false,
  destructiveActionCount: 0,
})

type ConversationPromptEntry = {
  raw: string
  normalized: string
}

const getAssistantSessionRecord = (context: AssistantPlanRequest['context']) =>
  context && typeof context.assistantSession === 'object' && context.assistantSession !== null
    ? (context.assistantSession as Record<string, unknown>)
    : null

const extractConversationUserPromptsFromSummary = (text: string) => {
  if (!text.startsWith('[Prior Conversation Summary]')) return [text]

  return text
    .replace(/^\[Prior Conversation Summary\]\s*/i, '')
    .split(/\n{2,}/)
    .flatMap((block) => {
      const match = block.match(/^User:\s*(.+)$/im)
      return match?.[1]?.trim() ? [match[1].trim()] : []
    })
}

const getConversationUserPrompts = (
  body: Pick<AssistantPlanRequest, 'conversationHistory'>,
): ConversationPromptEntry[] =>
  (body.conversationHistory ?? []).flatMap((turn) => {
    if (turn.role !== 'user') return []

    return extractConversationUserPromptsFromSummary(turn.text)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({
        raw: text,
        normalized: normalizeConversationalPrompt(normalizePrompt(text)),
      }))
  })

const isLowSignalConversationPrompt = (normalizedPrompt: string) =>
  /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hello|hi|hey)(?: assistant)?$/.test(
    normalizedPrompt,
  ) ||
  /^(thanks|thank you|gracias|muchas gracias|ok gracias|vale gracias)$/.test(
    normalizedPrompt,
  ) ||
  normalizedPrompt === 'continue'

const getConversationRecallIntent = (normalizedPrompt: string) => {
  const asksAboutPriorPrompt =
    /\b(ask|asked|request|requested|requests|say|said|told|pedi|pedido|pedidos|peticion|peticiones|dije|pregunte|preguntas|solicitud|solicitudes)\b/.test(
      normalizedPrompt,
    ) ||
    /\b(what have i asked|what did i ask|what was i asking|que te pedi|que dije|que pregunte)\b/.test(
      normalizedPrompt,
    )

  if (!asksAboutPriorPrompt) return null

  if (/\b(order|sequence|history|summary|resume|resumen|orden|secuencia|historial)\b/.test(normalizedPrompt)) {
    return 'order' as const
  }

  if (/\b(first|initial|original|primer|primera|inicial)\b/.test(normalizedPrompt)) {
    return 'first' as const
  }

  if (/\b(last|latest|most recent|recent|before|befoe|previous|antes|ultimo|ultima|reciente|anterior)\b/.test(normalizedPrompt)) {
    return 'last' as const
  }

  return 'last' as const
}

const formatQuotedPrompt = (prompt: string) => `"${prompt.replaceAll('"', "'")}"`

const buildConversationMemoryTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
): AssistantTurnResult | null => {
  const recallIntent = getConversationRecallIntent(normalizedPrompt)
  if (!recallIntent) return null

  const allUserPrompts = getConversationUserPrompts(body)
  const substantiveUserPrompts = allUserPrompts.filter(
    (entry) =>
      !isLowSignalConversationPrompt(entry.normalized) &&
      getConversationRecallIntent(entry.normalized) === null,
  )
  const prompts =
    substantiveUserPrompts.length > 0 ? substantiveUserPrompts : allUserPrompts
  const isSpanish = /\b(que|pedido|pedi|dije|pregunte|antes|ultimo|ultima|orden|secuencia|historial)\b/.test(
    normalizedPrompt,
  )

  if (prompts.length === 0) {
    return buildChatTurn(
      isSpanish
        ? 'Todavia no tengo una solicitud anterior util en este chat.'
        : "I don't have a prior request in this chat yet.",
    )
  }

  if (recallIntent === 'first') {
    const firstPrompt = prompts[0]!
    const latestPrompt = prompts[prompts.length - 1]!
    return buildChatTurn(
      isSpanish
        ? prompts.length > 1
          ? `La primera solicitud util de este chat fue ${formatQuotedPrompt(firstPrompt.raw)}. La mas reciente fue ${formatQuotedPrompt(latestPrompt.raw)}.`
          : `La primera solicitud util de este chat fue ${formatQuotedPrompt(firstPrompt.raw)}.`
        : prompts.length > 1
          ? `The first substantive request in this chat was ${formatQuotedPrompt(firstPrompt.raw)}. The most recent one was ${formatQuotedPrompt(latestPrompt.raw)}.`
          : `The first substantive request in this chat was ${formatQuotedPrompt(firstPrompt.raw)}.`,
      substantiveUserPrompts.length > 0
        ? [
            isSpanish
              ? 'Ignorando saludos y preguntas de memoria para centrarme en las solicitudes de trabajo.'
              : 'Ignoring greetings and memory-check prompts so the recall stays focused on build and edit requests.',
          ]
        : [],
    )
  }

  if (recallIntent === 'order') {
    const orderedPrompts = prompts.slice(-3)
    const numberedPrompts = orderedPrompts
      .map((entry, index) => `${index + 1}. ${entry.raw}`)
      .join(' ')
    return buildChatTurn(
      isSpanish
        ? `Tus solicitudes utiles mas recientes, en orden, fueron: ${numberedPrompts}`
        : `Your most recent substantive requests, in order, were: ${numberedPrompts}`,
      substantiveUserPrompts.length > 0
        ? [
            isSpanish
              ? 'Ignorando saludos y preguntas de memoria para centrarme en las solicitudes de trabajo.'
              : 'Ignoring greetings and memory-check prompts so the recall stays focused on build and edit requests.',
          ]
        : [],
    )
  }

  const lastPrompt = prompts[prompts.length - 1]!
  const previousPrompt = prompts.length > 1 ? prompts[prompts.length - 2] ?? null : null

  return buildChatTurn(
    isSpanish
      ? previousPrompt
        ? `Tu solicitud util mas reciente fue ${formatQuotedPrompt(lastPrompt.raw)}. Antes de esa, pediste ${formatQuotedPrompt(previousPrompt.raw)}.`
        : `Tu solicitud util mas reciente fue ${formatQuotedPrompt(lastPrompt.raw)}.`
      : previousPrompt
        ? `Your last substantive request was ${formatQuotedPrompt(lastPrompt.raw)}. Before that, you asked ${formatQuotedPrompt(previousPrompt.raw)}.`
        : `Your last substantive request was ${formatQuotedPrompt(lastPrompt.raw)}.`,
    substantiveUserPrompts.length > 0
      ? [
          isSpanish
            ? 'Ignorando saludos y preguntas de memoria para centrarme en las solicitudes de trabajo.'
            : 'Ignoring greetings and memory-check prompts so the recall stays focused on build and edit requests.',
        ]
      : [],
  )
}

const isCadBoxBuildPrompt = (normalizedPrompt: string) =>
  /\b(build|create|generate|make|crea|crear|genera|hacer|haz)\b/.test(
    normalizedPrompt,
  ) && /\b(box|cube|rectangular prism|caja|cubo)\b/.test(normalizedPrompt)

type BoxDimensionAxis = 'width' | 'depth' | 'height'

const parseHistoryBoxFollowUp = (prompt: string, normalizedPrompt: string) => {
  const axis: BoxDimensionAxis | null =
    /\b(taller|higher|tall|alto|alta|mas alto|más alto|mas alta|más alta)\b/.test(
      normalizedPrompt,
    )
      ? 'height'
      : /\b(wider|broader|wide|ancho|ancha|mas ancho|más ancho)\b/.test(
          normalizedPrompt,
        )
        ? 'width'
        : /\b(deeper|longer|deep|largo|larga|profundo|profunda|mas largo|más largo|mas profunda|más profunda)\b/.test(
            normalizedPrompt,
          )
          ? 'depth'
          : null

  if (!axis) return null

  const numericValue = parseSingleMetricValue(prompt)
  const isDelta =
    numericValue !== null &&
    /\b(by|plus|increase|increment|add|extra|mas|más|aumenta|incrementa|sumale|sumale)\b/.test(
      normalizedPrompt,
    )

  return {
    axis,
    numericValue,
    isDelta,
  }
}

const formatMetricValue = (value: number) => Number(value.toFixed(3)).toString()

const buildPendingBoxFollowUpTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
  selectedTarget: SelectedTargetContext | null,
  selectedCadBody: SelectedCadBodyContext | null,
) => {
  if (selectedTarget || selectedCadBody) return null

  const followUp = parseHistoryBoxFollowUp(body.prompt, normalizedPrompt)
  if (!followUp) return null

  const substantivePrompts = getConversationUserPrompts(body).filter(
    (entry) =>
      !isLowSignalConversationPrompt(entry.normalized) &&
      getConversationRecallIntent(entry.normalized) === null,
  )
  const priorBoxPrompt = [...substantivePrompts]
    .reverse()
    .find((entry) => isCadBoxBuildPrompt(entry.normalized))

  if (!priorBoxPrompt) return null

  const successfulPrompts = Array.isArray(getAssistantSessionRecord(body.context)?.recentSuccessfulPrompts)
    ? (getAssistantSessionRecord(body.context)?.recentSuccessfulPrompts as unknown[])
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => normalizePrompt(entry))
    : []

  if (successfulPrompts.includes(normalizePrompt(priorBoxPrompt.raw))) {
    return null
  }

  const dimensions = parseMetricDimensions(priorBoxPrompt.raw)
  if (!dimensions) return null

  const isSpanish = /\b(haz|caja|alto|alta|ancho|profundo|profunda|mas|más)\b/.test(
    normalizedPrompt,
  )
  const axisLabel =
    followUp.axis === 'height'
      ? isSpanish
        ? 'altura'
        : 'height'
      : followUp.axis === 'width'
        ? isSpanish
          ? 'ancho'
          : 'width'
        : isSpanish
          ? 'profundidad'
          : 'depth'

  if (followUp.numericValue === null) {
    const [width, depth, height] = dimensions
    return buildClarifyTurn(
      isSpanish
        ? `Tu solicitud pendiente para la caja es ${formatMetricValue(width)}m x ${formatMetricValue(depth)}m x ${formatMetricValue(height)}m. Dime la nueva ${axisLabel}, por ejemplo "hazla de 1.5m de alto".`
        : `Your pending box request is ${formatMetricValue(width)}m x ${formatMetricValue(depth)}m x ${formatMetricValue(height)}m. Tell me the new ${axisLabel}, for example "make it 1.5m tall".`,
      [
        isSpanish
          ? `Puedo seguir usando ${formatQuotedPrompt(priorBoxPrompt.raw)} como el objetivo de esta correccion.`
          : `I can keep using ${formatQuotedPrompt(priorBoxPrompt.raw)} as the target for this follow-up.`,
      ],
    )
  }

  const [currentWidth, currentDepth, currentHeight] = dimensions
  const nextDimensions = {
    width: currentWidth,
    depth: currentDepth,
    height: currentHeight,
  }
  const nextValue = followUp.isDelta
    ? (followUp.axis === 'width'
        ? currentWidth
        : followUp.axis === 'depth'
          ? currentDepth
          : currentHeight) + followUp.numericValue
    : followUp.numericValue

  nextDimensions[followUp.axis] = Number(Math.max(0.05, nextValue).toFixed(3))

  const historySelection =
    body.context?.selection &&
    typeof body.context.selection === 'object' &&
    !Array.isArray(body.context.selection)
      ? (body.context.selection as Record<string, unknown>)
      : null
  const updatedBoxPrompt = `build a box ${formatMetricValue(nextDimensions.width)}m x ${formatMetricValue(nextDimensions.depth)}m x ${formatMetricValue(nextDimensions.height)}m`
  const updatedBoxBrief = buildFallbackCadBrief(updatedBoxPrompt, {
    levelId:
      historySelection && typeof historySelection.levelId === 'string'
        ? historySelection.levelId
        : null,
  })

  return buildReviewPlanTurn(
    isSpanish
      ? `Puedo actualizar la caja pendiente a ${formatMetricValue(nextDimensions.width)}m x ${formatMetricValue(nextDimensions.depth)}m x ${formatMetricValue(nextDimensions.height)}m.`
      : `I can update the pending box build to ${formatMetricValue(nextDimensions.width)}m x ${formatMetricValue(nextDimensions.depth)}m x ${formatMetricValue(nextDimensions.height)}m.`,
    [
      {
        type: 'execute_cad_brief',
        brief: updatedBoxBrief,
      },
    ],
    [
      isSpanish
        ? `Usando ${formatQuotedPrompt(priorBoxPrompt.raw)} como la solicitud pendiente que estas refinando.`
        : `Using ${formatQuotedPrompt(priorBoxPrompt.raw)} as the pending request you are refining.`,
    ],
  )
}

const hasRecentPetHouseContext = (context: AssistantPlanRequest['context']) => {
  const nodeSummaries = getNodeSummaries(context)
  const hasNamedPetHouseNode = nodeSummaries.some((node) => {
    if (!node || typeof node !== 'object') return false
    const record = node as Record<string, unknown>
    const fields = [
      typeof record.id === 'string' ? record.id : '',
      typeof record.name === 'string' ? record.name : '',
      typeof record.type === 'string' ? record.type : '',
    ]

    return fields.some((field) => {
      const normalizedField = normalizePrompt(field)
      return (
        /\b(dog ?house|doghouse|pet house|kennel)\b/.test(normalizedField) ||
        (/\b(perro|mascota|pet|dog)\b/.test(normalizedField) && HOUSE_NOUN_PATTERN.test(normalizedField))
      )
    })
  })

  const assistantSession =
    context && typeof context.assistantSession === 'object' && context.assistantSession !== null
      ? (context.assistantSession as Record<string, unknown>)
      : null
  const recentSuccessfulPrompts = Array.isArray(assistantSession?.recentSuccessfulPrompts)
    ? assistantSession.recentSuccessfulPrompts.filter((entry): entry is string => typeof entry === 'string')
    : []
  const hasPetHousePrompt = recentSuccessfulPrompts.some((entry) => {
    const normalizedEntry = normalizePrompt(entry)
    return (
      CREATION_REQUEST_PATTERN.test(normalizedEntry) &&
      /\b(perro|mascota|pet|dog)\b/.test(normalizedEntry) &&
      PET_SHELTER_NOUN_PATTERN.test(normalizedEntry)
    )
  })

  return hasNamedPetHouseNode || hasPetHousePrompt
}

const buildPetHouseCritiqueTurn = (
  body: AssistantPlanRequest,
  normalizedPrompt: string,
): AssistantTurnResult | null => {
  const asksIfRecentResultLooksLikeHouse =
    /\b(this|that|it|esto|eso)\b/.test(normalizedPrompt) &&
    /\b(look|looks|looking|seem|seems|feel|feels|parece|parecer|ve|ves)\b/.test(normalizedPrompt) &&
    HOUSE_NOUN_PATTERN.test(normalizedPrompt)

  if (!asksIfRecentResultLooksLikeHouse || !hasRecentPetHouseContext(body.context)) {
    return null
  }

  const isSpanish = /\b(esto|eso|parece|parecer|ve|ves|casa|casita)\b/.test(normalizedPrompt)
  return buildChatTurn(
    isSpanish
      ? 'Todavia no. Ahora mismo se lee mas como un refugio abierto que como una casita terminada porque el frente queda completamente abierto y el techo sigue muy simple. Si quieres, puedo hacerla mas creible cerrando parte del frente, marcando mejor la entrada y ajustando el perfil del techo.'
      : 'Not yet. Right now it reads more like an open shelter shell than a finished house because the front stays completely open and the roof is still very simple. If you want, I can make it feel more house-like by closing part of the front, framing the entrance, and adjusting the roof profile.',
    ['Using the most recently created pet-house result as the critique target.'],
  )
}

const withAssistantTurnMetadata = (
  turn: AssistantTurnDraft,
  metadata: Partial<AssistantTurnMetadata> = {},
): AssistantTurnResult => {
  const nonWorkspaceImageAssumptions =
    metadata.imageInterpretation && metadata.imageInterpretation.kind !== 'workspace'
      ? metadata.imageInterpretation.kind === 'floorplan'
        ? [
            'Approximating the uploaded floor plan with editable structural geometry instead of a literal trace.',
            'The first pass uses inferred scale from the prompt and current workspace context.',
            'Where the source is underspecified, I will use the nearest editable proxy or room-sized approximation.',
          ]
        : metadata.imageInterpretation.kind === 'room-reference'
          ? [
              'Approximating the uploaded room reference with editable furniture layout rather than an exact visual clone.',
              'Scale and spacing are inferred from the visible proportions in the image and prompt.',
              'I will use the nearest editable catalog proxies when an exact match is unavailable.',
            ]
          : metadata.imageInterpretation.kind === 'sketch'
            ? [
                'Approximating the uploaded sketch with simple editable geometry rather than a literal freehand trace.',
                'Scale is inferred from the prompt or default prototype dimensions when the image has no explicit dimensions.',
                'I will use the nearest editable proxy when the sketch implies detail the runtime does not model directly.',
              ]
            : metadata.imageInterpretation.kind === 'reference'
              ? [
                  'Approximating the uploaded reference with the nearest editable geometry or catalog proxies.',
                  'Scale is inferred from the prompt and current workspace context unless the image provides explicit dimensions.',
                  'I will preserve the main proportions and intent rather than claiming an exact replica.',
                ]
              : []
      : []
  const assumptions =
    nonWorkspaceImageAssumptions.length > 0 && (turn.actions.length > 0 || turn.mode === 'task-plan')
      ? Array.from(new Set([...turn.assumptions, ...nonWorkspaceImageAssumptions]))
      : turn.assumptions

  return AssistantTurnResultSchema.parse({
    ...turn,
    assumptions,
    ...(metadata.targetingExplanation ? { targetingExplanation: metadata.targetingExplanation } : {}),
    ...(metadata.targetCandidates && metadata.targetCandidates.length > 0
      ? { targetCandidates: metadata.targetCandidates }
      : {}),
    ...(metadata.imageInterpretation ? { imageInterpretation: metadata.imageInterpretation } : {}),
    ...(metadata.providerMeta ? { providerMeta: metadata.providerMeta } : {}),
  })
}

const buildSafePlanTurn = (
  reply: string,
  actions: AssistantAction[],
  metadata: Partial<AssistantTurnMetadata> = {},
): AssistantTurnResult =>
  withAssistantTurnMetadata(
    {
      reply,
      mode: 'plan',
      assumptions: [],
      ambiguities: [],
      actions,
      requiresReview: false,
      destructiveActionCount: 0,
    },
    metadata,
  )

const buildReviewPlanTurn = (
  reply: string,
  actions: AssistantAction[],
  assumptions: string[] = [],
  continuation?: AssistantContinuation | null,
  metadata: Partial<AssistantTurnMetadata> = {},
): AssistantTurnResult =>
  withAssistantTurnMetadata(
    {
      reply,
      mode: 'plan',
      assumptions,
      ambiguities: [],
      actions,
      requiresReview: true,
      destructiveActionCount: actions.filter((action) => isDestructiveAssistantActionType(action.type))
        .length,
      ...(continuation ? { continuation } : {}),
    },
    metadata,
  )

const buildClarifyTurn = (
  reply: string,
  ambiguities: string[],
  metadata: Partial<AssistantTurnMetadata> = {},
): AssistantTurnResult =>
  withAssistantTurnMetadata(
    {
      reply,
      mode: 'clarify',
      assumptions: [],
      ambiguities,
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
    metadata,
  )

const buildTaskPlanTurn = (
  reply: string,
  steps: NonNullable<AssistantTurnResult['steps']>,
  assumptions: string[] = [],
  metadata: Partial<AssistantTurnMetadata> = {},
): AssistantTurnResult =>
  withAssistantTurnMetadata(
    {
      reply,
      mode: 'task-plan',
      assumptions,
      ambiguities: [],
      actions: [],
      steps,
      requiresReview: steps.some((step) =>
        step.actions.some((action) => !isSafeImmediateAssistantActionType(action.type)),
      ),
      destructiveActionCount: steps
        .flatMap((step) => step.actions)
        .filter((action) => isDestructiveAssistantActionType(action.type)).length,
    },
    metadata,
  )

const isImageGroundedSource = (
  source: AssistantTargetResolutionSource | null,
): source is Extract<AssistantTargetResolutionSource, 'image-annotation' | 'image-region'> =>
  source === 'image-annotation' || source === 'image-region'

const prepareImageGroundedDestructiveTurn = ({
  clearAreaRequest,
  deleteRequest,
  hideRequest,
  imageInterpretation,
  selectedTarget,
  targetResolution,
  targetResolutionMetadata,
}: {
  clearAreaRequest: boolean
  deleteRequest: boolean
  hideRequest: boolean
  imageInterpretation: ReturnType<typeof interpretAssistantImage>
  selectedTarget: SelectedTargetContext | null
  targetResolution: ReturnType<typeof resolveAssistantPromptTarget>
  targetResolutionMetadata: Partial<AssistantTurnMetadata>
}) => {
  if (imageInterpretation?.kind !== 'workspace' || !(deleteRequest || hideRequest || clearAreaRequest)) {
    return null
  }

  if (selectedTarget && isImageGroundedSource(targetResolution.source)) {
    return buildReviewPlanTurn(
      hideRequest
        ? 'I resolved a single screenshot target and can hide it after review.'
        : 'I resolved a single screenshot target and can remove it after review.',
      hideRequest
        ? [{ type: 'set_node_visibility', nodeIds: [selectedTarget.id], visible: false }]
        : [{ type: 'delete_target', nodeId: selectedTarget.id }],
      [
        targetResolution.explanation ??
          describeResolvedTargetAssumption(selectedTarget, 'image-grounded edit', targetResolution.source),
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  const imageCandidateNodeIds = targetResolution.candidates.map((candidate) => candidate.id)
  if (imageCandidateNodeIds.length > 1) {
    return buildReviewPlanTurn(
      hideRequest
        ? 'I found multiple plausible targets in the uploaded screenshot and can hide them after review.'
        : 'I found multiple plausible targets in the uploaded screenshot and can remove them after review.',
      hideRequest
        ? [{ type: 'set_node_visibility', nodeIds: imageCandidateNodeIds, visible: false }]
        : [{ type: 'delete_nodes', nodeIds: imageCandidateNodeIds }],
      [
        targetResolution.explanation ??
          `Using ${imageCandidateNodeIds.length} image-grounded targets from the uploaded screenshot.`,
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  return buildClarifyTurn(
    'I need a more specific screenshot target or a smaller first step before I continue safely.',
    imageCandidateNodeIds.length > 0
      ? [
          targetResolution.explanation ??
            'I found plausible screenshot targets, but none was confident enough for direct execution.',
          'Name the target type more explicitly, such as wall, window, roof, or room.',
        ]
      : [
          targetResolution.explanation ??
            'The uploaded screenshot looked like the current workspace, but I could not map the highlighted region to a concrete scene target.',
          'Try naming the target directly, or narrow the request to a specific wall, window, roof, or room.',
        ],
    targetResolutionMetadata,
  )
}

const getRequestedComplexity = (body: AssistantPlanRequest): RequestComplexity =>
  body.complexity ?? classifyRequestComplexity(body.prompt, body.context)

const getAssistantPlanningTimeoutMs = (body: AssistantPlanRequest) =>
  getRequestedComplexity(body) === 'complex' || body.prompt.trim().length > 100
    ? COMPLEX_ASSISTANT_TIMEOUT_MS
    : Math.max(OPENAI_ASSISTANT_TIMEOUT_MS, OPENROUTER_ASSISTANT_TIMEOUT_MS)

const shouldAnalyzeImageWithGemini = ({
  body,
  config,
  image,
}: {
  body: AssistantPlanRequest
  config: AssistantAiConfig
  image: ReturnType<typeof getAssistantPlanImage>
}) => {
  if (!image || body.geminiVisionDescription) return false
  if (config.provider === 'fallback') return false
  return !assistantModelSupportsVision(config.model)
}

const shouldUseRemoteChatPath = ({
  body,
  normalizedPrompt,
  image,
}: {
  body: AssistantPlanRequest
  normalizedPrompt: string
  image: ReturnType<typeof getAssistantPlanImage>
}) => {
  if (body.chatMode === 'ask') return true
  if (EXECUTION_INTENT_PATTERN.test(normalizedPrompt)) return false

  const asksForInformation =
    INFORMATIONAL_PROMPT_PATTERN.test(normalizedPrompt) || body.prompt.includes('?')
  const asksForCritique =
    /\b(look|looks|looking|seem|seems|feel|feels|think|thoughts|opinion|parece|parecer|ve|ves)\b/u.test(
      normalizedPrompt,
    )
  const asksSpatialImageQuestion =
    Boolean(image) && IMAGE_SPATIAL_QUESTION_PATTERN.test(normalizedPrompt)

  return asksForInformation || asksForCritique || asksSpatialImageQuestion
}

const chunkPlanActions = ({
  prompt,
  reply,
  summary,
  actions,
  assumptions = [],
  intentId,
}: {
  prompt: string
  reply: string
  summary: string
  actions: AssistantAction[]
  assumptions?: string[]
  intentId: string
}): AssistantTurnResult => {
  if (actions.length <= 25) {
    return buildReviewPlanTurn(reply, actions, assumptions)
  }

  const totalSteps = Math.ceil(actions.length / 25)
  const remainingActions = actions.slice(25)
  const chunkedReply = `${reply} Starting step 1 of ${totalSteps} and continuing until the build is complete or blocked.`

  return buildReviewPlanTurn(chunkedReply, actions.slice(0, 25), assumptions, {
    kind: 'local-sequence',
    intentId,
    originPrompt: prompt,
    summary,
    stepIndex: 1,
    totalSteps,
    remainingActions,
    resolvedRefs: {},
    autoContinue: true,
  })
}

const buildContinuationTurn = (
  continuation: AssistantContinuation,
): AssistantTurnResult | null => {
  if (continuation.kind !== 'local-sequence') return null
  if (continuation.remainingActions.length === 0) return null

  const resolvedActions = continuation.remainingActions.map((action) =>
    resolveAssistantActionRefs(action, continuation.resolvedRefs ?? {}),
  )
  const nextStepIndex = Math.min(continuation.stepIndex + 1, continuation.totalSteps)
  const remainingActions = resolvedActions.slice(25)

  return buildReviewPlanTurn(
    `${continuation.summary} Continuing step ${nextStepIndex} of ${continuation.totalSteps}.`,
    resolvedActions.slice(0, 25),
    [`Continuing the existing build for "${continuation.originPrompt}".`],
    remainingActions.length > 0
      ? {
        ...continuation,
        stepIndex: nextStepIndex,
        remainingActions,
        resolvedRefs: continuation.resolvedRefs ?? {},
      }
      : null,
  )
}

const moveTargetTypes = new Set(['item', 'cad-body', 'guide', 'scan', 'door', 'window', 'roof', 'zone'])
const scaleTargetTypes = new Set(['item', 'cad-body', 'guide', 'scan'])

const buildDeterministicAssistantTurn = (
  body: AssistantPlanRequest,
): AssistantTurnResult | null => {
  const prompt = body.prompt.trim()
  const normalizedPrompt = normalizePrompt(prompt)
  const image = getAssistantPlanImage(body)
  const imageInterpretation = interpretAssistantImage({
    prompt,
    image,
    context: body.context,
  })
  if (body.continuation) {
    const continuationTurn = buildContinuationTurn(body.continuation)
    if (continuationTurn) return continuationTurn
  }
  const selection = getSelectionContext(body.context)
  const selectedCadBodies = getSelectedCadBodies(body.context)
  const selectedCadBody = selectedCadBodies[0] ?? null
  const selectedCadSketch = getSelectedCadSketch(body.context)
  const targetResolution = resolveAssistantPromptTarget({
    context: body.context as Record<string, unknown> | undefined,
    imageInterpretation,
    normalizedPrompt,
    selection,
    allowRecentAssistantFallback: body.chatMode === 'refine',
  })
  const explicitSelectedTarget = targetResolution.explicitSelectedTarget
  const selectedTarget = targetResolution.target
  const hasMultipleSelectedTargets = selection.selectedIds.length > 1
  const targetResolutionMetadata = getTargetResolutionMetadata({
    explanation: targetResolution.explanation,
    imageInterpretation,
    targetCandidates: targetResolution.candidates,
  })

  if (
    /\b(what can you help me build here|what can you do here|what can you do|help)\b/.test(
      normalizedPrompt,
    )
  ) {
    return buildHelpTurn()
  }

  const conversationalTurn = buildConversationalTurn(normalizedPrompt)
  if (conversationalTurn) return conversationalTurn

  const conversationMemoryTurn = buildConversationMemoryTurn(body, normalizedPrompt)
  if (conversationMemoryTurn) return conversationMemoryTurn

  const petHouseCritiqueTurn = buildPetHouseCritiqueTurn(body, normalizedPrompt)
  if (petHouseCritiqueTurn) return petHouseCritiqueTurn

  const pendingBoxFollowUpTurn = buildPendingBoxFollowUpTurn(
    body,
    normalizedPrompt,
    selectedTarget,
    selectedCadBody,
  )
  if (pendingBoxFollowUpTurn) return pendingBoxFollowUpTurn

  const isReplaceRequest =
    /\b(replace|swap|switch out|cambia|cambiar|reemplaza|reemplazar|sustituye|sustituir)\b/i.test(
      normalizedPrompt,
    )
  const isFurnishRequest = /\b(furnish|amuebla|amueblar)\b/i.test(normalizedPrompt)

  const matchingRecipe =
    !isReplaceRequest && !isFurnishRequest ? findMatchingRecipe(prompt) : null
  if (matchingRecipe) {
    const requestedDimensions = parsePlanarMetricDimensions(prompt)
    const actions = matchingRecipe.generateActions({
      width: requestedDimensions?.width ?? undefined,
      height: requestedDimensions?.height ?? undefined,
      depth: requestedDimensions?.depth ?? undefined,
      position: [0, 0, 0],
    })

    if (/\borbit\b/i.test(normalizedPrompt)) {
      actions.push({ type: 'orbit_camera', direction: 'ccw' })
    }
    if (/\bfocus\b/i.test(normalizedPrompt)) {
      const rootAction = actions.find(
        (a) => 'refId' in a && typeof a.refId === 'string' && a.refId,
      )
      if (rootAction && 'refId' in rootAction && typeof rootAction.refId === 'string') {
        actions.push({ type: 'focus_camera_on_nodes', nodeIds: [rootAction.refId] })
      } else {
        actions.push({ type: 'focus_camera_on_nodes', nodeIds: [] })
      }
    }

    return {
      reply: `I have prepared the plan to build ${matchingRecipe.name}.`,
      mode: 'plan',
      assumptions: [
        `Generated 3D elements for ${matchingRecipe.name}.`,
        'Positioned at workspace origin.',
        ...(actions.some((a) => a.type === 'orbit_camera') ? ['Orbits camera to view the generated model.'] : []),
        ...(actions.some((a) => a.type === 'focus_camera_on_nodes' || a.type === 'focus_building') ? ['Frames camera on the generated model.'] : []),
      ],
      ambiguities: [],
      actions,
      requiresReview: false,
      destructiveActionCount: 0,
    }
  }

  if (isUnsupportedCreationPrompt(normalizedPrompt)) {
    return buildChatTurn(
      'I cannot create an exact branded, animation-heavy, or highly organic replica in the current editor stack. I can build a simplified editable proxy with similar proportions and layout if you want a nearest buildable fallback.',
      ['The current editor stack is optimized for editable architectural scenes, catalog items, and simple CAD prototypes.'],
    )
  }

  const levelScaffoldTurn = buildLevelScaffoldTurn(body, normalizedPrompt, selection)
  if (levelScaffoldTurn) return levelScaffoldTurn

  const roomRecipeTurn = buildRoomRecipeTurn(body, normalizedPrompt, selection)
  if (roomRecipeTurn) return roomRecipeTurn

  const petHouseRecipeTurn = buildPetHouseRecipeTurn(body, normalizedPrompt, selection)
  if (petHouseRecipeTurn) return petHouseRecipeTurn

  const houseShellRecipe = buildHouseShellRecipeTurn(body, normalizedPrompt, selection)
  if (houseShellRecipe) return houseShellRecipe

  const cafeRecipeTurn = buildCafeRecipeTurn(body, normalizedPrompt, selection)
  if (cafeRecipeTurn) return cafeRecipeTurn

  const furnishRoomRecipe = buildFurnishRoomRecipeTurn(body, normalizedPrompt, selection)
  if (furnishRoomRecipe) return furnishRoomRecipe

  const refinementTurn = buildRefinementTurn(body, normalizedPrompt, selection, selectedTarget)
  if (refinementTurn) return refinementTurn

  const actions: AssistantAction[] = []

  const requestedPhase = assistantPhaseValues.find(
    (phase) =>
      normalizedPrompt.includes(`switch to ${phase}`) ||
      normalizedPrompt.includes(`go to ${phase}`) ||
      normalizedPrompt.includes(`open ${phase}`),
  )
  if (requestedPhase) {
    actions.push({ type: 'set_phase', phase: requestedPhase })
  }

  const requestedCameraMode = /\b(orthographic|ortho)\b/.test(normalizedPrompt)
    ? 'orthographic'
    : /\bperspective\b/.test(normalizedPrompt)
      ? 'perspective'
      : null
  if (
    requestedCameraMode &&
    /\b(camera|view)\b/.test(normalizedPrompt) &&
    /\b(switch|set|use|change|cambiar|cambia|pon|poner)\b/.test(normalizedPrompt)
  ) {
    actions.push({ type: 'set_camera_mode', cameraMode: requestedCameraMode })
  }

  const requestedTheme = /\b(dark|oscuro)\b/.test(normalizedPrompt)
    ? 'dark'
    : /\b(light|claro)\b/.test(normalizedPrompt)
      ? 'light'
      : null
  if (
    requestedTheme &&
    /\b(theme|appearance|modo)\b/.test(normalizedPrompt) &&
    /\b(switch|set|use|change|cambiar|cambia|pon|poner)\b/.test(normalizedPrompt)
  ) {
    actions.push({ type: 'set_theme', theme: requestedTheme })
  }

  const requestedLevelViewMode = /\bmanual\b/.test(normalizedPrompt)
    ? 'manual'
    : /\bstacked\b/.test(normalizedPrompt)
      ? 'stacked'
      : /\bexploded\b/.test(normalizedPrompt)
        ? 'exploded'
        : /\bsolo\b/.test(normalizedPrompt)
          ? 'solo'
          : null
  if (requestedLevelViewMode && /\blevel mode\b|\bfloor mode\b/.test(normalizedPrompt)) {
    actions.push({ type: 'set_level_view_mode', levelMode: requestedLevelViewMode })
  }

  const requestedWallViewMode = /\bcutaway\b/.test(normalizedPrompt)
    ? 'cutaway'
    : /\bwall mode up\b|\bwalls up\b|\bup wall mode\b/.test(normalizedPrompt)
      ? 'up'
      : /\bwall mode down\b|\bwalls down\b|\bdown wall mode\b/.test(normalizedPrompt)
        ? 'down'
        : null
  if (requestedWallViewMode && /\bwall mode\b|\bwalls (?:up|down)\b/.test(normalizedPrompt)) {
    actions.push({ type: 'set_wall_view_mode', wallMode: requestedWallViewMode })
  }

  const shouldEnterPreview =
    /\b(preview mode|preview)\b/.test(normalizedPrompt) &&
    /\b(enter|open|enable|start|use|show|switch to|activar|activa)\b/.test(normalizedPrompt)
  const shouldExitPreview =
    /\b(preview mode|preview)\b/.test(normalizedPrompt) &&
    /\b(exit|leave|close|disable|stop|hide|salir|desactiva|desactivar)\b/.test(normalizedPrompt)
  if (shouldEnterPreview) {
    actions.push({ type: 'set_preview_mode', enabled: true })
  } else if (shouldExitPreview) {
    actions.push({ type: 'set_preview_mode', enabled: false })
  }

  const shouldShowScans =
    /\b(scans?|mesh scans?|3d scans?)\b/.test(normalizedPrompt) &&
    /\b(show|enable|display|turn on|activar|activa|muestra)\b/.test(normalizedPrompt)
  const shouldHideScans =
    /\b(scans?|mesh scans?|3d scans?)\b/.test(normalizedPrompt) &&
    /\b(hide|disable|turn off|remove|oculta|ocultar|desactiva|desactivar)\b/.test(
      normalizedPrompt,
    )
  if (shouldShowScans) {
    actions.push({ type: 'set_scans_visibility', enabled: true })
  } else if (shouldHideScans) {
    actions.push({ type: 'set_scans_visibility', enabled: false })
  }

  const shouldShowGuides =
    /\b(guides?|floorplans?|floor plans?|planos?)\b/.test(normalizedPrompt) &&
    /\b(show|enable|display|turn on|activar|activa|muestra)\b/.test(normalizedPrompt)
  const shouldHideGuides =
    /\b(guides?|floorplans?|floor plans?|planos?)\b/.test(normalizedPrompt) &&
    /\b(hide|disable|turn off|remove|oculta|ocultar|desactiva|desactivar)\b/.test(
      normalizedPrompt,
    )
  if (shouldShowGuides) {
    actions.push({ type: 'set_guides_visibility', enabled: true })
  } else if (shouldHideGuides) {
    actions.push({ type: 'set_guides_visibility', enabled: false })
  }

  const shouldShowGrid =
    /\bgrid\b/.test(normalizedPrompt) &&
    /\b(show|enable|display|turn on|activar|activa|muestra)\b/.test(normalizedPrompt)
  const shouldHideGrid =
    /\bgrid\b/.test(normalizedPrompt) &&
    /\b(hide|disable|turn off|remove|oculta|ocultar|desactiva|desactivar)\b/.test(
      normalizedPrompt,
    )
  if (shouldShowGrid) {
    actions.push({ type: 'set_grid_visibility', enabled: true })
  } else if (shouldHideGrid) {
    actions.push({ type: 'set_grid_visibility', enabled: false })
  }

  const topViewRequest = /\b(top view|view from top|birds eye|bird's eye|vista superior)\b/.test(
    normalizedPrompt,
  )
  const orbitLeftRequest =
    /\b(orbit left|rotate camera left|turn camera left|gira la camara a la izquierda)\b/.test(
      normalizedPrompt,
    ) || /\borbit (?:ccw|counterclockwise)\b/.test(normalizedPrompt)
  const orbitRightRequest =
    /\b(orbit right|rotate camera right|turn camera right|gira la camara a la derecha)\b/.test(
      normalizedPrompt,
    ) || /\borbit (?:cw|clockwise)\b/.test(normalizedPrompt)

  if (topViewRequest) {
    actions.push({ type: 'camera_top_view' })
  }
  if (orbitLeftRequest) {
    actions.push({ type: 'orbit_camera', direction: 'ccw' })
  } else if (orbitRightRequest) {
    actions.push({ type: 'orbit_camera', direction: 'cw' })
  }

  const shouldEnterFullscreen =
    /\b(fullscreen|pantalla completa)\b/.test(normalizedPrompt) &&
    /\b(enter|open|enable|start|use|show|switch to|activar|activa)\b/.test(normalizedPrompt)
  const shouldExitFullscreen =
    /\b(fullscreen|pantalla completa)\b/.test(normalizedPrompt) &&
    /\b(exit|leave|close|disable|stop|hide|salir|desactiva|desactivar)\b/.test(normalizedPrompt)
  if (shouldEnterFullscreen) {
    actions.push({ type: 'set_fullscreen', enabled: true })
  } else if (shouldExitFullscreen) {
    actions.push({ type: 'set_fullscreen', enabled: false })
  }

  const undoRequest = /^(undo|deshacer)\b/.test(normalizedPrompt) || /\bundo last\b/.test(normalizedPrompt)
  const redoRequest = /^(redo|rehacer)\b/.test(normalizedPrompt) || /\bredo last\b/.test(normalizedPrompt)
  if (undoRequest) {
    actions.push({ type: 'undo_history' })
  } else if (redoRequest) {
    actions.push({ type: 'redo_history' })
  }

  const exportJsonRequest =
    /\b(export|download|save)\b/.test(normalizedPrompt) && /\bjson\b/.test(normalizedPrompt)
  const exportIfcRequest =
    /\b(export|download|save)\b/.test(normalizedPrompt) &&
    (/\bifc\b/.test(normalizedPrompt) || /\bbim metadata\b/.test(normalizedPrompt))
  const exportGlbRequest =
    /\b(export|download|save)\b/.test(normalizedPrompt) &&
    (/\bglb\b/.test(normalizedPrompt) ||
      /\bgltf\b/.test(normalizedPrompt) ||
      /\b3d model\b/.test(normalizedPrompt) ||
      /\bmodel\b/.test(normalizedPrompt))

  if (exportJsonRequest) {
    actions.push({ type: 'export_scene', format: 'json' })
  } else if (exportIfcRequest) {
    actions.push({ type: 'export_scene', format: 'ifc' })
  } else if (exportGlbRequest) {
    actions.push({ type: 'export_scene', format: 'glb' })
  }

  const copyShareLinkRequest =
    /\b(copy|share|copiar|copia|compartir)\b/.test(normalizedPrompt) &&
    /\b(link|url)\b/.test(normalizedPrompt)
  if (copyShareLinkRequest) {
    actions.push({ type: 'copy_share_link' })
  }

  const requestedTransformMode = /\b(move|translate|mover|mueve)\s+(?:mode|gizmo)\b|\b(?:enter|open|use)\s+move\s+(?:mode|gizmo)\b/.test(
    normalizedPrompt,
  )
    ? 'move'
    : /\brotate\s+(?:mode|gizmo)\b|\b(?:enter|open|use)\s+rotate\s+(?:mode|gizmo)\b|\brotar\s+(?:modo|gizmo)\b/.test(
      normalizedPrompt,
    )
      ? 'rotate'
      : /\bscale\s+(?:mode|gizmo)\b|\b(?:enter|open|use)\s+scale\s+(?:mode|gizmo)\b|\bescala\s+(?:modo|gizmo)\b/.test(
        normalizedPrompt,
      )
        ? 'scale'
        : null
  if (requestedTransformMode) {
    actions.push({ type: 'set_transform_mode', transformMode: requestedTransformMode })
  }

  const requestedTransformPivot = /\b(pivot|origin point|transform origin)\b/.test(normalizedPrompt)
    ? /\b(asset origin|object origin|origin)\b/.test(normalizedPrompt)
      ? 'asset-origin'
      : /\b(bounds center|center|centre)\b/.test(normalizedPrompt)
        ? 'bounds-center'
        : null
    : null
  if (requestedTransformPivot) {
    actions.push({ type: 'set_transform_pivot', pivot: requestedTransformPivot })
  }

  const clearSelectionRequest =
    /\b(clear selection|deselect|unselect|clear highlights|select nothing)\b/.test(normalizedPrompt)
  if (clearSelectionRequest) {
    actions.push({ type: 'select_nodes', nodeIds: [] })
  }

  const focusBuildingRequest =
    Boolean(selection.buildingId) &&
    /\b(building)\b/.test(normalizedPrompt) &&
    /\b(select|focus|open|show|go to)\b/.test(normalizedPrompt) &&
    !/\blevel\b/.test(normalizedPrompt)
  if (focusBuildingRequest && selection.buildingId) {
    actions.push({ type: 'focus_building', buildingId: selection.buildingId })
  }

  const snapshotTargetId = getDefaultSnapshotTargetId(selection)
  const wantsCameraSnapshot = /\b(camera snapshot|snapshot|bookmark view)\b/.test(normalizedPrompt)
  const wantsCaptureSnapshot =
    wantsCameraSnapshot &&
    /\b(capture|take|save|update|guardar|captura|capturar|actualiza)\b/.test(normalizedPrompt)
  const wantsViewSnapshot =
    wantsCameraSnapshot &&
    /\b(view|show|open|load|see|ver|mostrar|abre)\b/.test(normalizedPrompt)
  const wantsClearSnapshot =
    wantsCameraSnapshot &&
    /\b(clear|remove|delete|reset|clear out|borrar|elimina|limpia)\b/.test(normalizedPrompt)
  const screenshotRequest =
    !wantsCameraSnapshot &&
    /\b(screenshot|screen shot|png|capture image|take screenshot|captura de pantalla)\b/.test(
      normalizedPrompt,
    )

  if ((wantsCaptureSnapshot || wantsViewSnapshot || wantsClearSnapshot) && !snapshotTargetId) {
    return buildClarifyTurn('I need a selected node, zone, or level before I can manage a camera snapshot.', [
      'Select one node, zone, or level and try again.',
    ])
  }

  if (snapshotTargetId && wantsCaptureSnapshot) {
    actions.push({ type: 'capture_camera_snapshot', nodeId: snapshotTargetId })
  } else if (snapshotTargetId && wantsViewSnapshot) {
    actions.push({ type: 'view_camera_snapshot', nodeId: snapshotTargetId })
  } else if (snapshotTargetId && wantsClearSnapshot) {
    actions.push({ type: 'clear_camera_snapshot', nodeId: snapshotTargetId })
  } else if (screenshotRequest) {
    actions.push({ type: 'take_screenshot' })
  }

  const toolPatterns: Array<{ pattern: RegExp; tool: (typeof assistantToolValues)[number] }> = [
    { pattern: /\bwall tool\b|\bopen wall\b|\buse wall\b/, tool: 'wall' },
    { pattern: /\bzone tool\b|\bopen zone\b|\buse zone\b/, tool: 'zone' },
    { pattern: /\bslab tool\b|\bopen slab\b|\buse slab\b/, tool: 'slab' },
    { pattern: /\bceiling tool\b|\bopen ceiling\b|\buse ceiling\b/, tool: 'ceiling' },
    { pattern: /\broof tool\b|\bopen roof\b|\buse roof\b/, tool: 'roof' },
    { pattern: /\bdoor tool\b|\bopen door\b|\buse door\b/, tool: 'door' },
    { pattern: /\bwindow tool\b|\bopen window\b|\buse window\b/, tool: 'window' },
    { pattern: /\bcad sketch\b|\bsketch tool\b/, tool: 'cad-sketch' },
    { pattern: /\bcad line\b|\bline tool\b|\bdraw line\b/, tool: 'cad-line' },
    { pattern: /\bcad rectangle\b|\brectangle tool\b/, tool: 'cad-rectangle' },
    { pattern: /\bcad circle\b|\bcircle tool\b/, tool: 'cad-circle' },
    { pattern: /\bcad arc\b|\barc tool\b/, tool: 'cad-arc' },
    { pattern: /\bcad polyline\b|\bpolyline tool\b/, tool: 'cad-polyline' },
    { pattern: /\bcoincident constraint\b|\bcoincident tool\b/, tool: 'cad-coincident' },
    { pattern: /\bhorizontal constraint\b|\bvertical constraint\b/, tool: 'cad-horizontal-vertical' },
    { pattern: /\bparallel constraint\b|\bperpendicular constraint\b/, tool: 'cad-parallel-perpendicular' },
    { pattern: /\btangent constraint\b|\btangent tool\b/, tool: 'cad-tangent' },
    { pattern: /\bequal constraint\b|\bequal tool\b/, tool: 'cad-equal' },
    { pattern: /\bdimension tool\b|\bdimension constraint\b/, tool: 'cad-dimension' },
    { pattern: /\bextrude tool\b|\bcad extrude\b|\bpad tool\b/, tool: 'cad-extrude' },
    { pattern: /\brevolve tool\b|\bcad revolve\b/, tool: 'cad-revolve' },
    { pattern: /\bboolean tool\b|\bcad boolean\b/, tool: 'cad-boolean' },
    { pattern: /\bfillet tool\b|\bcad fillet\b/, tool: 'cad-fillet' },
    { pattern: /\bchamfer tool\b|\bcad chamfer\b/, tool: 'cad-chamfer' },
    { pattern: /\bimport step\b|\bcad import\b/, tool: 'cad-import-step' },
    { pattern: /\binspect tool\b|\binspect geometry\b/, tool: 'cad-inspect' },
  ]

  const requestedCatalogCategory = assistantCatalogCategoryValues.find((category) =>
    new RegExp(`\\b${category}\\b`).test(normalizedPrompt),
  )

  const requestedTool = toolPatterns.find(({ pattern }) => pattern.test(normalizedPrompt))?.tool
  if (requestedTool) {
    if (requestedTool === 'item' && requestedCatalogCategory) {
      actions.push({
        type: 'activate_tool',
        tool: requestedTool,
        catalogCategory: requestedCatalogCategory,
      })
    } else {
      actions.push({
        type: 'activate_tool',
        tool: requestedTool,
      })
    }
  } else if (
    requestedCatalogCategory &&
    /\b(item|items|catalog|library|tool|assets?|furniture|appliance|kitchen|bathroom|outdoor)\b/.test(
      normalizedPrompt,
    )
  ) {
    actions.push({
      type: 'activate_tool',
      tool: 'item',
      catalogCategory: requestedCatalogCategory,
    })
  }

  if (/\bselect tool\b|\buse select\b/.test(normalizedPrompt)) {
    actions.push({ type: 'set_mode', mode: 'select' })
  }

  const requestedWorkplane = parseCadWorkplane(normalizedPrompt)
  if (requestedWorkplane) {
    const hasCadPhaseAction = actions.some((action) => action.type === 'set_phase' && action.phase === 'cad')
    if (!hasCadPhaseAction) {
      actions.push({ type: 'set_phase', phase: 'cad' })
    }
    actions.push({ type: 'set_cad_workplane', workplane: requestedWorkplane })
  }

  const shouldCreateSketch =
    /\b(new|create|start|open)\b/.test(normalizedPrompt) &&
    /\b(sketch|perfil)\b/.test(normalizedPrompt) &&
    !/\btool\b/.test(normalizedPrompt) &&
    !/\bclose\b|\bfinish\b|\bend\b|\bcerrar\b|\btermina\b|\bfinaliza\b/.test(normalizedPrompt)

  if (shouldCreateSketch) {
    const hasCadPhaseAction = actions.some((action) => action.type === 'set_phase' && action.phase === 'cad')
    if (!hasCadPhaseAction) {
      actions.push({ type: 'set_phase', phase: 'cad' })
    }
    actions.push({ type: 'create_default_cad_sketch' })
  }

  const shouldCloseSketch =
    /\b(close|finish|end|cerrar|termina|finaliza)\b/.test(normalizedPrompt) &&
    /\b(sketch|perfil)\b/.test(normalizedPrompt)

  if (shouldCloseSketch && !selectedCadSketch) {
    return buildClarifyTurn('I need an active CAD sketch before I can close it.', [
      'Open or select the CAD sketch you want to close first.',
    ])
  }

  if (shouldCloseSketch) {
    actions.push({ type: 'close_cad_sketch', sketchId: selectedCadSketch?.id })
  }

  if (actions.length > 0) {
    const requiresReview = actions.some((action) => !isSafeImmediateAssistantActionType(action.type))
    let reply = 'I can update the workspace state and editor controls.'
    if (shouldCreateSketch) {
      reply = 'I can switch the CAD context and start a sketch.'
    } else if (shouldCloseSketch) {
      reply = 'I can close the active CAD sketch.'
    } else if (undoRequest) {
      reply = 'I can undo the last scene change.'
    } else if (redoRequest) {
      reply = 'I can redo the last undone scene change.'
    } else if (shouldEnterFullscreen) {
      reply = 'I can enter fullscreen mode.'
    } else if (shouldExitFullscreen) {
      reply = 'I can exit fullscreen mode.'
    } else if (shouldShowScans) {
      reply = 'I can show the scans.'
    } else if (shouldHideScans) {
      reply = 'I can hide the scans.'
    } else if (shouldShowGuides) {
      reply = 'I can show the guides.'
    } else if (shouldHideGuides) {
      reply = 'I can hide the guides.'
    } else if (shouldShowGrid) {
      reply = 'I can show the grid.'
    } else if (shouldHideGrid) {
      reply = 'I can hide the grid.'
    } else if (topViewRequest) {
      reply = 'I can switch to the top view camera.'
    } else if (orbitLeftRequest) {
      reply = 'I can orbit the camera to the left.'
    } else if (orbitRightRequest) {
      reply = 'I can orbit the camera to the right.'
    } else if (exportJsonRequest) {
      reply = 'I can export the scene as JSON.'
    } else if (exportIfcRequest) {
      reply = 'I can export the scene as IFC.'
    } else if (exportGlbRequest) {
      reply = 'I can export the scene as GLB.'
    } else if (copyShareLinkRequest) {
      reply = 'I can copy the current share link.'
    } else if (screenshotRequest) {
      reply = 'I can take a screenshot of the current view.'
    } else if (wantsCaptureSnapshot) {
      reply = 'I can capture a camera snapshot for the current target.'
    } else if (wantsViewSnapshot) {
      reply = 'I can open the saved camera snapshot for the current target.'
    } else if (wantsClearSnapshot) {
      reply = 'I can clear the saved camera snapshot for the current target.'
    } else if (requestedTransformMode) {
      reply = `I can switch the transform gizmo to ${requestedTransformMode}.`
    } else if (requestedTransformPivot) {
      reply = `I can switch the transform pivot to ${requestedTransformPivot}.`
    } else if (clearSelectionRequest) {
      reply = 'I can clear the current selection.'
    } else if (focusBuildingRequest) {
      reply = 'I can focus the active building.'
    } else if (requestedTool === 'item' && requestedCatalogCategory) {
      reply = `I can open the ${requestedCatalogCategory} item tool.`
    } else if (requestedCatalogCategory) {
      reply = `I can open the ${requestedCatalogCategory} item tool.`
    } else if (requestedTool && requestedPhase) {
      reply = `I can switch to ${requestedPhase} and open the ${formatAssistantToolLabel(requestedTool)} tool.`
    } else if (requestedTool) {
      reply = `I can open the ${formatAssistantToolLabel(requestedTool)} tool.`
    } else if (requestedPhase) {
      reply = `I can switch to ${requestedPhase}.`
    }

    return requiresReview
      ? buildReviewPlanTurn(reply, actions)
      : buildSafePlanTurn(reply, actions)
  }

  const placementRequest =
    /\b(place|put|add|insert|drop|set|pon|coloca|agrega|anade|añade)\b/.test(normalizedPrompt)
  const centerPlacementRequest = /\b(center|centre|middle|centro)\b/.test(normalizedPrompt)
  const roomTargetRequest = /\b(room|zone|space|sala|habitacion|habitación|cuarto)\b/.test(
    normalizedPrompt,
  )
  const catalogItem = placementRequest ? findCatalogItemFromPrompt(body.context, normalizedPrompt) : null

  if (placementRequest && catalogItem) {
    const targetNodeId = centerPlacementRequest || roomTargetRequest
      ? getPlacementTargetId(body.context, selection, selectedTarget)
      : null

    if ((centerPlacementRequest || roomTargetRequest) && !targetNodeId) {
      return buildClarifyTurn(`I need a room, zone, or level target before I can place ${catalogItem.name}.`, [
        'Select the room or level where the item should be placed, or name the target explicitly.',
      ])
    }

    if (catalogItem.attachTo && !targetNodeId) {
      return buildClarifyTurn(`I need a target surface before I can place ${catalogItem.name}.`, [
        'Select or name the wall, ceiling, or host surface for that item.',
      ])
    }

    const assumptions: string[] = []
    if (targetNodeId && targetNodeId !== selection.zoneId && roomTargetRequest) {
      assumptions.push('Using the current workspace target as the room placement anchor.')
    }

    return buildReviewPlanTurn(
      centerPlacementRequest || roomTargetRequest
        ? `I can place ${catalogItem.name} in the center of the room.`
        : `I can place ${catalogItem.name}.`,
      [
        {
          type: 'place_item',
          assetId: catalogItem.id,
          ...(targetNodeId ? { targetNodeId } : {}),
          placement: centerPlacementRequest || roomTargetRequest ? 'center' : 'explicit',
        },
      ],
      assumptions,
    )
  }

  const booleanOperation = /\b(cut|subtract|difference|remove)\b/.test(normalizedPrompt)
    ? 'cut'
    : /\b(intersect|intersection|common)\b/.test(normalizedPrompt)
      ? 'intersect'
      : /\b(boolean|union|join|combine|merge)\b/.test(normalizedPrompt)
        ? 'union'
        : null

  if (selectedCadBodies.length >= 2 && booleanOperation) {
    return buildReviewPlanTurn(
      'I can apply that Boolean operation to the selected CAD bodies.',
      [
        {
          type: 'apply_cad_boolean',
          operation: booleanOperation,
          targetBodyId: selectedCadBodies[0]?.id,
          toolBodyId: selectedCadBodies[1]?.id,
        },
      ],
      ['Using the first selected CAD body as the target and the second as the tool body.'],
    )
  }

  const clearLevelRequest =
    /\b(clean|clear|wipe|empty|reset|start over|limpia|limpiar|vaciar|reinicia|reiniciar)\b/.test(
      normalizedPrompt,
    ) &&
    /\b(everything|all|scene|workspace|level|floor|todo|toda|todos|escena|nivel|planta)\b/.test(
      normalizedPrompt,
    )

  if (clearLevelRequest) {
    if (!selection.levelId) {
      return buildClarifyTurn('I need a level target before I can clean everything safely.', [
        'Select the level you want to clear and try again.',
      ])
    }

    return buildReviewPlanTurn(
      'I can clear the current level and leave it blank.',
      [{ type: 'clear_level_contents', levelId: selection.levelId }],
      ['Using the current level as the cleanup boundary.'],
    )
  }

  const duplicateRequest = /\b(duplicate|clone|copy|duplica|clona|copia)\b/.test(normalizedPrompt)
  const deleteRequest = /\b(delete|remove|erase|borrar|borra|elimina|eliminar)\b/.test(normalizedPrompt)
  const hideRequest = /\b(hide|oculta|ocultar)\b/.test(normalizedPrompt)
  const moveRequest = /\b(move|translate|mueve|mover|desplaza|desplazar)\b/.test(normalizedPrompt)
  const replaceRequest = /\b(replace|swap|switch out|cambia|cambiar|reemplaza|reemplazar|sustituye|sustituir)\b/.test(
    normalizedPrompt,
  )
  const rotateRequest =
    /\b(rotate|turn|spin|rota|rotar|gira)\b/.test(normalizedPrompt) &&
    !(selectedCadSketch && /\b(sketch|perfil)\b/.test(normalizedPrompt))
  const scaleRequest =
    /\b(scale|resize|rescale|escala|redimensiona|agranda|encoge|bigger|larger|smaller|grow|shrink)\b/.test(
      normalizedPrompt,
    )
  const clearAreaRequest =
    imageInterpretation?.kind === 'workspace' &&
    isWorkspaceImageCommandPrompt(prompt, image, body.context) &&
    /\b(clean|clear|wipe|empty|limpia|limpiar|vaciar)\b/.test(normalizedPrompt) &&
    /\b(area|region|highlight|circled|marked|this|that|esta|esto|esa|ese|zona|habitacion)\b/.test(
      normalizedPrompt,
    )
  const replacementCatalogItem = replaceRequest
    ? findCatalogItemFromPrompt(body.context, getReplacementPrompt(normalizedPrompt))
    : null

  const imageGroundedDestructiveTurn = prepareImageGroundedDestructiveTurn({
    clearAreaRequest,
    deleteRequest,
    hideRequest,
    imageInterpretation,
    selectedTarget,
    targetResolution,
    targetResolutionMetadata,
  })
  if (imageGroundedDestructiveTurn) {
    return imageGroundedDestructiveTurn
  }

  if (hasMultipleSelectedTargets && deleteRequest) {
    return buildReviewPlanTurn(
      'I can delete the selected targets.',
      [{ type: 'delete_nodes', nodeIds: selection.selectedIds }],
      [`Using the ${selection.selectedIds.length} selected targets as the deletion set.`],
    )
  }

  if (hasMultipleSelectedTargets && (duplicateRequest || moveRequest || rotateRequest || scaleRequest)) {
    return buildClarifyTurn('I need a single selected target before I can do that.', [
      'Select one node and try again.',
    ])
  }

  if (!selectedTarget && (duplicateRequest || deleteRequest || hideRequest || moveRequest || rotateRequest || scaleRequest || replaceRequest)) {
    return buildClarifyTurn('I need a selected target before I can do that.', [
      'Select one node and try again.',
    ], targetResolutionMetadata)
  }

  if (selectedTarget && duplicateRequest) {
    return buildReviewPlanTurn(
      'I can duplicate the selected target.',
      [{ type: 'duplicate_target', nodeId: selectedTarget.id }],
      [
        describeResolvedTargetAssumption(selectedTarget, 'duplication', targetResolution.source),
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  if (selectedTarget && replaceRequest) {
    if (selectedTarget.type !== 'item') {
      return buildClarifyTurn(`I can only replace editable item targets right now, not ${selectedTarget.type} nodes.`, [
        'Select an item, then say what to replace it with.',
      ], targetResolutionMetadata)
    }
    if (!replacementCatalogItem) {
      return buildClarifyTurn('I need the replacement catalog item before I can do that.', [
        'Mention the replacement item explicitly, for example chair, sofa, table, or lamp.',
      ], targetResolutionMetadata)
    }

    const targetRecord = getAssistantNodeRecordById(body.context, selectedTarget.id)
    const targetPosition = targetRecord ? getNodePosition(targetRecord) : null
    const targetAsset = targetRecord ? getAssetRecord(targetRecord) : null
    const replacementTargetId =
      typeof targetRecord?.parentId === 'string' && targetRecord.parentId.length > 0
        ? targetRecord.parentId
        : undefined

    return buildReviewPlanTurn(
      `I can replace "${selectedTarget.name ?? selectedTarget.id}" with ${replacementCatalogItem.name}.`,
      [
        {
          type: 'place_item',
          assetId: replacementCatalogItem.id,
          ...(replacementTargetId ? { targetNodeId: replacementTargetId } : {}),
          placement: 'explicit',
          ...(targetPosition ? { position: targetPosition } : {}),
        },
        { type: 'delete_target', nodeId: selectedTarget.id },
      ],
      [
        describeResolvedTargetAssumption(selectedTarget, 'replacement', targetResolution.source),
        targetAsset && typeof targetAsset.name === 'string'
          ? `Replacing the current ${targetAsset.name} with the nearest editable ${replacementCatalogItem.name} catalog asset.`
          : `Replacing the current item with the nearest editable ${replacementCatalogItem.name} catalog asset.`,
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  if (selectedTarget && deleteRequest) {
    return buildReviewPlanTurn(
      'I can delete the selected target.',
      [{ type: 'delete_target', nodeId: selectedTarget.id }],
      [
        describeResolvedTargetAssumption(selectedTarget, 'deletion', targetResolution.source),
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  if (selectedTarget && hideRequest) {
    return buildReviewPlanTurn(
      'I can hide the resolved target.',
      [{ type: 'set_node_visibility', nodeIds: [selectedTarget.id], visible: false }],
      [
        describeResolvedTargetAssumption(selectedTarget, 'visibility change', targetResolution.source),
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  if (selectedTarget && moveRequest) {
    const delta = parseMoveDelta(prompt, normalizedPrompt)
    if (!delta) {
      return buildClarifyTurn('I need a move direction before I can do that.', [
        'Specify a direction such as left, right, up, down, or an axis direction.',
      ], targetResolutionMetadata)
    }
    if (!moveTargetTypes.has(selectedTarget.type)) {
      return buildClarifyTurn(`The selected ${selectedTarget.type} does not support move actions here.`, [
        'Select an item, CAD body, guide, scan, door, window, or roof instead.',
      ], targetResolutionMetadata)
    }

    const usedDefaultDistance = parseSingleMetricValue(prompt) == null
    const assumptions = [
      describeResolvedTargetAssumption(selectedTarget, 'move', targetResolution.source),
    ]
    if (usedDefaultDistance) assumptions.push('Using a default move distance of 1 m.')

    const isDogHouseAssembly = selectedTarget.type === 'zone' && /dog ?house/i.test(selectedTarget.name ?? '')
    const moveActions: AssistantAction[] = []

    if (isDogHouseAssembly) {
      const nodes = getAssistantNodeRecords(body.context)
      const assemblyNodes = nodes.filter(n => /dog ?house/i.test(n.name ?? '') || n.id === selectedTarget.id)
      assemblyNodes.forEach((n) => {
        moveActions.push({ type: 'move_target', nodeId: n.id, delta })
      })
    } else {
      moveActions.push({ type: 'move_target', nodeId: selectedTarget.id, delta })
    }

    return buildReviewPlanTurn(
      isDogHouseAssembly ? 'I can move the dog house assembly.' : 'I can move the selected target.',
      moveActions,
      assumptions,
      undefined,
      targetResolutionMetadata,
    )
  }

  if (selectedTarget && rotateRequest) {
    if (!moveTargetTypes.has(selectedTarget.type)) {
      return buildClarifyTurn(`The selected ${selectedTarget.type} does not support rotation here.`, [
        'Select an item, CAD body, guide, scan, door, window, or roof instead.',
      ], targetResolutionMetadata)
    }

    const degrees = parseRotationDegrees(prompt) ?? 90
    const axis = parseRotationAxis(normalizedPrompt)
    const assumptions = [
      describeResolvedTargetAssumption(selectedTarget, 'rotation', targetResolution.source),
    ]
    if (parseRotationDegrees(prompt) == null) assumptions.push('Using a default rotation of 90 degrees.')
    if (axis !== 'Y') assumptions.push(`Rotating around the ${axis} axis.`)

    const radians = toRadians(degrees)
    const rotationAction: AssistantAction =
      axis === 'Y'
        ? { type: 'rotate_target', nodeId: selectedTarget.id, rotationY: radians }
        : {
          type: 'rotate_target',
          nodeId: selectedTarget.id,
          rotation: axis === 'X' ? [radians, 0, 0] : [0, 0, radians],
        }

    return buildReviewPlanTurn(
      'I can rotate the selected target.',
      [rotationAction],
      assumptions,
      undefined,
      targetResolutionMetadata,
    )
  }

  if (selectedTarget && scaleRequest) {
    if (!scaleTargetTypes.has(selectedTarget.type)) {
      return buildClarifyTurn(`The selected ${selectedTarget.type} does not support scaling here.`, [
        'Select an item, CAD body, guide, or scan instead.',
      ], targetResolutionMetadata)
    }

    const factor = parseScaleFactor(normalizedPrompt)
    if (factor == null) {
      return buildClarifyTurn('I need a scale factor before I can do that.', [
        'Specify a factor such as 2x, 150%, double, or half.',
      ], targetResolutionMetadata)
    }

    return buildReviewPlanTurn(
      'I can scale the selected target.',
      [{ type: 'scale_target', nodeId: selectedTarget.id, scale: [factor, factor, factor] }],
      [
        describeResolvedTargetAssumption(selectedTarget, 'scale', targetResolution.source),
      ],
      undefined,
      targetResolutionMetadata,
    )
  }

  const isSketchExtrudeRequest =
    /\b(extrude|pad|extruir)\b/.test(normalizedPrompt) && !/\btool\b/.test(normalizedPrompt)
  const isSketchRevolveRequest =
    /\b(revolve|revoluciona|gira|spin|lathe)\b/.test(normalizedPrompt) &&
    !/\btool\b/.test(normalizedPrompt)

  if ((isSketchExtrudeRequest || isSketchRevolveRequest) && !selectedCadSketch) {
    return buildClarifyTurn('I need an active CAD sketch before I can do that.', [
      'Select or open a CAD sketch with a closed profile first.',
    ])
  }

  if (selectedCadSketch && isSketchExtrudeRequest) {
    if (selectedCadSketch.closedProfileCount === 0) {
      return buildClarifyTurn('I need a closed sketch profile before I can extrude it.', [
        'Close the sketch profile or select a CAD sketch that already has a closed profile.',
      ])
    }

    const depth = parseSingleMetricValue(prompt)
    const direction = parseExtrudeDirection(normalizedPrompt)
    const assumptions = [`Using the active CAD sketch ${selectedCadSketch.id} as the extrusion source.`]
    if (typeof depth !== 'number') assumptions.push('Using the default extrude depth of 1.2 m.')
    if (direction === 'negative') assumptions.push('Extruding in the negative direction.')
    if (direction === 'symmetric') {
      assumptions.push('Extruding symmetrically on both sides of the sketch plane.')
    }

    return buildReviewPlanTurn(
      'I can extrude the active CAD sketch.',
      [
        {
          type: 'extrude_cad_sketch',
          sketchId: selectedCadSketch.id,
          depth: typeof depth === 'number' ? depth : undefined,
          direction,
        },
      ],
      assumptions,
    )
  }

  if (selectedCadSketch && isSketchRevolveRequest) {
    if (selectedCadSketch.closedProfileCount === 0) {
      return buildClarifyTurn('I need a closed sketch profile before I can revolve it.', [
        'Close the sketch profile or select a CAD sketch that already has a closed profile.',
      ])
    }

    const angle = parseRevolveAngle(prompt)
    const axis = parseRevolveAxis(normalizedPrompt)
    const assumptions = [`Using the active CAD sketch ${selectedCadSketch.id} as the revolve source.`]
    if (typeof angle !== 'number') assumptions.push('Using the default revolve angle of 360 degrees.')
    if (axis !== 'Z') assumptions.push(`Using the ${axis} axis for the revolve operation.`)

    return buildReviewPlanTurn(
      'I can revolve the active CAD sketch.',
      [
        {
          type: 'revolve_cad_sketch',
          sketchId: selectedCadSketch.id,
          angle: typeof angle === 'number' ? angle : undefined,
          axis,
        },
      ],
      assumptions,
    )
  }

  const suppressOperationRequest = /\b(suppress|disable|hide|skip|omit|apaga|desactiva|suprime)\b/.test(
    normalizedPrompt,
  )
  const restoreOperationRequest = /\b(restore|unsuppress|enable|resume|reactiva|restaura)\b/.test(
    normalizedPrompt,
  )

  if (selectedCadBody && (suppressOperationRequest || restoreOperationRequest)) {
    const targetOperation = resolveCadOperationTarget(selectedCadBody, normalizedPrompt)
    if (!targetOperation) {
      return buildClarifyTurn('I need a specific CAD body operation before I can change its suppression state.', [
        'Mention the operation kind, such as fillet, chamfer, boolean, extrude, revolve, or say the last operation.',
      ])
    }

    const suppressed = suppressOperationRequest
    const alreadyMatches = targetOperation.suppressed === suppressed
    const assumptions = [`Using the selected CAD body ${selectedCadBody.id} as the operation target.`]
    if (!/\b(last|latest|most recent|ultimo|ultima|reciente|fillet|chamfer|boolean|extrude|revolve|round|bevel|bisel|union|cut|intersect|pad|gira|spin|lathe)\b/.test(normalizedPrompt)) {
      assumptions.push('Using the latest matching CAD body operation.')
    }
    if (alreadyMatches) {
      assumptions.push(`The target operation is already ${suppressed ? 'suppressed' : 'active'}.`)
    }

    return buildReviewPlanTurn(
      suppressed
        ? 'I can suppress that CAD body operation.'
        : 'I can restore that CAD body operation.',
      [
        {
          type: 'set_cad_body_operation_suppressed',
          bodyId: selectedCadBody.id,
          operationId: targetOperation.id,
          suppressed,
        },
      ],
      assumptions,
    )
  }

  if (selectedCadBody && /\b(ear|ears|oreja|orejas)\b/.test(normalizedPrompt)) {
    const assumptions = [`Using the selected CAD body ${selectedCadBody.id} as the edit target.`]
    if (/\b(surface|shell|hollow|superficie)\b/.test(normalizedPrompt)) {
      assumptions.push(
        'Interpreting the surface request as placing ear attachments on the selected body top face.',
      )
    }

    return buildReviewPlanTurn(
      'I can add ears to the selected CAD body.',
      [{ type: 'add_cad_box_ears', bodyId: selectedCadBody.id }],
      assumptions,
    )
  }

  const shellRequest =
    /\b(shell|hollow|surface|superficie|cascaron|cascarón)\b/.test(normalizedPrompt) &&
    !/\b(ear|ears|oreja|orejas)\b/.test(normalizedPrompt)

  if (selectedCadBody && shellRequest) {
    return buildReviewPlanTurn(
      'I can convert the selected CAD body into a shell-like surface set.',
      [{ type: 'shell_cad_body', bodyId: selectedCadBody.id }],
      [
        `Using the selected CAD body ${selectedCadBody.id} as the shell target.`,
        'Approximating the shell request with thin surface panels because the local CAD scaffold does not provide a true shell feature.',
      ],
    )
  }

  const faceExtrudeRequest =
    /\b(tab|tabs|flange|flanges|lip)\b/.test(normalizedPrompt) ||
    /\b(extrude|pull|push)\b.*\bface\b/.test(normalizedPrompt) ||
    /\bface\b.*\b(extrude|pull|push)\b/.test(normalizedPrompt)

  if (selectedCadBody && faceExtrudeRequest) {
    const face = parseCadBoxFace(normalizedPrompt)
    const distance = parseSingleMetricValue(prompt)
    const assumptions = [`Using the selected CAD body ${selectedCadBody.id} as the face-extrusion target.`]
    if (distance == null) assumptions.push('Using a default face-extrusion depth based on the selected box size.')
    if (face !== 'top') assumptions.push(`Extruding the ${face} face.`)

    return buildReviewPlanTurn(
      'I can extrude a face tab from the selected CAD body.',
      [
        {
          type: 'extrude_cad_body_face',
          bodyId: selectedCadBody.id,
          face,
          ...(typeof distance === 'number' ? { distance } : {}),
        },
      ],
      assumptions,
    )
  }

  if (selectedCadBody && /\b(fillet|round|rounded|redondea|redondeado)\b/.test(normalizedPrompt)) {
    return buildReviewPlanTurn(
      'I can apply a fillet to the selected CAD body.',
      [{ type: 'apply_cad_fillet', bodyId: selectedCadBody.id, radius: 0.08 }],
      ['Using the selected CAD body as the fillet target.', 'Using a default fillet radius of 0.08 m.'],
    )
  }

  if (selectedCadBody && /\b(chamfer|bevel|bisel)\b/.test(normalizedPrompt)) {
    return buildReviewPlanTurn(
      'I can apply a chamfer to the selected CAD body.',
      [{ type: 'apply_cad_chamfer', bodyId: selectedCadBody.id, distance: 0.06 }],
      ['Using the selected CAD body as the chamfer target.', 'Using a default chamfer distance of 0.06 m.'],
    )
  }

  if (
    selectedCadBody &&
    /\b(retry|try again|reintenta|intenta de nuevo)\b/.test(normalizedPrompt)
  ) {
    return buildReviewPlanTurn(
      'I can retry regeneration for the selected CAD body.',
      [{ type: 'retry_cad_body', bodyId: selectedCadBody.id }],
      ['Using the selected CAD body as the regeneration target.'],
    )
  }

  if (
    selectedCadBody &&
    /\b(regenerate|rebuild|refresh|regen)\b/.test(normalizedPrompt)
  ) {
    return buildReviewPlanTurn(
      'I can regenerate the selected CAD body.',
      [{ type: 'regenerate_cad_body', bodyId: selectedCadBody.id }],
      ['Using the selected CAD body as the regeneration target.'],
    )
  }

  const assistantSession =
    body.context &&
    typeof body.context.assistantSession === 'object' &&
    body.context.assistantSession !== null &&
    !Array.isArray(body.context.assistantSession)
      ? (body.context.assistantSession as Record<string, unknown>)
      : null
  const cadMacroExpansion = assistantSession?.cadMacroExpansion === true

  if (
    !cadMacroExpansion &&
    hasSelectedCadBody(body.context) &&
    /\b(ear|ears|surface|shell|hollow|fillet|chamfer|boolean|cut|join|union|intersect|extrude|revolve|modify|convert|add)\b/.test(
      normalizedPrompt,
    )
  ) {
    return buildReviewPlanTurn('I can apply that CAD edit to the selected body.', [
      { type: 'run_cad_prompt', prompt },
    ], ['Using the selected CAD body as the edit target.'])
  }

  const isCadObjectPrompt =
    /\b(build|create|generate|make)\b/.test(normalizedPrompt) &&
    /\b(box|cube|rectangular prism|chair|bracket|plate|part)\b/.test(normalizedPrompt)

  if (isCadObjectPrompt) {
    const hasBoxLikeTarget = /\b(box|cube|rectangular prism)\b/.test(normalizedPrompt)
    const dimensions = parseMetricDimensions(prompt)

    if (hasBoxLikeTarget && !dimensions) {
      return buildClarifyTurn('I need the box dimensions before I can build it.', [
        'Provide width, depth, and height in meters, for example 1m x 2m x 0.5m.',
      ])
    }

    const assumptions =
      selection.levelId !== null
        ? [`The CAD result will be created on the currently selected level ${selection.levelId}.`]
        : ['The CAD result will be created under the current site because no level is selected.']

    if (hasBoxLikeTarget) {
      const brief = buildFallbackCadBrief(prompt, {
        levelId: selection.levelId,
      })

      return buildReviewPlanTurn(
        'I can run a CAD build for that request.',
        [{ type: 'execute_cad_brief', brief }],
        [...assumptions, ...brief.assumptions],
      )
    }
  }

  return null
}

const isTimeoutLikeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /timeout|timed out|aborted/i.test(message)
}

const getAssistantProviderFailureMessage = (label: string, timeoutMs: number, error: unknown) => {
  if (isTimeoutLikeError(error)) {
    return `${label} timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`
  }

  return error instanceof Error && error.message ? error.message : `${label} request failed.`
}

const normalizeAssistantEnv = (
  env: Record<string, string | undefined>,
): Record<string, string | undefined> => ({
  ...env,
  PISTOLA_ASSISTANT_AI_PROVIDER:
    env.PISTOLA_ASSISTANT_AI_PROVIDER ?? env.PISTOLA_CAD_AI_PROVIDER ?? env.PISTOLA_AI_PROVIDER,
  PISTOLA_ASSISTANT_MODEL: env.PISTOLA_ASSISTANT_MODEL ?? env.PISTOLA_CAD_MODEL,
  PISTOLA_ASSISTANT_AI_BASE_URL:
    env.PISTOLA_ASSISTANT_AI_BASE_URL ?? env.PISTOLA_CAD_AI_BASE_URL,
  PISTOLA_ASSISTANT_AI_HTTP_REFERER:
    env.PISTOLA_ASSISTANT_AI_HTTP_REFERER ?? env.PISTOLA_CAD_AI_HTTP_REFERER,
  PISTOLA_ASSISTANT_AI_TITLE: env.PISTOLA_ASSISTANT_AI_TITLE ?? env.PISTOLA_CAD_AI_TITLE,
})

const getCodexHomeDirectory = (env: Record<string, string | undefined>) =>
  readEnvValue(env.CODEX_HOME) ?? path.join(os.homedir(), '.codex')

const hasCodexAuthCache = (env: Record<string, string | undefined>) => {
  try {
    return existsSync(path.join(getCodexHomeDirectory(env), 'auth.json'))
  } catch {
    return false
  }
}

const resolveAssistantWorkingDirectory = (cwd = process.cwd()) => {
  let current = path.resolve(cwd)
  const seen = new Set<string>()

  while (!seen.has(current)) {
    seen.add(current)
    if (existsSync(path.join(current, '.git'))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return path.resolve(cwd)
}

const assistantSharedConfigOptions = {
  modelEnvVar: 'PISTOLA_ASSISTANT_MODEL',
  baseUrlEnvVar: 'PISTOLA_ASSISTANT_AI_BASE_URL',
  providerEnvVar: 'PISTOLA_ASSISTANT_AI_PROVIDER',
  httpRefererEnvVar: 'PISTOLA_ASSISTANT_AI_HTTP_REFERER',
  titleEnvVar: 'PISTOLA_ASSISTANT_AI_TITLE',
  legacyOpenRouterApiKeyEnvVar: 'PISTOLA_CAD_AI_API_KEY',
  openAiModelDefault: DEFAULT_OPENAI_MODEL,
  openRouterModelDefault: DEFAULT_OPENROUTER_MODEL,
  openRouterTitleDefault: DEFAULT_OPENROUTER_TITLE,
} as const

const normalizeAssistantCodexReasoningEffort = (
  value: string | undefined,
): AssistantCodexReasoningEffort => {
  const normalized = readEnvValue(value)?.toLowerCase()
  return assistantCodexReasoningEffortValues.includes(
    normalized as AssistantCodexReasoningEffort,
  )
    ? (normalized as AssistantCodexReasoningEffort)
    : DEFAULT_CODEX_REASONING_EFFORT
}

const normalizeAssistantCodexModel = (value: string | undefined) => {
  const configured = readEnvValue(value)
  if (!configured) return DEFAULT_CODEX_MODEL

  const normalized = configured.includes('/') ? configured.split('/').at(-1) ?? configured : configured
  return /codex/i.test(normalized) ? normalized : DEFAULT_CODEX_MODEL
}

const getAssistantSharedAiConfig = (
  env: Record<string, string | undefined> = process.env,
): SharedAiConfig => getSharedAiConfig(normalizeAssistantEnv(env), assistantSharedConfigOptions)

const getAssistantNonCodexAiConfig = (
  env: Record<string, string | undefined> = process.env,
): SharedAiConfig => {
  const normalized = normalizeAssistantEnv(env)
  const assistantProvider = readEnvValue(normalized.PISTOLA_ASSISTANT_AI_PROVIDER)?.toLowerCase()

  return getSharedAiConfig(
    assistantProvider === 'codex'
      ? {
          ...normalized,
          PISTOLA_ASSISTANT_AI_PROVIDER: undefined,
        }
      : normalized,
    assistantSharedConfigOptions,
  )
}

export const getAssistantAiConfig = (
  env: Record<string, string | undefined> = process.env,
): AssistantAiConfig => {
  const effectiveEnv = applyInstalledAiConfigToEnv(env)

  const normalized = normalizeAssistantEnv(effectiveEnv)
  const requestedProvider = readEnvValue(normalized.PISTOLA_ASSISTANT_AI_PROVIDER)?.toLowerCase()
  const apiKey = readEnvValue(normalized.OPENAI_API_KEY)
  const hasCodexAuth = hasCodexAuthCache(normalized)
  // Installed OpenRouter config wins over Codex default so one model drives the system.
  const hasInstalledOpenRouter =
    Boolean(readEnvValue(normalized.OPENROUTER_API_KEY)) &&
    (requestedProvider === 'openrouter' ||
      readEnvValue(normalized.PISTOLA_AI_PROVIDER)?.toLowerCase() === 'openrouter')
  const shouldDefaultToCodex =
    !requestedProvider && !hasInstalledOpenRouter && (Boolean(apiKey) || hasCodexAuth)

  if (requestedProvider === 'codex' || shouldDefaultToCodex) {
    return {
      provider: 'codex',
      apiKey,
      model: normalizeAssistantCodexModel(normalized.PISTOLA_ASSISTANT_MODEL),
      reasoningEffort: normalizeAssistantCodexReasoningEffort(
        normalized.PISTOLA_ASSISTANT_REASONING_EFFORT,
      ),
      workingDirectory: resolveAssistantWorkingDirectory(),
    }
  }

  return getAssistantSharedAiConfig(normalized)
}

const buildAssistantProviderMeta = (
  provider: NonNullable<AssistantTurnResult['providerMeta']>['provider'],
  model: string,
  codexThreadId?: string,
): NonNullable<AssistantTurnResult['providerMeta']> => ({
  provider,
  model,
  ...(codexThreadId ? { codexThreadId } : {}),
})

const getRemoteAssistantProviderMeta = (
  config: Exclude<AssistantAiConfig, { provider: 'fallback' }>,
  codexThreadId?: string,
) =>
  buildAssistantProviderMeta(
    config.provider,
    config.model,
    config.provider === 'codex' ? codexThreadId : undefined,
  )

const getLocalAssistantProviderMeta = (model = LOCAL_ASSISTANT_MODEL) =>
  buildAssistantProviderMeta('fallback', model)

const normalizeAssistantRequesterResult = (
  result: string | AssistantRequesterResult,
): AssistantRequesterResult => (typeof result === 'string' ? { raw: result } : result)

const assistantModelSupportsVision = (model: string) =>
  /gpt-5|gpt-4o|gemini|claude|vision|4o/i.test(model) &&
  !/openrouter\/free/i.test(model)

const buildAssistantUserMessageContent = ({
  body,
  model,
  textContent,
}: {
  body: AssistantPlanRequest
  model: string
  textContent: string
}) => {
  const image = getAssistantPlanImage(body)
  return image && assistantModelSupportsVision(model)
    ? [
        { type: 'input_image' as const, image_url: image.dataUrl, detail: 'auto' as const },
        { type: 'input_text' as const, text: textContent },
      ]
    : textContent
}

const buildAssistantRemoteRequestInput = ({
  body,
  model,
  systemPrompt,
  textContent,
}: {
  body: AssistantPlanRequest
  model: string
  systemPrompt: string
  textContent: string
}) => [
  {
    type: 'message' as const,
    role: 'system' as const,
    content: systemPrompt,
  },
  ...(body.conversationHistory ?? []).map((turn) => ({
    type: 'message' as const,
    role: turn.role,
    content: turn.text,
  })),
  {
    type: 'message' as const,
    role: 'user' as const,
    content: buildAssistantUserMessageContent({ body, model, textContent }),
  },
]

const buildAssistantPlanningTextContent = (body: AssistantPlanRequest) => {
  const shapedContext = shapeAssistantPlanningContext(body.prompt, body.context)
  const complexity = getRequestedComplexity(body)
  const image = getAssistantPlanImage(body)
  return [
    `User request: ${body.prompt}`,
    `Requested chat mode: ${body.chatMode ?? 'create'}`,
    `Requested complexity: ${complexity}`,
    body.sessionId ? `Assistant session id: ${body.sessionId}` : null,
    body.codexThreadId ? `Codex thread id: ${body.codexThreadId}` : null,
    `Workspace context: ${JSON.stringify(shapedContext)}`,
    `Allowed action guide: ${JSON.stringify(buildAssistantActionGuide())}`,
    `Reference planning examples: ${JSON.stringify(ASSISTANT_PLANNING_EXAMPLES)}`,
    complexity === 'complex'
      ? `This request is complex. Prefer response mode "task-plan" with explicit structure -> layout -> furnish -> refinement steps unless a deterministic single-chunk plan is clearly better.`
      : null,
    image
      ? 'An image is attached. Prefer executable approximations from visible geometry or layout, and clarify only when the image does not provide enough buildable structure.'
      : null,
    image ? `Image attachment metadata: ${JSON.stringify({
      kind: image.kind,
      source: image.source,
      filename: image.filename ?? null,
      viewport: image.viewport ?? null,
      analysis: image.analysis ?? null,
    })}` : null,
    body.geminiVisionDescription
      ? `Gemini vision analysis of the attached image: ${body.geminiVisionDescription}`
      : null,
    body.continuation
      ? `Continuation context: ${JSON.stringify(body.continuation)}`
      : null,
    body.repairFeedback
      ? `Previous attempt failed validation: ${body.repairFeedback}. Return a corrected JSON response using only valid action objects.`
      : null,
    `Retry count: ${body.retry ?? 0}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
}

const buildAssistantChatTextContent = (body: AssistantPlanRequest) => {
  const shapedContext = shapeAssistantPlanningContext(body.prompt, body.context)
  const image = getAssistantPlanImage(body)
  return [
    `User request: ${body.prompt}`,
    `Requested chat mode: ${body.chatMode ?? 'create'}`,
    body.sessionId ? `Assistant session id: ${body.sessionId}` : null,
    body.codexThreadId ? `Codex thread id: ${body.codexThreadId}` : null,
    `Workspace context: ${JSON.stringify(shapedContext)}`,
    image
      ? `Image attachment metadata: ${JSON.stringify({
          kind: image.kind,
          source: image.source,
          filename: image.filename ?? null,
          viewport: image.viewport ?? null,
          analysis: image.analysis ?? null,
        })}`
      : null,
    body.geminiVisionDescription
      ? `Gemini vision analysis of the attached image: ${body.geminiVisionDescription}`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
}

const formatAssistantConversationHistory = (
  conversationHistory: AssistantPlanRequest['conversationHistory'],
) =>
  Array.isArray(conversationHistory) && conversationHistory.length > 0
    ? conversationHistory.map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`).join('\n\n')
    : null

const buildCodexAssistantPrompt = (body: AssistantPlanRequest) =>
  [
    ASSISTANT_SYSTEM_PROMPT,
    'Return exactly one JSON object that matches the provided output schema.',
    formatAssistantConversationHistory(body.conversationHistory)
      ? `Recent conversation history:\n${formatAssistantConversationHistory(body.conversationHistory)}`
      : null,
    buildAssistantPlanningTextContent(body),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')

export const buildAssistantRequest = (body: AssistantPlanRequest, model: string) => {
  const textContent = buildAssistantPlanningTextContent(body)
  return {
    model,
    input: buildAssistantRemoteRequestInput({
      body,
      model,
      systemPrompt: ASSISTANT_SYSTEM_PROMPT,
      textContent,
    }),
    store: false as const,
    stream: false as const,
    temperature: 0.2,
    truncation: 'disabled' as const,
    text: {
      format: {
        type: 'json_schema' as const,
        ...ASSISTANT_JSON_SCHEMA,
      },
    },
  }
}

export const buildAssistantChatRequest = (body: AssistantPlanRequest, model: string) => {
  const textContent = buildAssistantChatTextContent(body)
  return {
    model,
    input: buildAssistantRemoteRequestInput({
      body,
      model,
      systemPrompt: ASSISTANT_CHAT_SYSTEM_PROMPT,
      textContent,
    }),
    store: false as const,
    stream: false as const,
    temperature: 0.2,
    truncation: 'disabled' as const,
  }
}

export const requestOpenAiTurn = async (
  config: OpenAiAssistantConfig,
  body: AssistantPlanRequest,
) =>
  requestOpenAiResponses(
    config,
    buildAssistantRequest(body, config.model),
    getAssistantPlanningTimeoutMs(body),
    'OpenAI assistant planning',
  )

export const requestOpenRouterTurn = async (
  config: OpenRouterAssistantConfig,
  body: AssistantPlanRequest,
) =>
  requestOpenRouterResponses(
    config,
    buildAssistantRequest(body, config.model),
    getAssistantPlanningTimeoutMs(body),
    'OpenRouter assistant planning',
  )

export const requestOpenAiChatTurn = async (
  config: OpenAiAssistantConfig,
  body: AssistantPlanRequest,
) =>
  requestOpenAiResponses(
    config,
    buildAssistantChatRequest(body, config.model),
    REMOTE_ASSISTANT_CHAT_TIMEOUT_MS,
    'OpenAI assistant chat',
  )

export const requestOpenRouterChatTurn = async (
  config: OpenRouterAssistantConfig,
  body: AssistantPlanRequest,
) =>
  requestOpenRouterResponses(
    config,
    buildAssistantChatRequest(body, config.model),
    REMOTE_ASSISTANT_CHAT_TIMEOUT_MS,
    'OpenRouter assistant chat',
  )

const stringifyCodexTurnOutput = (value: unknown) => {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  throw new Error('Codex assistant planning returned an empty response.')
}

export const requestCodexTurn = async (
  config: CodexAssistantConfig,
  body: AssistantPlanRequest,
): Promise<AssistantRequesterResult> => {
  const timeoutMs = getAssistantPlanningTimeoutMs(body)

  try {
    const codex = new Codex(config.apiKey ? { apiKey: config.apiKey } : {})
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
              `Codex assistant planning timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`,
            ),
          )
        }, timeoutMs)
      })
      const turn = await Promise.race([
        thread.run(buildCodexAssistantPrompt(body)),
        timeoutPromise,
      ])

      return {
        raw: stringifyCodexTurnOutput(turn.finalResponse),
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
      getAssistantProviderFailureMessage('Codex assistant planning', timeoutMs, error),
      isTimeoutLikeError(error) ? 'timeout' : 'provider',
    )
  }
}

type ParsedAssistantTurn = {
  turn: AssistantTurnResult
  rawMode: unknown
  rawActionCount: number
  invalidActionIssues: string[]
  rawStepCount: number
  invalidStepIssues: string[]
}

const formatActionIssue = (index: number, type: unknown, issues: Array<{ message: string }>) =>
  `Action ${index + 1}${typeof type === 'string' ? ` (${type})` : ''}: ${issues.map((issue) => issue.message).join('; ')}`

const formatSequenceIssues = (issues: AssistantActionSequenceIssue[], prefix?: string) =>
  issues.map((issue) => (prefix ? `${prefix}: ${issue.message}` : issue.message))

const getAssistantTurnSequenceIssues = (turn: AssistantTurnResult) => {
  const actionIssues = formatSequenceIssues(validateAssistantActionSequence(turn.actions).issues)
  const stepIssues =
    turn.steps?.flatMap((step, index) =>
      formatSequenceIssues(
        validateAssistantActionSequence(step.actions).issues,
        `Step ${index + 1}`,
      ),
    ) ?? []

  return {
    actionIssues,
    stepIssues,
  }
}

const ensureAssistantTurnSequenceValidity = (
  turn: AssistantTurnResult,
  sourceLabel: string,
) => {
  const sequenceIssues = getAssistantTurnSequenceIssues(turn)
  const combinedIssues = [...sequenceIssues.actionIssues, ...sequenceIssues.stepIssues]
  if (combinedIssues.length === 0) return

  throw new Error(`${sourceLabel} produced an invalid ordered plan. ${combinedIssues.join(' | ')}`)
}

const resolveAssistantActionRefs = (
  action: AssistantAction,
  resolvedRefs: Record<string, string>,
): AssistantAction => {
  const entries = Object.entries(resolvedRefs)
  if (entries.length === 0) return action

  const serialized = JSON.stringify(action)
  let nextSerialized = serialized
  for (const [refId, actualId] of entries) {
    nextSerialized = nextSerialized.replaceAll(`"${refId}"`, `"${actualId}"`)
  }

  return nextSerialized === serialized ? action : (JSON.parse(nextSerialized) as AssistantAction)
}

const assistantLastWriteWinsActionTypes = new Set<AssistantAction['type']>([
  'set_phase',
  'set_mode',
  'set_structure_layer',
  'set_camera_mode',
  'set_theme',
  'set_level_view_mode',
  'set_wall_view_mode',
  'set_preview_mode',
  'set_scans_visibility',
  'set_guides_visibility',
  'set_grid_visibility',
  'set_cad_workplane',
  'set_transform_mode',
  'set_transform_pivot',
  'set_fullscreen',
])

const normalizeAssistantActions = (actions: AssistantAction[]) => {
  const dedupedFromEnd: AssistantAction[] = []
  const seenLastWriteWinsTypes = new Set<AssistantAction['type']>()

  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (!action) continue

    if (assistantLastWriteWinsActionTypes.has(action.type)) {
      if (seenLastWriteWinsTypes.has(action.type)) continue
      seenLastWriteWinsTypes.add(action.type)
    }

    dedupedFromEnd.push(action)
  }

  const normalized = dedupedFromEnd.reverse()
  const collapsed: AssistantAction[] = []
  let previousSerialized: string | null = null
  for (const action of normalized) {
    const serialized = JSON.stringify(action)
    if (serialized === previousSerialized) continue
    collapsed.push(action)
    previousSerialized = serialized
  }

  return collapsed
}

const normalizeAssistantEnumValue = (
  value: unknown,
  allowedValues: readonly string[],
  aliases: Record<string, string> = {},
) => {
  if (typeof value !== 'string') return value
  if (allowedValues.includes(value)) return value

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized in aliases) return aliases[normalized]

  const exactMatch = allowedValues.find((candidate) => candidate.toLowerCase() === normalized)
  if (exactMatch) return exactMatch

  const fuzzyMatch = allowedValues.find((candidate) => normalized.includes(candidate.toLowerCase()))
  return fuzzyMatch ?? value
}

const assistantActionTypeAliases: Partial<Record<string, AssistantAction['type']>> = {
  'set-phase': 'set_phase',
  setphase: 'set_phase',
  switchphase: 'set_phase',
  switch_phase: 'set_phase',
  'set-mode': 'set_mode',
  setmode: 'set_mode',
  switchmode: 'set_mode',
  switch_mode: 'set_mode',
  'select-nodes': 'select_nodes',
  selectnodes: 'select_nodes',
  'delete-target': 'delete_target',
  deletetarget: 'delete_target',
  'delete-nodes': 'delete_nodes',
  deletenodes: 'delete_nodes',
  clearlevelcontents: 'clear_level_contents',
  'clear-level-contents': 'clear_level_contents',
  'place-item': 'place_item',
  placeitem: 'place_item',
  'add-item': 'place_item',
  additem: 'place_item',
  'create-item': 'place_item',
  createitem: 'place_item',
  'place-object': 'place_item',
  placeobject: 'place_item',
  'execute-cad-brief': 'execute_cad_brief',
  executecadbrief: 'execute_cad_brief',
  'create-building': 'create_building',
  createbuilding: 'create_building',
  'create-level': 'create_level',
  createlevel: 'create_level',
  'create-zone': 'create_zone',
  createzone: 'create_zone',
  'create-wall': 'create_wall',
  createwall: 'create_wall',
  'create-slab': 'create_slab',
  createslab: 'create_slab',
  'place-window': 'place_window',
  placewindow: 'place_window',
  'place-door': 'place_door',
  placedoor: 'place_door',
  'set-camera-mode': 'set_camera_mode',
  setcameramode: 'set_camera_mode',
  'camera-top-view': 'camera_top_view',
  cameratopview: 'camera_top_view',
  'focus-camera': 'focus_camera_on_nodes',
  focuscamera: 'focus_camera_on_nodes',
}

const assistantPhaseAliases: Record<string, string> = {
  furnishing: 'furnish',
  furniture: 'furnish',
  decor: 'furnish',
  decorate: 'furnish',
  structural: 'structure',
  building: 'structure',
  architecture: 'structure',
  architectural: 'structure',
  terrain: 'site',
  landscape: 'site',
  planning: 'site',
  modeling: 'cad',
  model: 'cad',
}

const assistantModeAliases: Record<string, string> = {
  browse: 'select',
  transform: 'edit',
  transformmode: 'edit',
  remove: 'delete',
  buildmode: 'build',
}

const assistantToolAliases: Record<string, string> = {
  cadsketch: 'cad-sketch',
  cadsolid: 'cad-solid',
  cadinspect: 'cad-inspect',
}

const normalizeAssistantActionCandidate = (item: unknown) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item

  const record = { ...(item as Record<string, unknown>) }
  if (typeof record.type === 'string') {
    const normalizedTypeKey = record.type
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]/gu, '')
    record.type =
      assistantActionTypeAliases[normalizedTypeKey] ??
      assistantActionTypeAliases[record.type] ??
      record.type
  }

  if (record.type === 'set_phase') {
    record.phase = normalizeAssistantEnumValue(record.phase, assistantPhaseValues, assistantPhaseAliases)
  } else if (record.type === 'set_mode') {
    record.mode = normalizeAssistantEnumValue(record.mode, assistantModeValues, assistantModeAliases)
  } else if (record.type === 'activate_tool') {
    record.tool = normalizeAssistantEnumValue(record.tool, assistantToolValues, assistantToolAliases)
  } else if (record.type === 'set_camera_mode') {
    record.cameraMode = normalizeAssistantEnumValue(record.cameraMode, assistantCameraModeValues)
  } else if (record.type === 'set_level_view_mode') {
    record.levelMode = normalizeAssistantEnumValue(record.levelMode, assistantLevelViewModeValues)
  } else if (record.type === 'set_wall_view_mode') {
    record.wallMode = normalizeAssistantEnumValue(record.wallMode, assistantWallViewModeValues)
  } else if (record.type === 'set_cad_workplane') {
    record.workplane = normalizeAssistantEnumValue(record.workplane, assistantCadWorkplaneValues)
  } else if (record.type === 'set_transform_mode') {
    record.transformMode = normalizeAssistantEnumValue(record.transformMode, assistantTransformModeValues)
  } else if (record.type === 'set_transform_pivot') {
    record.pivot = normalizeAssistantEnumValue(record.pivot, assistantTransformPivotValues)
  }

  return record
}

const safeParseActions = (raw: unknown[]) => {
  const valid: AssistantAction[] = []
  const invalidActionIssues: string[] = []

  raw.forEach((item, index) => {
    const normalizedItem = normalizeAssistantActionCandidate(item)
    const result = AssistantActionSchema.safeParse(normalizedItem)
    if (result.success) {
      valid.push(result.data)
    } else {
      const type =
        typeof normalizedItem === 'object' && normalizedItem !== null && 'type' in normalizedItem
          ? normalizedItem.type
          : '?'
      invalidActionIssues.push(formatActionIssue(index, type, result.error.issues))
      console.warn(`[assistant] Dropped invalid action type="${type}":`, result.error.issues)
    }
  })

  return { valid, invalidActionIssues }
}

const safeParseTaskPlanSteps = (raw: unknown[]) => {
  const valid: NonNullable<AssistantTurnResult['steps']> = []
  const invalidStepIssues: string[] = []

  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      invalidStepIssues.push(`Step ${index + 1}: expected an object with description, agent, and actions.`)
      return
    }

    const record = item as Record<string, unknown>
    const { valid: actions, invalidActionIssues } = safeParseActions(
      Array.isArray(record.actions) ? record.actions : [],
    )

    if (invalidActionIssues.length > 0) {
      invalidStepIssues.push(
        ...invalidActionIssues.map((issue) => `Step ${index + 1}: ${issue}`),
      )
    }

    valid.push({
      description:
        typeof record.description === 'string' && record.description.trim().length > 0
          ? record.description.trim()
          : `Step ${index + 1}`,
      agent:
        record.agent === 'structure' ||
          record.agent === 'furnish' ||
          record.agent === 'cad' ||
          record.agent === 'layout' ||
          record.agent === 'general'
          ? record.agent
          : 'general',
      actions,
    })
  })

  return { valid, invalidStepIssues }
}

const safeJsonParse = (cleaned: string): Record<string, unknown> => {
  try {
    return JSON.parse(cleaned)
  } catch (initialError) {
    try {
      const repaired = cleaned
        .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
      return JSON.parse(repaired)
    } catch {
      try {
        const replyMatch = cleaned.match(
          /"(?:reply|message|response|explanation)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i,
        )
        const modeMatch = cleaned.match(/"mode"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
        if (replyMatch?.[1]) {
          return {
            reply: replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
            mode: modeMatch?.[1] ?? 'chat',
            assumptions: [],
            ambiguities: [],
            actions: [],
          }
        }
      } catch {
        // ignore
      }
      console.warn('[ai] Failed to parse JSON. Raw output was:', cleaned.slice(0, 500))
      throw initialError
    }
  }
}

const normalizeAssistantTurn = (raw: string): ParsedAssistantTurn => {
  const cleaned = cleanJsonString(raw)
  let json: Record<string, unknown>
  try {
    json = safeJsonParse(cleaned)
  } catch {
    const plainText = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .trim()

    json = {
      reply: plainText || 'I processed your request, but could not produce structured 3D actions.',
      mode: 'chat',
      assumptions: [],
      ambiguities: [],
      actions: [],
    }
  }

  // Ensure reply and mode are valid strings
  if (typeof json.reply !== 'string' || !json.reply.trim()) {
    json.reply =
      typeof json.message === 'string' && json.message.trim()
        ? json.message.trim()
        : typeof json.response === 'string' && json.response.trim()
          ? json.response.trim()
          : typeof json.explanation === 'string' && json.explanation.trim()
            ? json.explanation.trim()
            : 'Processed assistant request.'
  }

  const validModes = ['chat', 'clarify', 'plan', 'task-plan']
  if (typeof json.mode !== 'string' || !validModes.includes(json.mode)) {
    json.mode = Array.isArray(json.actions) && json.actions.length > 0 ? 'plan' : 'chat'
  }

  if (!Array.isArray(json.assumptions)) json.assumptions = []
  if (!Array.isArray(json.ambiguities)) json.ambiguities = []
  if (!Array.isArray(json.actions)) json.actions = []

  const rawActions = Array.isArray(json?.actions) ? (json.actions as unknown[]) : []
  const rawSteps = Array.isArray(json?.steps) ? (json.steps as unknown[]) : []
  const { valid: parsedActions, invalidActionIssues: parsedInvalidActionIssues } = safeParseActions(rawActions)
  const { valid: parsedSteps, invalidStepIssues: parsedInvalidStepIssues } = safeParseTaskPlanSteps(rawSteps)
  const actions = normalizeAssistantActions(parsedActions)

  const partial = AssistantTurnResultSchema.parse({ ...json, actions, steps: parsedSteps })

  const flattenedStepActions = parsedSteps.flatMap((step) => step.actions)
  const effectiveActions = actions.length > 0 ? actions : flattenedStepActions
  const hasTaskPlanSteps = parsedSteps.some((step) => step.actions.length > 0)

  const destructiveActionCount = effectiveActions.filter((action) =>
    isDestructiveAssistantActionType(action.type),
  ).length
  const requiresReview = effectiveActions.some(
    (action) => !isSafeImmediateAssistantActionType(action.type),
  )
  const mode =
    (json?.mode === 'task-plan' || partial.mode === 'task-plan') && hasTaskPlanSteps
      ? 'task-plan'
      : actions.length > 0
        ? 'plan'
        : partial.ambiguities.length > 0
          ? 'clarify'
          : 'chat'

  const turn = AssistantTurnResultSchema.parse({
    ...partial,
    mode,
    requiresReview,
    destructiveActionCount,
  })
  const sequenceIssues = getAssistantTurnSequenceIssues(turn)

  return {
    rawMode: json?.mode as string | undefined,
    rawActionCount: rawActions.length,
    invalidActionIssues: [...parsedInvalidActionIssues, ...sequenceIssues.actionIssues],
    rawStepCount: rawSteps.length,
    invalidStepIssues: [...parsedInvalidStepIssues, ...sequenceIssues.stepIssues],
    turn,
  }
}

const needsRepair = (parsed: ParsedAssistantTurn) =>
  parsed.invalidActionIssues.length > 0 ||
  parsed.invalidStepIssues.length > 0 ||
  (parsed.rawMode === 'plan' && parsed.rawActionCount > 0 && parsed.turn.actions.length === 0) ||
  (parsed.rawMode === 'task-plan' &&
    parsed.rawStepCount > 0 &&
    (parsed.turn.mode !== 'task-plan' || (parsed.turn.steps?.length ?? 0) === 0))

const getRepairFeedback = (parsed: ParsedAssistantTurn) => {
  if (parsed.invalidActionIssues.length > 0) return parsed.invalidActionIssues.join(' | ')
  if (parsed.invalidStepIssues.length > 0) return parsed.invalidStepIssues.join(' | ')
  return 'The previous response declared a plan but none of its actions were executable. Return corrected action objects.'
}

const ensureExecutableAssistantTurn = (parsed: ParsedAssistantTurn) => {
  if (parsed.invalidActionIssues.length > 0 || parsed.invalidStepIssues.length > 0) {
    throw new Error(
      `Assistant planner returned invalid actions. ${[
        ...parsed.invalidActionIssues,
        ...parsed.invalidStepIssues,
      ].join(' | ')}`,
    )
  }

  if (parsed.rawMode === 'plan' && parsed.rawActionCount > 0 && parsed.turn.actions.length === 0) {
    throw new Error('Assistant planner proposed a plan, but none of the returned actions were executable.')
  }

  if (
    parsed.rawMode === 'task-plan' &&
    parsed.rawStepCount > 0 &&
    (parsed.turn.mode !== 'task-plan' || (parsed.turn.steps?.length ?? 0) === 0)
  ) {
    throw new Error('Assistant planner proposed a task plan, but none of its steps were executable.')
  }

  ensureAssistantTurnSequenceValidity(parsed.turn, 'Assistant planner')
}

type AssistantPlannerFailureKind =
  | 'planner-drift'
  | 'schema-validation'
  | 'empty-plan'
  | 'empty-task-plan'

const classifyAssistantPlannerFailure = (message: string): AssistantPlannerFailureKind => {
  if (/none of the returned actions were executable/i.test(message)) return 'empty-plan'
  if (/none of its steps were executable/i.test(message)) return 'empty-task-plan'
  if (/invalid ordered plan|deleted earlier in this reviewed plan|implicit target|forward ref/i.test(message)) {
    return 'planner-drift'
  }
  if (/invalid actions|invalid option|expected one of/i.test(message)) return 'planner-drift'
  return 'schema-validation'
}

const getAssistantPlannerFailureMessage = (kind: AssistantPlannerFailureKind) => {
  switch (kind) {
    case 'planner-drift':
      return 'The remote planner returned unsupported action values, so I stopped before mutating the scene.'
    case 'empty-plan':
      return 'The remote planner did not return an executable next step for this request.'
    case 'empty-task-plan':
      return 'The remote planner proposed steps, but none of them contained executable actions.'
    default:
      return 'The remote planner returned a malformed response, so I need a more specific target or a smaller first step.'
  }
}

export const createAssistantTurnResult = async (
  request: z.input<typeof AssistantPlanRequestSchema>,
  env: Record<string, string | undefined> = process.env,
  requesters: AssistantAiRequesters = {},
): Promise<{ turn: AssistantTurnResult; provider: AssistantAiConfig['provider'] }> => {
  const parsedBody = AssistantPlanRequestSchema.parse(request)
  const body: AssistantPlanRequest = {
    ...parsedBody,
    complexity: parsedBody.complexity ?? classifyRequestComplexity(parsedBody.prompt, parsedBody.context),
  }
  const planImage = getAssistantPlanImage(body)
  const configuredProvider = getAssistantAiConfig(env)
  const baseConfig =
    configuredProvider.provider === 'codex' && planImage
      ? getAssistantNonCodexAiConfig(env)
      : configuredProvider
  const config = { ...baseConfig }
  if (body.model && 'model' in config) {
    ;(config as Record<string, unknown>).model = body.model
  }
  const normalizedPrompt = normalizePrompt(body.prompt.trim())
  const imageInterpretation = interpretAssistantImage({
    prompt: body.prompt,
    image: planImage,
    context: body.context,
  })

  const deterministicTurn = buildDeterministicAssistantTurn(body)

  if (deterministicTurn) {
    ensureAssistantTurnSequenceValidity(deterministicTurn, 'Deterministic assistant turn')
    return {
      turn: withAssistantTurnMetadata(deterministicTurn, {
        imageInterpretation: imageInterpretation ?? undefined,
        providerMeta: getLocalAssistantProviderMeta(),
      }),
      provider: config.provider,
    }
  }

  const usesRemoteChatPath =
    config.provider !== 'fallback' &&
    config.provider !== 'codex' &&
    shouldUseRemoteChatPath({
      body,
      normalizedPrompt,
      image: planImage,
    })

  if (
    shouldAnalyzeImageWithGemini({
      body,
      config,
      image: planImage,
    })
  ) {
    const imageToAnalyze = planImage
    if (imageToAnalyze) {
      const visionResult = await analyzeImageWithGemini(imageToAnalyze.dataUrl, body.prompt)
      if (visionResult.ok) {
        body.geminiVisionDescription = visionResult.description
      } else {
        console.warn('[assistant] Gemini vision analysis failed:', visionResult.error)
      }
    }
  }

  const hasGeminiPlanner =
    (env.GEMINI_API_KEY !== undefined
      ? Boolean(env.GEMINI_API_KEY.trim())
      : isGeminiPlannerAvailable())

  if (config.provider === 'fallback' && !hasGeminiPlanner) {
    throw new Error(
      'AI assistant provider is not configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY.',
    )
  }

  if (config.provider === 'fallback' && hasGeminiPlanner) {
    const geminiRequest = buildAssistantRequest(body, 'gemini-2.5-flash')
    const geminiInput = Array.isArray(geminiRequest.input) ? geminiRequest.input : []
    const geminiUserMessage = geminiInput[geminiInput.length - 1]
    const userTextPart = Array.isArray(geminiUserMessage?.content)
      ? geminiUserMessage.content.find(
          (part: unknown): part is { type: 'input_text'; text: string } =>
            Boolean(part) &&
            typeof part === 'object' &&
            !Array.isArray(part) &&
            (part as { type?: unknown }).type === 'input_text' &&
            typeof (part as { text?: unknown }).text === 'string',
        ) ?? null
      : null
    const userText = Array.isArray(geminiUserMessage?.content)
      ? userTextPart?.text ?? JSON.stringify(geminiUserMessage.content)
      : (geminiUserMessage?.content as string)
    const imageDataUrl = planImage?.dataUrl ?? null

    const requestGeminiTurn = async (_nextBody: AssistantPlanRequest) =>
      requestGeminiPlannerTurn(
        ASSISTANT_SYSTEM_PROMPT,
        userText,
        imageDataUrl,
        _nextBody.conversationHistory,
      )

    try {
      const firstParse = normalizeAssistantTurn(await requestGeminiTurn(body))

      if (needsRepair(firstParse)) {
        const repairedBody: AssistantPlanRequest = {
          ...body,
          retry: (body.retry ?? 0) + 1,
          repairFeedback: getRepairFeedback(firstParse),
        }
        try {
          const repairedParse = normalizeAssistantTurn(await requestGeminiTurn(repairedBody))
          ensureExecutableAssistantTurn(repairedParse)
          return {
            turn: withAssistantTurnMetadata(repairedParse.turn, {
              imageInterpretation: imageInterpretation ?? undefined,
              providerMeta: getLocalAssistantProviderMeta(GEMINI_ASSISTANT_MODEL),
            }),
            provider: 'fallback',
          }
        } catch {
          // Gemini repair failed, fall through to legacy providers
        }
      } else {
        ensureExecutableAssistantTurn(firstParse)
        return {
          turn: withAssistantTurnMetadata(firstParse.turn, {
            imageInterpretation: imageInterpretation ?? undefined,
            providerMeta: getLocalAssistantProviderMeta(GEMINI_ASSISTANT_MODEL),
          }),
          provider: 'fallback',
        }
      }
    } catch (geminiError) {
      console.warn(
        '[assistant] Gemini planner failed:',
        geminiError instanceof Error ? geminiError.message : geminiError,
      )
      throw geminiError
    }
  }

  if (config.provider === 'fallback') {
    throw new Error(
      'AI assistant provider is not configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY.',
    )
  }

  const requestTurn = async (nextBody: AssistantPlanRequest): Promise<AssistantRequesterResult> => {
    if (config.provider === 'codex') {
      return (requesters.requestCodexTurn ?? requestCodexTurn)(config, nextBody)
    }

    if (config.provider === 'openrouter') {
      return normalizeAssistantRequesterResult(
        await (requesters.requestOpenRouterTurn ?? requestOpenRouterTurn)(config, nextBody),
      )
    }

    return normalizeAssistantRequesterResult(
      await (requesters.requestOpenAiTurn ?? requestOpenAiTurn)(config, nextBody),
    )
  }
  const requestChatTurn = async (nextBody: AssistantPlanRequest) => {
    if (config.provider === 'openrouter') {
      return normalizeAssistantRequesterResult(
        await (requesters.requestOpenRouterChatTurn ?? requestOpenRouterChatTurn)(config, nextBody),
      )
    }
    if (config.provider !== 'openai') {
      throw new Error('Assistant chat requester is only available for OpenAI and OpenRouter providers.')
    }

    return normalizeAssistantRequesterResult(
      await (requesters.requestOpenAiChatTurn ?? requestOpenAiChatTurn)(config, nextBody),
    )
  }
  try {
    if (usesRemoteChatPath) {
      const reply = await requestChatTurn(body)
      return {
        turn: withAssistantTurnMetadata(buildChatTurn(reply.raw.trim()), {
          imageInterpretation: imageInterpretation ?? undefined,
          providerMeta: getRemoteAssistantProviderMeta(config),
        }),
        provider: config.provider,
      }
    }

    const firstTurnResponse = await requestTurn(body)
    const firstParse = normalizeAssistantTurn(firstTurnResponse.raw)

    if (needsRepair(firstParse)) {
      const repairedBody: AssistantPlanRequest = {
        ...body,
        codexThreadId: firstTurnResponse.codexThreadId ?? body.codexThreadId,
        retry: (body.retry ?? 0) + 1,
        repairFeedback: getRepairFeedback(firstParse),
      }
      try {
        const repairedTurnResponse = await requestTurn(repairedBody)
        const repairedParse = normalizeAssistantTurn(repairedTurnResponse.raw)
        ensureExecutableAssistantTurn(repairedParse)
        return {
          turn: withAssistantTurnMetadata(repairedParse.turn, {
            imageInterpretation: imageInterpretation ?? undefined,
            providerMeta: getRemoteAssistantProviderMeta(
              config,
              repairedTurnResponse.codexThreadId ?? repairedBody.codexThreadId,
            ),
          }),
          provider: config.provider,
        }
      } catch (repairError) {
        const message = repairError instanceof Error ? repairError.message : 'Assistant repair failed.'
        const repairedDeterministicTurn = buildDeterministicAssistantTurn(repairedBody)
        if (repairedDeterministicTurn) {
          ensureAssistantTurnSequenceValidity(
            repairedDeterministicTurn,
            'Deterministic assistant turn',
          )
          return {
            turn: withAssistantTurnMetadata(repairedDeterministicTurn, {
              imageInterpretation: imageInterpretation ?? undefined,
              providerMeta: getLocalAssistantProviderMeta(),
            }),
            provider: config.provider,
          }
        }
        return {
          turn: buildClarifyTurn(
            'I need a more specific target or a smaller first step before I can continue safely.',
            [getAssistantPlannerFailureMessage(classifyAssistantPlannerFailure(message))],
            {
              imageInterpretation: imageInterpretation ?? undefined,
              providerMeta: getLocalAssistantProviderMeta(),
            },
          ),
          provider: config.provider,
        }
      }
    }

    try {
      ensureExecutableAssistantTurn(firstParse)
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Action validation failed.'
      const deterministicTurn = buildDeterministicAssistantTurn(body)
      if (deterministicTurn) {
        return {
          turn: withAssistantTurnMetadata(deterministicTurn, {
            imageInterpretation: imageInterpretation ?? undefined,
            providerMeta: getLocalAssistantProviderMeta(),
          }),
          provider: config.provider,
        }
      }
      return {
        turn: buildClarifyTurn(
          'I need a more specific target or a smaller first step before I can continue safely.',
          [getAssistantPlannerFailureMessage(classifyAssistantPlannerFailure(message))],
          {
            imageInterpretation: imageInterpretation ?? undefined,
            providerMeta: getLocalAssistantProviderMeta(),
          },
        ),
        provider: config.provider,
      }
    }

    return {
      turn: withAssistantTurnMetadata(firstParse.turn, {
        imageInterpretation: imageInterpretation ?? undefined,
        providerMeta: getRemoteAssistantProviderMeta(
          config,
          firstTurnResponse.codexThreadId ?? body.codexThreadId,
        ),
      }),
      provider: config.provider,
    }
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      const deterministicTurn = buildDeterministicAssistantTurn(body)
      if (deterministicTurn) {
        return {
          turn: withAssistantTurnMetadata(deterministicTurn, {
            imageInterpretation: imageInterpretation ?? undefined,
            providerMeta: getLocalAssistantProviderMeta(),
          }),
          provider: config.provider,
        }
      }

      if (!usesRemoteChatPath && body.complexity === 'complex') {
        const agentTasks = decomposeIntoAgentTasks(body.prompt, body.context)
        if (agentTasks.length > 1) {
          return {
            turn: buildTaskPlanTurn(
              'I broke the request into a structure-first execution plan so you can run it step by step without waiting on the remote planner.',
              agentTasks.map((task, index) => ({
                description:
                  task.agent === 'structure'
                    ? 'Create the structural shell and main editable rooms.'
                    : task.agent === 'layout'
                      ? 'Position openings and adjust the main layout.'
                      : task.agent === 'furnish'
                        ? 'Place the requested editable furniture and fixtures.'
                        : task.agent === 'cad'
                          ? 'Run the CAD modeling pass for the requested part.'
                          : `Handle step ${index + 1}.`,
                agent: task.agent,
                actions: [],
              })),
              [
                'The remote planner timed out, so this fallback keeps the intended build order visible while you refine or rerun narrower steps.',
              ],
              {
                imageInterpretation: imageInterpretation ?? undefined,
                providerMeta: getLocalAssistantProviderMeta(),
              },
            ),
            provider: config.provider,
          }
        }
      }

      const treatAsChatRequest = body.chatMode === 'ask' || usesRemoteChatPath
      const timeoutFallbackReply =
        treatAsChatRequest
          ? planImage
            ? 'I could not finish analyzing that in time. Try a narrower question, or resend the request without the image.'
            : 'I could not finish answering that in time. Try a narrower question that focuses on one target or one change.'
          : planImage
            ? 'I could not finish remote planning in time. Try a narrower next step, or resend the request without the image.'
            : 'I could not finish remote planning in time. Try a narrower next step such as adjusting one wall, one opening, or one selected object.'

      return {
        turn: withAssistantTurnMetadata(
          buildChatTurn(timeoutFallbackReply, [
            usesRemoteChatPath
              ? 'No scene changes were applied because the remote assistant timed out.'
              : 'No scene changes were applied because the remote planner timed out.',
          ]),
          {
            imageInterpretation: imageInterpretation ?? undefined,
            providerMeta: getLocalAssistantProviderMeta(),
          },
        ),
        provider: config.provider,
      }
    }

    throw error
  }
}
