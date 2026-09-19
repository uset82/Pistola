'use client'

import { emitter, type AnyNodeId, type CadBrief, useScene } from '@pascal-app/core'
import {
  applySceneGraphToEditor,
  calculatePolygonArea,
  type AssistantAction,
  type AssistantContinuation,
  type AssistantExecutionResult,
  type AssistantExecutionStatus,
  type AssistantTurnResult,
  executeAssistantPlan,
  getAssistantWorkspaceContext,
  summarizeAssistantNode,
  useCad,
  useEditor,
  validateAssistantPlan,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { assistantToolPhaseMap, assistantToolValues } from '../../../../packages/editor/src/lib/assistant/tool-surface'
import {
  boatDetailActions,
  findMatchingRecipe,
} from '../../../../packages/editor/src/lib/assistant/recipes/creation-recipes'
import { shouldRequestAssistantContinuation } from '../../lib/assistant-continuation'
import {
  applyAssistantComposerSuggestion,
  getAssistantComposerSuggestions,
  getInlineAutocompletion,
  resolveAssistantComposerKeyAction,
  type AssistantComposerSuggestion,
} from '../../lib/assistant-composer-suggestions'
import {
  buildAssistantSessionId,
  type AssistantChatMode,
} from '../../lib/assistant-chat-contract'
import {
  buildAssistantViewportMetadata,
  createAssistantImageAttachment,
} from '../../lib/assistant-image-client'
import type { AssistantImageAttachment, AssistantImageKind } from '../../lib/assistant-image-contract'
import {
  buildAssistantPanelSessionReset,
  createEmptyAssistantSessionMemory,
  rememberCompletedTaskPlan,
  rememberConversationTurn,
  rememberFailedPrompt,
  rememberReferencedAssistantNodes,
  rememberSuccessfulAssistantPrompt,
  restoreAssistantSessionMemory,
  type AssistantChatMessage,
  type AssistantPanelStatus,
  type AssistantSessionMemory,
} from '../../lib/assistant-panel-session'
import {
  getAssistantSendLabel,
  isAssistantComposerLocked,
  validateAssistantPromptForSubmission,
} from '../../lib/assistant-panel-prompt'
import { executeCadBrief } from '../../lib/cad-brief-executor'
import { generateMacPart } from '../../lib/mac-part-executor'
import { executeLocalCadIntent } from '../../lib/cad-local-intent'
import { runAssistantTurnSequence } from '../../lib/assistant-turn-sequence'
import {
  executeTaskPlan,
  getTaskPlanProgress,
  parseTaskPlanFromTurn,
  type TaskPlan,
} from '../../lib/assistant-task-plan'
import { classifyRequestComplexity } from '../../lib/assistant-agent-router'
import { runAgentTurn } from '../../lib/assistant-agent/run-agent-turn'
import { AssistantTaskPlanCard } from './AssistantTaskPlanCard'
import {
  FALLBACK_OPENROUTER_MODELS,
  fetchOpenRouterModelCatalog,
} from '../../lib/openrouter-model-catalog'
import { pistolaFetch } from '../../lib/pistola-fetch'

const isObservationPrompt = (text: string) => {
  const norm = text.toLowerCase()
  return (
    /\b(how (big|many|wide|long|high|tall)|measure|distance|inspect|longest wall|area|perimeter|floor space)\b/i.test(norm) ||
    /\b(cuanto mide|cuántos|cuantos|mide|distancia|área|dimensiones|espacio libre)\b/i.test(norm) ||
    /\b(longest wall|pared mas larga|pared más larga)\b/i.test(norm)
  )
}

type ExecutionPolicy = 'autopilot' | 'review'
type AssistantRouteErrorPayload = {
  error?: string
  provider?: 'fallback' | 'codex' | 'openai' | 'openrouter'
  kind?: string
}
type AssistantUndoSnapshot = {
  label: string
  scene: {
    nodes: ReturnType<typeof useScene.getState>['nodes']
    rootNodeIds: ReturnType<typeof useScene.getState>['rootNodeIds']
  }
  selection: ReturnType<typeof useViewer.getState>['selection']
  editor: Pick<
    ReturnType<typeof useEditor.getState>,
    | 'phase'
    | 'cadMode'
    | 'cadBooleanMode'
    | 'activeWorkplane'
    | 'activeSketchId'
    | 'mode'
    | 'tool'
    | 'structureLayer'
    | 'catalogCategory'
    | 'selectedReferenceId'
    | 'transformMode'
    | 'transformTarget'
    | 'transformPivot'
    | 'editingHole'
    | 'isPreviewMode'
  >
}

type AssistantPanelPosition = {
  x: number
  y: number
}

type TaskPlanStatus = 'ready' | 'executing' | 'completed' | 'error'
type PanelAttachedImage = AssistantImageAttachment & { file: File }

const ASSISTANT_PANEL_STORAGE_KEY = 'pistola-assistant-panel'
const PANEL_GUTTER = 16
const DEFAULT_PANEL_WIDTH = 380

const readAssistantPanelStorage = () => {
  if (typeof window === 'undefined') {
    return { collapsed: false, position: null as AssistantPanelPosition | null }
  }

  try {
    const raw = window.localStorage.getItem(ASSISTANT_PANEL_STORAGE_KEY)
    if (!raw) return { collapsed: false, position: null as AssistantPanelPosition | null }
    const parsed = JSON.parse(raw) as {
      collapsed?: unknown
      position?: { x?: unknown; y?: unknown } | null
    }
    const position =
      parsed.position &&
      typeof parsed.position.x === 'number' &&
      typeof parsed.position.y === 'number'
        ? { x: parsed.position.x, y: parsed.position.y }
        : null
    return { collapsed: parsed.collapsed === true, position }
  } catch {
    return { collapsed: false, position: null as AssistantPanelPosition | null }
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const clampPanelPosition = (
  position: AssistantPanelPosition,
  width: number,
  height: number,
): AssistantPanelPosition => ({
  x: clamp(position.x, PANEL_GUTTER, Math.max(PANEL_GUTTER, window.innerWidth - width - PANEL_GUTTER)),
  y: clamp(position.y, PANEL_GUTTER, Math.max(PANEL_GUTTER, window.innerHeight - height - PANEL_GUTTER)),
})

const isInteractiveDragTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, input, textarea, select, option, label, a, img'))
}

const getCadParentId = (
  _levelId: string | null,
  rootNodeIds: string[],
  nodes: ReturnType<typeof useScene.getState>['nodes'],
) => {
  // CAD definitions live in their own project world. Attaching them to a
  // building level makes them disappear as soon as the CAD world is active.
  return rootNodeIds.find((rootId) => nodes[rootId as AnyNodeId]?.type === 'cad-space') ?? null
}

const buildLocalCreationRecipeTurn = (prompt: string): AssistantTurnResult | null => {
  const normalized = prompt.toLowerCase()
  const requestsBoatRefinement =
    /\b(mejora|arregla|refina|fix|improve|detalla)\b/.test(normalized) &&
    /\b(boat|barco|barquito|velero|sailboat|yacht|bote)\b/.test(normalized)

  if (requestsBoatRefinement && useEditor.getState().workspace !== 'cad') {
    return {
      reply: 'I have prepared the finishing details for the existing toy sailboat.',
      mode: 'plan',
      assumptions: ['Adding visible sails, a rudder, and cabin portholes to the existing boat.'],
      ambiguities: [],
      actions: boatDetailActions({
        levelId: useViewer.getState().selection.levelId ?? undefined,
      }),
      requiresReview: false,
      destructiveActionCount: 0,
      continuation: null,
    }
  }

  const recipe = findMatchingRecipe(prompt)
  if (!recipe) return null

  // Architecture assemblies use item nodes, while the CAD world renders only
  // sketches and CAD bodies. Keep those assemblies in the visible world.
  if (useEditor.getState().workspace === 'cad' && recipe.id !== 'heart' && recipe.id !== 'board') {
    return null
  }

  const actions = recipe.generateActions({ position: [0, 0, 0] })
  return {
    reply: `I have prepared the plan to build ${recipe.name}.`,
    mode: 'plan',
    assumptions: [
      `Generated editable 3D elements for ${recipe.name}.`,
      'Positioned at workspace origin.',
    ],
    ambiguities: [],
    actions,
    requiresReview: false,
    destructiveActionCount: 0,
    continuation: null,
  }
}

const formatAction = (action: AssistantAction) => {
  switch (action.type) {
    case 'reset_workspace_selection':
      return 'Reset workspace selection'
    case 'set_phase':
      return `Switch to ${action.phase}`
    case 'set_camera_mode':
      return `Set camera mode to ${action.cameraMode}`
    case 'set_theme':
      return `Set theme to ${action.theme}`
    case 'set_level_view_mode':
      return `Set level mode to ${action.levelMode}`
    case 'set_wall_view_mode':
      return `Set wall mode to ${action.wallMode}`
    case 'set_preview_mode':
      return `${action.enabled ? 'Enter' : 'Exit'} preview mode`
    case 'set_scans_visibility':
      return `${action.enabled ? 'Show' : 'Hide'} scans`
    case 'set_guides_visibility':
      return `${action.enabled ? 'Show' : 'Hide'} guides`
    case 'set_grid_visibility':
      return `${action.enabled ? 'Show' : 'Hide'} grid`
    case 'set_cad_workplane':
      return `Set CAD workplane to ${action.workplane}`
    case 'set_transform_mode':
      return `Set transform gizmo to ${action.transformMode}`
    case 'set_transform_pivot':
      return `Set transform pivot to ${action.pivot}`
    case 'camera_top_view':
      return 'Switch to top view'
    case 'orbit_camera':
      return `Orbit camera ${action.direction === 'ccw' ? 'left' : 'right'}`
    case 'set_fullscreen':
      return `${action.enabled ? 'Enter' : 'Exit'} fullscreen`
    case 'undo_history':
      return 'Undo history'
    case 'redo_history':
      return 'Redo history'
    case 'export_scene':
      return `Export scene as ${action.format.toUpperCase()}`
    case 'copy_share_link':
      return 'Copy share link'
    case 'take_screenshot':
      return 'Take screenshot'
    case 'capture_camera_snapshot':
      return 'Capture camera snapshot'
    case 'view_camera_snapshot':
      return 'View camera snapshot'
    case 'clear_camera_snapshot':
      return 'Clear camera snapshot'
    case 'close_cad_sketch':
      return 'Close CAD sketch'
    case 'activate_tool':
      return action.catalogCategory
        ? `Activate ${action.tool} (${action.catalogCategory})`
        : `Activate ${action.tool}`
    case 'focus_building':
      return 'Focus building'
    case 'focus_level':
      return 'Focus level'
    case 'select_nodes':
      return action.zoneId
        ? 'Select zone'
        : action.nodeIds.length === 0
          ? 'Clear selection'
          : `Select ${action.nodeIds.length} node${action.nodeIds.length === 1 ? '' : 's'}`
    case 'reposition_target':
      return 'Start reposition mode'
    case 'create_level':
      return `Create level ${action.name ?? action.level ?? ''}`.trim()
    case 'rename_level':
      return 'Rename level'
    case 'rename_node':
      return `Rename node to ${action.name}`
    case 'set_node_visibility':
      return `${action.visible ? 'Show' : 'Hide'} ${action.nodeIds.length} node${action.nodeIds.length === 1 ? '' : 's'}`
    case 'update_zone_color':
      return 'Update zone color'
    case 'create_wall':
      return `Create wall from (${action.start.join(', ')}) to (${action.end.join(', ')})`
    case 'create_zone':
      return `Create zone with ${action.polygon.length} points`
    case 'create_slab':
      return `Create slab with ${action.polygon.length} points`
    case 'create_ceiling':
      return `Create ceiling with ${action.polygon.length} points`
    case 'create_roof':
      return `Create roof between ${action.corner1.join(', ')} and ${action.corner2.join(', ')}`
    case 'place_item':
      return `Place item ${action.assetId}`
    case 'place_door':
      return `Place door on ${action.wallId}`
    case 'place_window':
      return `Place window on ${action.wallId}`
    case 'update_item_properties':
      return 'Update item properties'
    case 'update_door_properties':
      return 'Update door properties'
    case 'update_window_properties':
      return 'Update window properties'
    case 'update_wall_properties':
      return 'Update wall properties'
    case 'update_slab_properties':
      return 'Update slab properties'
    case 'update_ceiling_properties':
      return 'Update ceiling properties'
    case 'update_roof_properties':
      return 'Update roof properties'
    case 'update_reference_properties':
      return 'Update reference properties'
    case 'update_site_properties':
      return 'Update site properties'
    case 'move_target':
      return `Move target${action.delta ? ` by (${action.delta.join(', ')})` : ''}`
    case 'rotate_target':
      return `Rotate target${typeof action.rotationY === 'number' ? ` (${action.rotationY.toFixed(2)} rad)` : ''}`
    case 'scale_target':
      return `Scale target to (${action.scale.join(', ')})`
    case 'duplicate_target':
      return 'Duplicate selected target'
    case 'duplicate_reposition_target':
      return 'Duplicate and start reposition mode'
    case 'delete_target':
      return 'Delete selected target'
    case 'delete_nodes':
      return `Delete ${action.nodeIds.length} selected node${action.nodeIds.length === 1 ? '' : 's'}`
    case 'clear_level_contents':
      return 'Clear current level contents'
    case 'execute_cad_brief':
      return `Create CAD geometry: ${action.brief.intent}`
    case 'run_cad_prompt':
      return `Run CAD prompt: ${action.prompt}`
    case 'extrude_cad_sketch':
      return `Extrude CAD sketch${action.depth ? ` (${action.depth}m)` : ''}`
    case 'revolve_cad_sketch':
      return `Revolve CAD sketch${action.angle ? ` (${action.angle}deg)` : ''}`
    case 'retry_cad_body':
      return 'Retry CAD body regeneration'
    case 'set_cad_body_operation_suppressed':
      return `${action.suppressed ? 'Suppress' : 'Restore'} CAD body operation`
    case 'apply_cad_boolean':
      return `Apply CAD Boolean ${action.operation}`
    case 'apply_cad_fillet':
      return `Apply CAD fillet${action.radius ? ` (${action.radius}m)` : ''}`
    case 'apply_cad_chamfer':
      return `Apply CAD chamfer${action.distance ? ` (${action.distance}m)` : ''}`
    case 'add_cad_box_ears':
      return 'Add box ears to selected CAD body'
    case 'extrude_cad_body_face':
      return `Extrude ${action.face} face${action.distance ? ` (${action.distance}m)` : ''}`
    case 'shell_cad_body':
      return `Create shell panels${action.thickness ? ` (${action.thickness}m)` : ''}`
    default:
      return action.type.replaceAll('_', ' ')
  }
}

const createAssistantUndoSnapshot = (label: string): AssistantUndoSnapshot => {
  const editor = useEditor.getState()

  return {
    label,
    scene: {
      nodes: structuredClone(useScene.getState().nodes),
      rootNodeIds: [...useScene.getState().rootNodeIds],
    },
    selection: structuredClone(useViewer.getState().selection),
    editor: {
      phase: editor.phase,
      cadMode: editor.cadMode,
      cadBooleanMode: editor.cadBooleanMode,
      activeWorkplane: editor.activeWorkplane,
      activeSketchId: editor.activeSketchId,
      mode: editor.mode,
      tool: editor.tool,
      structureLayer: editor.structureLayer,
      catalogCategory: editor.catalogCategory,
      selectedReferenceId: editor.selectedReferenceId,
      transformMode: editor.transformMode,
      transformTarget: editor.transformTarget,
      transformPivot: editor.transformPivot,
      editingHole: editor.editingHole,
      isPreviewMode: editor.isPreviewMode,
    },
  }
}

const restoreAssistantUndoSnapshot = (snapshot: AssistantUndoSnapshot) => {
  applySceneGraphToEditor(snapshot.scene)
  useEditor.setState(snapshot.editor)
  useViewer.getState().setSelection(snapshot.selection)
}

const getTurnReviewState = (turn: AssistantTurnResult) => {
  const validation = validateAssistantPlan(turn.actions)

  return {
    requiresReview: turn.requiresReview || (validation.valid && validation.requiresReview),
    destructiveActionCount: Math.max(
      turn.destructiveActionCount,
      validation.valid ? validation.destructiveActionCount : 0,
    ),
  }
}

const requiresManualReview = (
  turn: AssistantTurnResult,
  executionPolicy: ExecutionPolicy,
) => {
  const reviewState = getTurnReviewState(turn)
  return reviewState.requiresReview && (executionPolicy === 'review' || reviewState.destructiveActionCount > 0)
}

const lowercaseFirst = (value: string) => (value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value)

const summarizeAssistantTurn = (turn: AssistantTurnResult) => {
  if (turn.actions.length === 0) return turn.reply

  const labels = turn.actions.slice(0, 2).map((action) => lowercaseFirst(formatAction(action)))
  if (labels.length === 1) return `Executing: ${labels[0]}.`
  if (turn.actions.length === 2) return `Executing: ${labels[0]}, then ${labels[1]}.`
  return `Executing: ${labels[0]}, ${labels[1]}, and ${turn.actions.length - 2} more actions.`
}

const summarizeReviewScope = (actions: AssistantAction[]) => {
  let createCount = 0
  let editCount = 0
  let deleteCount = 0

  for (const action of actions) {
    if (action.type.startsWith('delete_') || action.type === 'clear_level_contents') {
      deleteCount += 1
      continue
    }

    if (
      action.type.startsWith('create_') ||
      action.type.startsWith('place_') ||
      action.type === 'execute_cad_brief' ||
      action.type === 'run_cad_prompt' ||
      action.type === 'extrude_cad_sketch' ||
      action.type === 'revolve_cad_sketch' ||
      action.type === 'apply_cad_boolean' ||
      action.type === 'apply_cad_fillet' ||
      action.type === 'apply_cad_chamfer' ||
      action.type === 'add_cad_box_ears' ||
      action.type === 'extrude_cad_body_face' ||
      action.type === 'shell_cad_body'
    ) {
      createCount += 1
      continue
    }

    editCount += 1
  }

  const parts = [
    createCount > 0 ? `${createCount} create` : null,
    editCount > 0 ? `${editCount} edit` : null,
    deleteCount > 0 ? `${deleteCount} delete` : null,
  ].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(' · ') : 'No scene changes.'
}

const getAssistantRouteErrorMessage = (payload: AssistantRouteErrorPayload | null) => {
  if (payload?.kind === 'timeout') {
    return 'Assistant planning timed out. Try a more specific request.'
  }

  if (payload?.kind === 'validation') {
    return 'Assistant planning returned an invalid action plan.'
  }

  if (payload?.error) return payload.error
  return 'Assistant planning failed. Check the remote AI provider configuration.'
}

export function AiAssistantPanel() {
  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const levelId = useViewer((state) => state.selection.levelId)
  const zoneId = useViewer((state) => state.selection.zoneId)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const setSelection = useViewer((state) => state.setSelection)
  const cameraMode = useViewer((state) => state.cameraMode)
  const levelMode = useViewer((state) => state.levelMode)
  const setActiveSketchId = useEditor((state) => state.setActiveSketchId)
  const phase = useEditor((state) => state.phase)
  const tool = useEditor((state) => state.tool)
  const showCommandToast = useCad((state) => state.showCommandToast)

  const [collapsed, setCollapsed] = useState(false)
  const [executionPolicy, setExecutionPolicy] = useState<ExecutionPolicy>('autopilot')
  const [chatMode, setChatMode] = useState<AssistantChatMode>('create')
  const [assistantSessionId, setAssistantSessionId] = useState(() => buildAssistantSessionId())
  const [assistantSessionMemory, setAssistantSessionMemory] = useState<AssistantSessionMemory>(
    createEmptyAssistantSessionMemory(),
  )
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<AssistantPanelStatus>('idle')
  const [messages, setMessages] = useState<AssistantChatMessage[]>([])
  const [turn, setTurn] = useState<AssistantTurnResult | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [executionEvents, setExecutionEvents] = useState<AssistantExecutionStatus[]>([])
  const [executionResult, setExecutionResult] = useState<AssistantExecutionResult | null>(null)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [lastPromptImage, setLastPromptImage] = useState<AssistantImageAttachment | null>(null)
  const [, setLastPromptImageDataUrl] = useState<string | null>(null)
  const [attachedImage, setAttachedImage] = useState<PanelAttachedImage | null>(null)
  const [lastUndoSnapshot, setLastUndoSnapshot] = useState<AssistantUndoSnapshot | null>(null)
  const [panelPosition, setPanelPosition] = useState<AssistantPanelPosition | null>(null)
  const [assistantUiHydrated, setAssistantUiHydrated] = useState(false)
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const [floatingElement, setFloatingElement] = useState<HTMLElement | null>(null)
  const [isAutoContinuing, setIsAutoContinuing] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const [taskPlan, setTaskPlan] = useState<TaskPlan | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null)
  const [taskPlanStatus, setTaskPlanStatus] = useState<TaskPlanStatus>('ready')
  const [inlineGhostText, setInlineGhostText] = useState('')
  const [inlineCompletionText, setInlineCompletionText] = useState('')
  const [dismissedInlineCompletion, setDismissedInlineCompletion] = useState<string | null>(null)

  const floatingRef = useRef<HTMLElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const continuationRunIdRef = useRef(0)
  const assistantRequestIdRef = useRef(0)
  const assistantRequestWorkspaceContextRef = useRef<ReturnType<typeof getAssistantWorkspaceContext> | null>(null)
  const stopContinuationRef = useRef(false)
  const stopTaskPlanRef = useRef(false)

  // Unified Model Switcher & API Config State
  const [activeModel, setActiveModel] = useState('openrouter/free')
  const [activeProvider, setActiveProvider] = useState('openrouter')
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [showApiSettings, setShowApiSettings] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('https://openrouter.ai/api/v1')
  const [isSavingApiConfig, setIsSavingApiConfig] = useState(false)
  const [apiConfigMessage, setApiConfigMessage] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<
    Array<{
      id: string
      name: string
      description?: string
      contextLength?: number | null
      isFree: boolean
      isRecommended?: boolean
    }>
  >([])
  const [modelSearch, setModelSearch] = useState('')
  const [modelFilter, setModelFilter] = useState<'free' | 'recommended' | 'all'>('free')
  const [loadingModels, setLoadingModels] = useState(false)

  const loadAiModelConfig = async () => {
    try {
      const res = await pistolaFetch('/api/ai/config')
      if (res.ok) {
        const data = await res.json()
        if (data.model) setActiveModel(data.model)
        if (data.provider) setActiveProvider(data.provider)
        if (data.baseUrl) setBaseUrlInput(data.baseUrl)
      }
    } catch {
      // ignore
    }
  }

  const handleSaveApiSettings = async () => {
    setIsSavingApiConfig(true)
    setApiConfigMessage(null)
    try {
      const res = await pistolaFetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          model: activeModel,
          apiKey: apiKeyInput.trim() || undefined,
          baseUrl: baseUrlInput.trim() || undefined,
        }),
      })
      if (res.ok) {
        setApiConfigMessage('Settings saved successfully!')
        showCommandToast('AI API configuration updated.')
        await loadAvailableModels(true)
        setApiKeyInput('')
        setTimeout(() => setShowApiSettings(false), 1200)
      } else {
        const data = await res.json().catch(() => ({}))
        setApiConfigMessage(data.error || 'Failed to save settings.')
      }
    } catch (err) {
      setApiConfigMessage(err instanceof Error ? err.message : 'Error saving settings.')
    } finally {
      setIsSavingApiConfig(false)
    }
  }

  const loadAvailableModels = async (force = false) => {
    setLoadingModels(true)
    try {
      try {
        const res = await pistolaFetch(
          `/api/ai/models?provider=${activeProvider}${force ? '&forceRefresh=1' : ''}`,
        )
        if (res.ok) {
          const data = await res.json()
          if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
            setAvailableModels(data.models)
            return
          }
        }
      } catch {
        // Sites cannot read Canner's catalog until that API sends CORS headers.
      }

      if (activeProvider === 'openai') {
        setAvailableModels([])
        return
      }

      try {
        const models = await fetchOpenRouterModelCatalog({
          baseUrl: baseUrlInput,
        })
        setAvailableModels(models)
      } catch {
        setAvailableModels(FALLBACK_OPENROUTER_MODELS)
      }
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSelectModel = async (newModelId: string) => {
    setActiveModel(newModelId)
    setIsModelMenuOpen(false)
    try {
      await pistolaFetch('/api/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          model: newModelId,
        }),
      })
      showCommandToast(`Active AI model switched to: ${newModelId}`)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadAiModelConfig()
    void loadAvailableModels()
  }, [])

  const filteredChatModels = useMemo(() => {
    let list = availableModels
    if (modelFilter === 'free') {
      list = list.filter((m) => m.isFree)
    } else if (modelFilter === 'recommended') {
      list = list.filter((m) => m.isRecommended || m.isFree)
    }
    if (modelSearch.trim()) {
      const q = modelSearch.toLowerCase().trim()
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)),
      )
    }
    return list
  }, [availableModels, modelFilter, modelSearch])

  const freeModelCount = useMemo(
    () => availableModels.filter((m) => m.isFree).length,
    [availableModels],
  )


  const selectedSummary = useMemo(() => {
    if (zoneId) {
      const zone = nodes[zoneId as AnyNodeId]
      return zone?.type === 'zone' ? zone.name : zoneId
    }
    if (selectedIds.length === 1) {
      const node = nodes[selectedIds[0] as AnyNodeId]
      return node ? ('name' in node ? (node.name ?? node.type) : node.type) : (selectedIds[0] ?? 'Selected node')
    }
    if (selectedIds.length > 1) return `${selectedIds.length} selected`
    return 'No selection'
  }, [nodes, selectedIds, zoneId])

  const composerCatalogCategories = Array.from(
    new Set(
      getAssistantWorkspaceContext()
        .catalog.map((item) => item.category)
        .filter((category): category is string => typeof category === 'string' && category.length > 0),
    ),
  ).slice(0, 4)

  const composerAvailableTools = useMemo(
    () => assistantToolValues.filter((candidate) => assistantToolPhaseMap[candidate] === phase),
    [phase],
  )

  const composerSuggestions = useMemo(
    () =>
      getAssistantComposerSuggestions({
        input,
        phase,
        tool,
        availableTools: composerAvailableTools,
        selectedSummary,
        hasSelection: selectedIds.length > 0 || Boolean(zoneId),
        levelId,
        chatMode,
        catalogCategories: composerCatalogCategories,
        recentSuccessfulPrompts: assistantSessionMemory.recentSuccessfulPrompts,
      }),
    [
      assistantSessionMemory.recentSuccessfulPrompts,
      chatMode,
      composerAvailableTools,
      composerCatalogCategories,
      input,
      levelId,
      phase,
      selectedIds.length,
      selectedSummary,
      tool,
      zoneId,
    ],
  )

  const inlineAutocompletion = useMemo(() => {
    const completion = getInlineAutocompletion({
      input,
      phase,
      tool,
      availableTools: composerAvailableTools,
      selectedSummary,
      hasSelection: selectedIds.length > 0 || Boolean(zoneId),
      levelId,
      chatMode,
      catalogCategories: composerCatalogCategories,
      recentSuccessfulPrompts: assistantSessionMemory.recentSuccessfulPrompts,
    })

    if (!completion) return null
    if (dismissedInlineCompletion === completion.fullText) return null
    return completion
  }, [
    assistantSessionMemory.recentSuccessfulPrompts,
    chatMode,
    composerAvailableTools,
    composerCatalogCategories,
    dismissedInlineCompletion,
    input,
    levelId,
    phase,
    selectedIds.length,
    selectedSummary,
    tool,
    zoneId,
  ])

  const composerPlaceholder =
    chatMode === 'ask'
      ? 'Ask about the workspace, current tools, or what the assistant can do.'
      : chatMode === 'refine'
        ? 'Describe the change you want on the selected or recent result.'
        : 'Describe what to build. Specific requests execute immediately when they are safe.'

  const turnNeedsManualReview = turn ? requiresManualReview(turn, executionPolicy) : false
  const shouldShowReviewCard =
    Boolean(turn?.actions.length) && turnNeedsManualReview && turn?.mode !== 'task-plan'

  const pendingAssistantMessage =
    status === 'planning'
      ? 'Planning your request...'
      : status === 'executing'
        ? isAutoContinuing
          ? 'Continuing the build...'
          : 'Executing assistant actions...'
        : null
  const composerLocked = isAssistantComposerLocked(status)

  useEffect(() => {
    setActiveSuggestionIndex((current) =>
      composerSuggestions.length === 0 ? 0 : Math.min(current, composerSuggestions.length - 1),
    )
  }, [composerSuggestions.length])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInlineGhostText(inlineAutocompletion?.ghostText ?? '')
      setInlineCompletionText(inlineAutocompletion?.fullText ?? '')
    }, 50)

    return () => window.clearTimeout(timer)
  }, [inlineAutocompletion])

  useEffect(() => {
    try {
      const savedMemory = localStorage.getItem('pistola:aiAssistantSessionMemory')
      if (savedMemory) {
        const restoredMemory = restoreAssistantSessionMemory(JSON.parse(savedMemory))
        setAssistantSessionMemory(restoredMemory)
        setMessages(
          restoredMemory.conversationHistory.map((turn, index) => ({
            id: `${Date.now()}-restored-${index}`,
            role: turn.role,
            text: turn.text,
          })),
        )
        return
      }

      const savedHistory = localStorage.getItem('pistola:aiAssistantConversationHistory')
      if (savedHistory) {
        const restoredMemory = restoreAssistantSessionMemory({
          conversationHistory: JSON.parse(savedHistory),
        })
        setAssistantSessionMemory(restoredMemory)
        setMessages(
          restoredMemory.conversationHistory.map((turn, index) => ({
            id: `${Date.now()}-restored-${index}`,
            role: turn.role,
            text: turn.text,
          })),
        )
      }
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'pistola:aiAssistantSessionMemory',
      JSON.stringify(assistantSessionMemory),
    )
    localStorage.removeItem('pistola:aiAssistantConversationHistory')
  }, [assistantSessionMemory])

  useEffect(() => {
    if (!isDraggingPanel) return

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      const rect = floatingRef.current?.getBoundingClientRect()
      if (!dragState || dragState.pointerId !== event.pointerId || !rect) return

      const nextPosition = clampPanelPosition(
        {
          x: event.clientX - dragState.offsetX,
          y: event.clientY - dragState.offsetY,
        },
        rect.width,
        rect.height,
      )

      setPanelPosition((current) =>
        current?.x === nextPosition.x && current?.y === nextPosition.y ? current : nextPosition,
      )
    }

    const stopDragging = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return
      dragStateRef.current = null
      setIsDraggingPanel(false)
    }

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [isDraggingPanel])

  useEffect(() => {
    const syncPanelPosition = () => {
      const rect = floatingRef.current?.getBoundingClientRect()
      if (!rect) return

      setPanelPosition((current) => {
        if (!current) return current
        const nextPosition = clampPanelPosition(current, rect.width, rect.height)
        return nextPosition.x === current.x && nextPosition.y === current.y ? current : nextPosition
      })
    }

    const element = floatingElement
    const resizeObserver =
      element && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncPanelPosition) : null

    if (resizeObserver && element) {
      resizeObserver.observe(element)
    }
    window.addEventListener('resize', syncPanelPosition)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncPanelPosition)
    }
  }, [floatingElement])

  const assignFloatingRef = (element: HTMLButtonElement | HTMLDivElement | null) => {
    floatingRef.current = element
    setFloatingElement(element)
  }

  useEffect(() => {
    const stored = readAssistantPanelStorage()
    setCollapsed(stored.collapsed)
    setPanelPosition(stored.position)
    setAssistantUiHydrated(true)
  }, [])

  useEffect(() => {
    if (!assistantUiHydrated) return
    try {
      window.localStorage.setItem(
        ASSISTANT_PANEL_STORAGE_KEY,
        JSON.stringify({ collapsed, position: panelPosition }),
      )
    } catch {
      // Private browsing can block storage. The panel still works for this session.
    }
  }, [assistantUiHydrated, collapsed, panelPosition])

  const handleDockLeft = () => {
    const sidebar = document.querySelector('[data-slot="sidebar"][data-state="expanded"]')
    const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 0
    const height = floatingRef.current?.getBoundingClientRect().height ?? 480
    setCollapsed(false)
    setPanelPosition(
      clampPanelPosition(
        { x: sidebarWidth > 48 ? sidebarWidth + PANEL_GUTTER : PANEL_GUTTER, y: PANEL_GUTTER },
        DEFAULT_PANEL_WIDTH,
        height,
      ),
    )
  }

  const handlePanelDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isInteractiveDragTarget(event.target)) return

    const rect = floatingRef.current?.getBoundingClientRect()
    if (!rect) return

    const nextPosition = clampPanelPosition(
      { x: rect.left, y: rect.top },
      rect.width || DEFAULT_PANEL_WIDTH,
      rect.height,
    )

    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    setPanelPosition(nextPosition)
    setIsDraggingPanel(true)
    event.preventDefault()
  }

  const floatingPositionStyle = panelPosition
    ? {
      left: panelPosition.x,
      top: panelPosition.y,
      right: 'auto',
      bottom: 'auto',
    }
    : undefined

  const buildViewportMetadata = () =>
    buildAssistantViewportMetadata({
      cameraMode,
      levelMode,
      phase,
      tool,
    })

  const attachImageFile = async (file: File, source: 'upload' | 'paste') => {
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Unable to read the attached image.'))
      reader.readAsDataURL(file)
    })

    const attachment = await createAssistantImageAttachment({
      dataUrl,
      filename: file.name,
      kind: attachedImage?.kind ?? 'auto',
      mimeType: file.type,
      source,
      viewport: buildViewportMetadata(),
    })

    setAttachedImage({
      ...attachment,
      file,
    })
  }

  const resetAssistantSession = (options: { preserveChatMode?: boolean; showToast?: boolean } = {}) => {
    stopContinuationRef.current = true
    stopTaskPlanRef.current = true
    continuationRunIdRef.current += 1
    assistantRequestIdRef.current += 1
    const nextSessionState = buildAssistantPanelSessionReset<
      AssistantTurnResult,
      AssistantExecutionStatus,
      AssistantExecutionResult,
      PanelAttachedImage,
      AssistantUndoSnapshot
    >({
      currentChatMode: chatMode,
      preserveChatMode: options.preserveChatMode,
      nextSessionId: buildAssistantSessionId(),
    })
    setIsAutoContinuing(nextSessionState.isAutoContinuing)
    setStatus(nextSessionState.status)
    setMessages(nextSessionState.messages)
    setTurn(nextSessionState.turn)
    setPanelError(nextSessionState.panelError)
    setExecutionEvents(nextSessionState.executionEvents)
    setExecutionResult(nextSessionState.executionResult)
    setLastPrompt(nextSessionState.lastPrompt)
    setLastPromptImage(null)
    setLastPromptImageDataUrl(nextSessionState.lastPromptImageDataUrl)
    setAttachedImage(nextSessionState.attachedImage)
    setLastUndoSnapshot(nextSessionState.lastUndoSnapshot)
    setInput(nextSessionState.input)
    setTaskPlan(null)
    setActiveStepIndex(null)
    setTaskPlanStatus('ready')
    setInlineGhostText('')
    setInlineCompletionText('')
    setDismissedInlineCompletion(null)
    setAssistantSessionId(nextSessionState.assistantSessionId)
    setAssistantSessionMemory(nextSessionState.assistantSessionMemory)
    setActiveSuggestionIndex(nextSessionState.activeSuggestionIndex)
    setChatMode(nextSessionState.chatMode)
    localStorage.removeItem('pistola:aiAssistantSessionMemory')
    localStorage.removeItem('pistola:aiAssistantConversationHistory')
    if (options.showToast ?? true) {
      showCommandToast('Started a new assistant chat.')
    }
  }

  const applyComposerSuggestion = (suggestion: AssistantComposerSuggestion) => {
    setInput((current) => applyAssistantComposerSuggestion(current, suggestion))
    setActiveSuggestionIndex(0)
    queueMicrotask(() => textareaRef.current?.focus())
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && inlineCompletionText) {
      event.preventDefault()
      setDismissedInlineCompletion(inlineCompletionText)
      setInlineGhostText('')
      setInlineCompletionText('')
      return
    }

    if (event.key === 'Tab' && inlineCompletionText) {
      event.preventDefault()
      setInput(inlineCompletionText)
      setInlineGhostText('')
      setInlineCompletionText('')
      setDismissedInlineCompletion(null)
      return
    }

    const keyAction = resolveAssistantComposerKeyAction({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      activeSuggestionIndex,
      suggestionCount: composerSuggestions.length,
    })

    if (keyAction.type === 'submit-prompt') {
      event.preventDefault()
      void handleSend()
      return
    }

    if (keyAction.type === 'move-selection') {
      event.preventDefault()
      setActiveSuggestionIndex(keyAction.nextIndex)
      return
    }

    if (keyAction.type === 'apply-suggestion') {
      const suggestion =
        composerSuggestions[keyAction.suggestionIndex] ?? composerSuggestions[0]
      if (!suggestion) return
      event.preventDefault()
      applyComposerSuggestion(suggestion)
    }
  }

  const applyCadExecutionSelection = (result: {
    bodyIds: string[]
    sketchIds: string[]
  }) => {
    if (result.bodyIds[0]) {
      setSelection({ selectedIds: [result.bodyIds[0]], zoneId: null })
    } else if (result.sketchIds[0]) {
      setSelection({ selectedIds: [result.sketchIds[0]], zoneId: null })
    }
    setActiveSketchId(null)
  }

  const executeCadBriefAction = async (brief: CadBrief) => {
    const currentNodes = useScene.getState().nodes
    const currentRootNodeIds = useScene.getState().rootNodeIds
    const currentLevelId = useViewer.getState().selection.levelId
    const parentId = getCadParentId(currentLevelId, currentRootNodeIds, currentNodes)
    if (!parentId) {
      throw new Error('Select a site or level before creating CAD geometry.')
    }

    const result = await executeCadBrief(brief, parentId)
    applyCadExecutionSelection(result)
    return result
  }

  const generateMacPartAction = async (prompt: string) => {
    const result = await generateMacPart(prompt)
    applyCadExecutionSelection({ bodyIds: result.bodyIds, sketchIds: [] })
    return { bodyIds: result.bodyIds, jobId: result.jobId }
  }

  const runCadPrompt = async (prompt: string) => {
    const currentNodes = useScene.getState().nodes
    const currentLevelId = useViewer.getState().selection.levelId
    const currentSelectedIds = useViewer.getState().selection.selectedIds
    const currentRootNodeIds = useScene.getState().rootNodeIds
    const parentId = getCadParentId(currentLevelId, currentRootNodeIds, currentNodes)
    if (!parentId) {
      throw new Error('Select a site or level before creating CAD geometry.')
    }

    const localResult = await executeLocalCadIntent(prompt, {
      parentId,
      nodes: currentNodes,
      selectedIds: currentSelectedIds,
      levelId: currentLevelId,
    })

    if (localResult.handled) {
      if (localResult.assumptions.length > 0) {
        showCommandToast(localResult.assumptions[0] ?? 'Executed a local CAD intent.')
      }

      applyCadExecutionSelection(localResult)
      return {
        bodyIds: localResult.bodyIds,
        sketchIds: localResult.sketchIds,
      }
    }

    const macroTurn = await requestAssistantTurn({
      prompt,
      complexity: 'simple',
      assistantSessionOverrides: {
        cadMacroExpansion: true,
      },
    })

    const macroThreadId = macroTurn.providerMeta?.codexThreadId
    if (macroThreadId) {
      setAssistantSessionMemory((current) => ({
        ...current,
        codexThreadId: macroThreadId,
      }))
    }

    if (macroTurn.mode === 'clarify') {
      throw new Error(macroTurn.reply)
    }

    if (macroTurn.actions.length === 0) {
      throw new Error(macroTurn.reply || 'Assistant CAD expansion returned no executable actions.')
    }

    if (macroTurn.actions.some((action) => action.type === 'run_cad_prompt')) {
      throw new Error('Assistant returned an unresolved CAD macro. Retry with a more specific CAD request.')
    }

    const result = await executeAssistantPlan(macroTurn.actions, {
      reviewConfirmed: true,
      runtime: {
        executeCadBrief: executeCadBriefAction,
        runCadPrompt,
        generateMacPart: generateMacPartAction,
      },
    })

    if (!result.ok) {
      throw new Error(result.errors[0] ?? 'Assistant CAD expansion failed.')
    }

    applyCadExecutionSelection({
      bodyIds: result.bodyIds,
      sketchIds: result.sketchIds,
    })
    return {
      bodyIds: result.bodyIds,
      sketchIds: result.sketchIds,
    }
  }

  const assistantRuntime = {
    executeCadBrief: executeCadBriefAction,
    runCadPrompt,
    generateMacPart: generateMacPartAction,
  }

  const getAssistantSessionContext = (overrides: Record<string, unknown> = {}) => ({
    sessionId: assistantSessionId,
    chatMode,
    codexThreadId: assistantSessionMemory.codexThreadId,
    lastError: assistantSessionMemory.lastError,
    lastCreatedNodes: assistantSessionMemory.lastCreatedNodes,
    recentReferencedNodes: assistantSessionMemory.recentReferencedNodes,
    recentSuccessfulPrompts: assistantSessionMemory.recentSuccessfulPrompts,
    failedPrompts: assistantSessionMemory.failedPrompts,
    taskPlans: assistantSessionMemory.taskPlans,
    taskPlanSummaries: assistantSessionMemory.taskPlanSummaries,
    preferredComplexity: assistantSessionMemory.preferredComplexity,
    ...overrides,
  })

  const getCreatedNodeSummaries = (result: AssistantExecutionResult) => {
    const nodeIds = Array.from(
      new Set([...result.createdNodeIds, ...result.bodyIds, ...result.sketchIds].filter(Boolean)),
    )

    return nodeIds
      .map((nodeId) => useScene.getState().nodes[nodeId as AnyNodeId])
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => summarizeAssistantNode(node))
  }

  const getReferencedActionNodeIds = (actions: AssistantTurnResult['actions']) => {
    const referencedNodeIds = new Set<string>()

    const addNodeId = (value: unknown) => {
      if (
        typeof value === 'string' &&
        value.length > 0 &&
        !value.startsWith('$ref_')
      ) {
        referencedNodeIds.add(value)
      }
    }

    for (const action of actions) {
      const record = action as Record<string, unknown>
      addNodeId(record.nodeId)
      addNodeId(record.wallId)
      addNodeId(record.targetNodeId)
      addNodeId(record.parentId)
      addNodeId(record.levelId)
      addNodeId(record.buildingId)
      addNodeId(record.bodyId)
      addNodeId(record.sketchId)

      if (Array.isArray(record.nodeIds)) {
        for (const nodeId of record.nodeIds) addNodeId(nodeId)
      }
    }

    return Array.from(referencedNodeIds)
  }

  const getReferencedNodeSummaries = ({
    actions,
    createdNodeSummaries,
  }: {
    actions: AssistantTurnResult['actions']
    createdNodeSummaries: ReturnType<typeof getCreatedNodeSummaries>
  }) => {
    const workspaceContext = assistantRequestWorkspaceContextRef.current
    if (!workspaceContext) return createdNodeSummaries

    const availableSummaries = [
      ...createdNodeSummaries,
      ...workspaceContext.selectedNodeSummary,
      ...workspaceContext.sceneSummary,
      ...(workspaceContext.levelSummary ? [workspaceContext.levelSummary] : []),
      ...(workspaceContext.buildingSummary ? [workspaceContext.buildingSummary] : []),
    ]

    const summariesById = new Map(
      availableSummaries
        .filter(
          (summary): summary is typeof availableSummaries[number] & { id: string } =>
            typeof summary?.id === 'string' && summary.id.length > 0,
        )
        .map((summary) => [summary.id, summary]),
    )

    const referencedFromActions = getReferencedActionNodeIds(actions)
      .map((nodeId) => summariesById.get(nodeId))
      .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary))

    return [
      ...createdNodeSummaries,
      ...referencedFromActions,
      ...workspaceContext.selectedNodeSummary,
    ]
  }

  const requestAssistantTurn = async ({
    prompt,
    image,
    continuation,
    complexity,
    assistantSessionOverrides,
  }: {
    prompt: string
    image?: AssistantImageAttachment | null
    continuation?: AssistantContinuation | null
    complexity?: 'simple' | 'moderate' | 'complex'
    assistantSessionOverrides?: Record<string, unknown>
  }) => {
    const workspaceContext = getAssistantWorkspaceContext()
    assistantRequestWorkspaceContextRef.current = workspaceContext

    // Deterministic built-in recipes must remain usable in the statically
    // hosted editor, where the optional planning API may not be available.
    if (!continuation) {
      const localRecipeTurn = buildLocalCreationRecipeTurn(prompt)
      if (localRecipeTurn) return localRecipeTurn
    }

    const response = await pistolaFetch('/api/assistant/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        chatMode,
        model: activeModel,
        provider: activeProvider,
        sessionId: assistantSessionId,
        ...(assistantSessionMemory.codexThreadId
          ? { codexThreadId: assistantSessionMemory.codexThreadId }
          : {}),
        context: {
          ...workspaceContext,
          assistantSession: getAssistantSessionContext(assistantSessionOverrides),
        },
        conversationHistory: assistantSessionMemory.conversationHistory,
        ...(complexity ? { complexity } : {}),
        ...(image ? { image } : {}),
        ...(continuation ? { continuation } : {}),
      }),
    })

    const payload = (await response.json().catch(() => null)) as
      | AssistantTurnResult
      | AssistantRouteErrorPayload
      | null
    if (!response.ok) {
      throw new Error(getAssistantRouteErrorMessage(payload as AssistantRouteErrorPayload | null))
    }

    return payload as AssistantTurnResult
  }

  const isActiveAssistantRequest = (requestId: number) => assistantRequestIdRef.current === requestId

  const executeTurnChunk = async (
    {
      nextTurn,
      reviewConfirmed,
      existingUndoSnapshot,
      requestId,
      promptLabel,
    }: {
      nextTurn: AssistantTurnResult
      reviewConfirmed: boolean
      existingUndoSnapshot: AssistantUndoSnapshot | null
      requestId: number
      promptLabel: string
    },
  ) => {
    if (isActiveAssistantRequest(requestId)) {
      setPanelError(null)
      setExecutionEvents([])
      setExecutionResult(null)
      setStatus('executing')
    }
    const undoSnapshot =
      existingUndoSnapshot ??
      (nextTurn.requiresReview ? createAssistantUndoSnapshot(promptLabel || nextTurn.reply) : null)

    const result = await executeAssistantPlan(nextTurn.actions, {
      reviewConfirmed,
      runtime: assistantRuntime,
      onStatus: (event) => {
        if (!isActiveAssistantRequest(requestId)) return
        setExecutionEvents((current) => [...current, event].slice(-8))
      },
    })

    if (!isActiveAssistantRequest(requestId)) {
      return { result, undoSnapshot }
    }

    setExecutionResult(result)

    if (!result.ok) {
      const baseErrorMessage = result.errors[0] ?? 'Assistant execution failed.'
      const errorMessage =
        result.failureKind === 'execution-rolled-back'
          ? `${baseErrorMessage}${result.snapshotRestored ? ' Reviewed changes were rolled back.' : ''}`
          : baseErrorMessage
      setAssistantSessionMemory((current) =>
        rememberFailedPrompt(
          {
            ...current,
            lastError: errorMessage,
          },
          promptLabel,
        ),
      )
      setPanelError(errorMessage)
      showCommandToast(errorMessage)
      setStatus('error')
      return { result, undoSnapshot }
    }

    const createdNodeSummaries = getCreatedNodeSummaries(result)
    const referencedNodeSummaries = getReferencedNodeSummaries({
      actions: nextTurn.actions,
      createdNodeSummaries,
    })
    if (result.warnings.length > 0 && !nextTurn.requiresReview) {
      const warningSummary =
        result.warnings.length === 1
          ? result.warnings[0]
          : `${result.warnings[0]} (${result.warnings.length} execution warnings in total.)`
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant-execution-warning`,
          role: 'assistant',
          text: `Completed with partial skips: ${warningSummary}`,
        },
      ])
      showCommandToast('Assistant actions completed with partial skips.')
    }
    setAssistantSessionMemory((current) =>
      rememberSuccessfulAssistantPrompt(
        rememberReferencedAssistantNodes(
          {
            ...current,
            lastCreatedNodes:
              createdNodeSummaries.length > 0 ? createdNodeSummaries : current.lastCreatedNodes,
            lastError: null,
          },
          referencedNodeSummaries,
        ),
        promptLabel,
      ),
    )

    return { result, undoSnapshot }
  }

  const executeTurnSequence = async ({
    initialTurn,
    prompt,
    image,
    reviewConfirmed,
    requestId,
  }: {
    initialTurn: AssistantTurnResult
    prompt: string
    image?: AssistantImageAttachment | null
    reviewConfirmed: boolean
    requestId: number
  }) => {
    const runId = continuationRunIdRef.current + 1
    continuationRunIdRef.current = runId
    stopContinuationRef.current = false
    setIsAutoContinuing(Boolean(initialTurn.continuation))

    const outcome = await runAssistantTurnSequence<AssistantUndoSnapshot>({
      initialTurn,
      prompt,
      image,
      reviewConfirmed,
      executeTurnChunk: (turn, nextReviewConfirmed, undoSnapshot) =>
        executeTurnChunk({
          nextTurn: turn,
          reviewConfirmed: nextReviewConfirmed,
          existingUndoSnapshot: undoSnapshot,
          requestId,
          promptLabel: prompt,
        }),
      requestAssistantTurn,
      requiresManualReview: (turn) => requiresManualReview(turn, executionPolicy),
      shouldContinue: (turn) =>
        shouldRequestAssistantContinuation({
          turn,
          stopRequested: stopContinuationRef.current,
          runId,
          activeRunId: continuationRunIdRef.current,
        }),
      wasInterrupted: () => stopContinuationRef.current,
      onFetchedTurn: (nextTurn, nextTurnNeedsManualReview) => {
        if (!isActiveAssistantRequest(requestId)) return
        setTurn(nextTurn)
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant-continue-${nextTurn.continuation?.stepIndex ?? 'final'}`,
            role: 'assistant',
            text:
              nextTurn.mode === 'plan' && !nextTurnNeedsManualReview
                ? summarizeAssistantTurn(nextTurn)
                : nextTurn.reply,
          },
        ])
        setAssistantSessionMemory((current) =>
          rememberConversationTurn(current, 'continue', nextTurn.reply),
        )
        setIsAutoContinuing(Boolean(nextTurn.continuation))
      },
    })

    if (!isActiveAssistantRequest(requestId)) return

    if (outcome.undoSnapshot) {
      setLastUndoSnapshot(outcome.undoSnapshot)
    }
    if (outcome.interrupted) {
      showCommandToast('Stopped after the current build step.')
    }
    setIsAutoContinuing(false)
    if (outcome.status === 'task-plan') {
      const nextTaskPlan = parseTaskPlanFromTurn(outcome.finalTurn, prompt)
      if (nextTaskPlan) {
        setTaskPlan(nextTaskPlan)
        setActiveStepIndex(getTaskPlanProgress(nextTaskPlan).activeStep)
        setTaskPlanStatus('ready')
      }
    }
    setStatus(outcome.status)
  }

  const executeCurrentTaskPlan = async (planOverride?: TaskPlan | null, requestIdOverride?: number) => {
    const planToRun = planOverride ?? taskPlan
    if (!planToRun) return

    const requestId =
      requestIdOverride ?? assistantRequestIdRef.current + 1
    assistantRequestIdRef.current = requestId
    stopTaskPlanRef.current = false
    if (isActiveAssistantRequest(requestId)) {
      setTaskPlanStatus('executing')
      setStatus('executing')
      setPanelError(null)
      setExecutionEvents([])
      setExecutionResult(null)
    }

    const undoSnapshot =
      lastUndoSnapshot ?? createAssistantUndoSnapshot(lastPrompt ?? planToRun.title)
    if (!lastUndoSnapshot) {
      setLastUndoSnapshot(undoSnapshot)
    }

    const completedPlan = await executeTaskPlan(planToRun, {
      runtime: assistantRuntime,
      shouldStop: () => stopTaskPlanRef.current,
      onStepStart: (stepIndex, step) => {
        if (!isActiveAssistantRequest(requestId)) return
        setActiveStepIndex(stepIndex)
        setTaskPlan((current) => {
          if (!current) return current
          const steps = [...current.steps]
          steps[stepIndex] = step
          return { ...current, steps }
        })
        const event: AssistantExecutionStatus = {
          index: stepIndex,
          action: step.actions[0] ?? { type: 'select_nodes', nodeIds: [] },
          status: 'started',
          message: `Running ${step.description}...`,
        }
        setExecutionEvents((current) => [...current, event].slice(-8))
      },
      onExecutionStatus: (event) => {
        if (!isActiveAssistantRequest(requestId)) return
        setExecutionEvents((current) => [...current, event].slice(-8))
      },
      onStepComplete: (stepIndex, step) => {
        if (!isActiveAssistantRequest(requestId)) return
        setTaskPlan((current) => {
          if (!current) return current
          const steps = [...current.steps]
          steps[stepIndex] = step
          return { ...current, steps }
        })
      },
      onStepError: (stepIndex, step, error) => {
        if (!isActiveAssistantRequest(requestId)) return
        setTaskPlan((current) => {
          if (!current) return current
          const steps = [...current.steps]
          steps[stepIndex] = step
          return { ...current, steps }
        })
        setAssistantSessionMemory((current) =>
          rememberFailedPrompt(
            {
              ...current,
              lastError: error,
            },
            planToRun.prompt,
          ),
        )
        setPanelError(error)
      },
    })

    if (!isActiveAssistantRequest(requestId)) return

    setTaskPlan(completedPlan)
    const progress = getTaskPlanProgress(completedPlan)
    setActiveStepIndex(progress.activeStep)
    if (progress.hasError) {
      setTaskPlanStatus('error')
      setStatus('error')
      return
    }

    if (progress.completed === progress.total) {
      setAssistantSessionMemory((current) =>
        rememberSuccessfulAssistantPrompt(
          rememberCompletedTaskPlan(
            {
              ...current,
              lastError: null,
              preferredComplexity: 'detailed',
            },
            completedPlan,
          ),
          completedPlan.prompt,
        ),
      )
      setTaskPlanStatus('completed')
      setStatus('executed')
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant-task-plan-complete`,
          role: 'assistant',
          text: `Completed task plan: ${completedPlan.title}`,
        },
      ])
      return
    }

    setTaskPlanStatus('ready')
    setStatus('task-plan')
  }

  const retryTaskPlanStep = async (stepIndex: number) => {
    if (!taskPlan) return

    const retriablePlan: TaskPlan = {
      ...taskPlan,
      steps: taskPlan.steps.map((step, index) => {
        if (index < stepIndex) return step
        if (index === stepIndex) return { ...step, status: 'pending', error: undefined }
        return step.status === 'done' ? step : { ...step, status: 'pending', error: undefined }
      }),
    }

    setTaskPlan(retriablePlan)
    setActiveStepIndex(stepIndex)
    await executeCurrentTaskPlan(retriablePlan)
  }

  const stopAutoContinuation = () => {
    stopContinuationRef.current = true
    continuationRunIdRef.current += 1
    setIsAutoContinuing(false)
  }

  const undoLastAssistantTurn = () => {
    if (!lastUndoSnapshot) {
      showCommandToast('No assistant turn is available to undo.')
      return
    }

    restoreAssistantUndoSnapshot(lastUndoSnapshot)
    setLastUndoSnapshot(null)
    setExecutionEvents([])
    setExecutionResult(null)
    setPanelError(null)
    setIsAutoContinuing(false)
    setStatus('idle')
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-assistant-undo`,
        role: 'assistant',
        text: `Restored the scene before: ${lastUndoSnapshot.label}`,
      },
    ])
    showCommandToast('Restored the previous assistant turn.')
  }

  const submitPrompt = async (rawPrompt: string, imageOverride?: AssistantImageAttachment | null) => {
    const promptValidation = validateAssistantPromptForSubmission(rawPrompt)
    if (!promptValidation.ok) {
      showCommandToast(promptValidation.error)
      return
    }
    const prompt = promptValidation.prompt

    const trimmed = prompt.trim()
    const lower = trimmed.toLowerCase()

    // 1. Model Switching commands (supports /model <name> and natural language "Switch model to Claude 3.7 Sonnet")
    const modelSwitchMatch =
      trimmed.match(/^\/model\s*(.*)$/i) ||
      lower.match(/^(?:switch|change|set|use|cambiar|cambia|usar)\s+(?:the\s+)?(?:ai\s+)?model\s+(?:to\s+)?(.+?)[.!]?$/i) ||
      lower.match(/^(?:switch|change|set)\s+to\s+(?:model\s+)?(.+?)[.!]?$/i)

    if (modelSwitchMatch) {
      const rawArg = modelSwitchMatch[1]?.trim().replace(/[.!]^/, '').trim() || ''
      const arg = rawArg.toLowerCase()
      if (!arg || arg === 'list') {
        setIsModelMenuOpen(true)
        void loadAvailableModels()
        setInput('')
        return
      }
      let targetModel = rawArg
      if (arg.includes('free')) targetModel = 'openrouter/free'
      else if (arg.includes('llama')) targetModel = 'meta-llama/llama-3.3-70b-instruct:free'
      else if (arg.includes('deepseek')) targetModel = 'deepseek/deepseek-chat'
      else if (arg.includes('gemini')) targetModel = 'google/gemini-2.5-flash'
      else if (arg.includes('claude')) targetModel = 'anthropic/claude-3.7-sonnet'
      else if (arg.includes('gpt-4') || arg.includes('gpt4') || arg.includes('gpt')) targetModel = 'openai/gpt-4o'
      else {
        const found = availableModels.find(
          (m) =>
            m.id.toLowerCase() === arg ||
            m.name.toLowerCase().includes(arg) ||
            m.id.toLowerCase().includes(arg),
        )
        if (found) targetModel = found.id
      }

      await handleSelectModel(targetModel)
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: `Switched active AI model to \`${targetModel}\`. CAD, architecture, and assistant generation will now use this model.`,
        },
      ])
      setInput('')
      return
    }

    if (/^(?:\/undo|undo|deshacer|revert|undo what you just did|deshaz lo que acabas de hacer)[.!]?$/i.test(trimmed)) {
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
      ])
      undoLastAssistantTurn()
      setInput('')
      return
    }

    // 2. Direct Viewport & Camera commands
    const asksTopView = /\b(top view|vista superior|camara arriba|vista desde arriba|top-down view)\b/i.test(lower)
    const asksSnapshot = /\b(snapshot|screenshot|captura de pantalla|captura|take a snapshot|take snapshot)\b/i.test(lower)

    if (asksTopView && asksSnapshot) {
      await executeAssistantPlan([{ type: 'camera_top_view' }], { reviewConfirmed: true })
      const canvas = document.querySelector('canvas')
      const snapshotUrl = canvas instanceof HTMLCanvasElement ? canvas.toDataURL('image/png') : undefined
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: 'Switched to top-down orthographic camera view and captured viewport snapshot.',
          imageUrl: snapshotUrl,
        },
      ])
      setInput('')
      return
    }

    if (asksTopView) {
      await executeAssistantPlan([{ type: 'camera_top_view' }], { reviewConfirmed: true })
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Switched to top-down orthographic camera view.' },
      ])
      setInput('')
      return
    }

    if (/\b(orbit (camera )?left|girar izquierda|rotar a la izquierda|orbit ccw)\b/i.test(lower)) {
      await executeAssistantPlan([{ type: 'orbit_camera', direction: 'ccw' }], { reviewConfirmed: true })
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Rotated camera counter-clockwise.' },
      ])
      setInput('')
      return
    }

    if (/\b(orbit (camera )?right|girar derecha|rotar a la derecha|orbit cw)\b/i.test(lower)) {
      await executeAssistantPlan([{ type: 'orbit_camera', direction: 'cw' }], { reviewConfirmed: true })
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Rotated camera clockwise.' },
      ])
      setInput('')
      return
    }

    if (/\b(perspective( view)?|3d view|vista 3d|perspectiva)\b/i.test(lower)) {
      useViewer.getState().setCameraMode('perspective')
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Switched camera to 3D perspective mode.' },
      ])
      setInput('')
      return
    }

    if (/\b(orthographic( view)?|isometric( view)?|vista isom[eé]trica)\b/i.test(lower)) {
      useViewer.getState().setCameraMode('orthographic')
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Switched camera to orthographic isometric mode.' },
      ])
      setInput('')
      return
    }

    if (/\b(focus( on)? selection|zoom to selection|enfocar( selecci[oó]n)?)\b/i.test(lower)) {
      const selectedId = useViewer.getState().selection.selectedIds[0]
      if (selectedId) {
        emitter.emit('camera-controls:view', { nodeId: selectedId as AnyNodeId })
        setMessages((current) => [
          ...current,
          { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
          { id: `${Date.now()}-assistant`, role: 'assistant', text: `Focused camera on node "${selectedId}".` },
        ])
      } else {
        setMessages((current) => [
          ...current,
          { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
          { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Select an object in the scene first to focus on it.' },
        ])
      }
      setInput('')
      return
    }

    if (asksSnapshot) {
      const canvas = document.querySelector('canvas')
      const snapshotUrl = canvas instanceof HTMLCanvasElement ? canvas.toDataURL('image/png') : undefined
      await executeAssistantPlan([{ type: 'take_screenshot' }], { reviewConfirmed: true })
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: 'Captured high-resolution viewport screenshot and saved to downloads.',
          imageUrl: snapshotUrl,
        },
      ])
      setInput('')
      return
    }

    if (/\b(toggle grid|show grid|hide grid|mostrar cuadr[ií]cula|ocultar cuadr[ií]cula)\b/i.test(lower)) {
      const nextGrid = !useViewer.getState().showGrid
      useViewer.getState().setShowGrid(nextGrid)
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: nextGrid ? '3D grid enabled.' : '3D grid hidden.' },
      ])
      setInput('')
      return
    }

    if (/\b(toggle scans|scans on|scans off)\b/i.test(lower)) {
      const nextScans = !useViewer.getState().showScans
      useViewer.getState().setShowScans(nextScans)
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: nextScans ? 'Scans overlay enabled.' : 'Scans overlay hidden.' },
      ])
      setInput('')
      return
    }

    if (/\b(dark theme|light theme|tema oscuro|tema claro)\b/i.test(lower)) {
      const isDark = /\b(dark|oscuro)\b/i.test(lower)
      useViewer.getState().setTheme(isDark ? 'dark' : 'light')
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: `Theme switched to ${isDark ? 'Dark' : 'Light'}.` },
      ])
      setInput('')
      return
    }

    // 3. Direct CAD commands
    if (/\b(workplane|switch plane|plano de trabajo)\b/i.test(lower)) {
      const planeMatch = lower.match(/\b(xy|xz|yz|level)\b/)
      if (planeMatch) {
        const wp = planeMatch[1]!.toLowerCase() as 'xy' | 'xz' | 'yz' | 'level'
        await executeAssistantPlan([{ type: 'set_cad_workplane', workplane: wp }], { reviewConfirmed: true })
        setMessages((current) => [
          ...current,
          { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
          { id: `${Date.now()}-assistant`, role: 'assistant', text: `Switched CAD workplane to ${wp.toUpperCase()}.` },
        ])
        setInput('')
        return
      }
    }

    if (/\b(close sketch|cerrar boceto)\b/i.test(lower)) {
      await executeAssistantPlan([{ type: 'close_cad_sketch' }], { reviewConfirmed: true })
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Closed active CAD sketch.' },
      ])
      setInput('')
      return
    }

    if (/\b(new sketch|create sketch|nuevo boceto)\b/i.test(lower)) {
      await executeAssistantPlan([{ type: 'create_default_cad_sketch', position: [0, 0, 0] }], { reviewConfirmed: true })
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: 'Created new CAD sketch on active workplane.' },
      ])
      setInput('')
      return
    }

    const macPromptMatch = lower.match(/(?:generate mac part|mac part|\/mac)\s+(.+)/i)
    if (macPromptMatch) {
      const macPartPrompt = macPromptMatch[1]!.trim()
      setStatus('executing')
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: `Generating Multi-Agent-CAD solid part: "${macPartPrompt}"...` },
      ])
      try {
        const result = await generateMacPartAction(macPartPrompt)
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            text: `Successfully generated and imported MAC solid body (${result.bodyIds[0] ?? 'imported'}).`,
          },
        ])
        setStatus('executed')
      } catch (err) {
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            text: `MAC generation failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ])
        setStatus('idle')
      }
      setInput('')
      return
    }

    // 4. Direct Scene Observation & Measurement queries
    if (
      /\b(longest wall|pared m[aá]s larga)\b/i.test(lower) ||
      /\b(total (floor )?area|[aá]rea total)\b/i.test(lower)
    ) {
      const nodes = useScene.getState().nodes
      let maxWallLen = 0
      let maxWallName = ''
      let totalFloorArea = 0
      let zoneCount = 0
      let totalNodes = 0

      for (const node of Object.values(nodes)) {
        if (!node) continue
        totalNodes++
        if (node.type === 'wall') {
          const len = Math.hypot(node.end[0] - node.start[0], node.end[1] - node.start[1])
          if (len > maxWallLen) {
            maxWallLen = len
            maxWallName = node.name || node.id
          }
        } else if (node.type === 'zone' || node.type === 'slab') {
          const poly = (node as any).polygon ?? []
          if (poly.length >= 3) {
            totalFloorArea += calculatePolygonArea(poly)
            zoneCount++
          }
        }
      }

      const asksWall = /\b(longest wall|pared m[aá]s larga)\b/i.test(lower)
      const asksArea = /\b(total (floor )?area|[aá]rea total)\b/i.test(lower)

      let answer = ''
      if (asksWall && asksArea) {
        answer = maxWallLen > 0
          ? `The longest wall is **${maxWallName}** with a length of **${maxWallLen.toFixed(2)} m**. The total floor area is **${totalFloorArea.toFixed(2)} m²** across ${zoneCount} zone(s)/slab(s) (total ${totalNodes} nodes in scene).`
          : `The total floor area is **${totalFloorArea.toFixed(2)} m²** across ${zoneCount} zone(s)/slab(s) (total ${totalNodes} nodes in scene). No walls are currently placed.`
      } else if (asksWall) {
        answer = maxWallLen > 0
          ? `The longest wall in the scene is **${maxWallName}** measuring **${maxWallLen.toFixed(2)} m**.`
          : 'There are no walls in the scene yet. Tell me what building you would like to construct!'
      } else {
        answer = `The total floor area is **${totalFloorArea.toFixed(2)} m²** across ${zoneCount} zone(s)/slab(s).`
      }

      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: answer },
      ])
      setInput('')
      return
    }

    const promptImage =
      imageOverride
        ? imageOverride
        : attachedImage
          ? {
            dataUrl: attachedImage.dataUrl,
            kind: attachedImage.kind,
            source: attachedImage.source,
            filename: attachedImage.filename,
            mimeType: attachedImage.mimeType,
            viewport: attachedImage.viewport,
            analysis: attachedImage.analysis,
          }
          : null
    const promptComplexity = classifyRequestComplexity(prompt, {
      assistantSession: assistantSessionMemory,
    })

    stopContinuationRef.current = true
    stopTaskPlanRef.current = true
    continuationRunIdRef.current += 1
    const requestId = assistantRequestIdRef.current + 1
    assistantRequestIdRef.current = requestId
    setIsAutoContinuing(false)
    setInput('')
    setTaskPlan(null)
    setActiveStepIndex(null)
    setTaskPlanStatus('ready')
    setInlineGhostText('')
    setInlineCompletionText('')
    setDismissedInlineCompletion(null)
    setLastPrompt(prompt)
    setLastPromptImage(promptImage)
    setLastPromptImageDataUrl(promptImage?.dataUrl ?? null)
    setPanelError(null)
    setTurn(null)
    setExecutionEvents([])
    setExecutionResult(null)
    setAttachedImage(null)
    setAssistantSessionMemory((current) => ({
      ...current,
      lastError: null,
      preferredComplexity: promptComplexity === 'simple' ? 'simple' : 'detailed',
    }))
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', text: prompt, imageUrl: promptImage?.dataUrl ?? undefined },
    ])
    setStatus('planning')

    try {
      if (isObservationPrompt(prompt)) {
        setStatus('executing')
        const snapshot = createAssistantUndoSnapshot(prompt)
        setLastUndoSnapshot(snapshot)

        const agentResult = await runAgentTurn({
          prompt,
          chatMode,
          image: promptImage,
          workspaceContext: getAssistantWorkspaceContext(),
          reviewConfirmed: true,
          onTimelineEvent: (event) => {
            if (!isActiveAssistantRequest(requestId)) return
            const statusEvent: AssistantExecutionStatus = {
              index: event.round,
              action: { type: 'select_nodes', nodeIds: [] } as AssistantAction,
              status:
                event.status === 'running'
                  ? 'started'
                  : event.status === 'completed'
                    ? 'completed'
                    : 'failed',
              message: `[Round ${event.round}] ${event.toolName}: ${event.observation || 'running...'}`,
            }
            setExecutionEvents((current) => [...current, statusEvent].slice(-8))
          },
        })

        if (!isActiveAssistantRequest(requestId)) return
        const nextTurn = agentResult.turn
        setTurn(nextTurn)
        setMessages((current) => [
          ...current,
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            text: nextTurn.reply,
          },
        ])
        setAssistantSessionMemory((current) =>
          rememberConversationTurn(current, prompt, nextTurn.reply),
        )
        setStatus(nextTurn.mode === 'clarify' ? 'clarify' : 'executed')
        return
      }

      const nextTurn = await requestAssistantTurn({
        prompt,
        image: promptImage,
        complexity: promptComplexity,
      })
      if (!isActiveAssistantRequest(requestId)) return
      const nextTurnNeedsManualReview = requiresManualReview(nextTurn, executionPolicy)
      setTurn(nextTurn)
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text:
            nextTurn.mode === 'plan' && !nextTurnNeedsManualReview
              ? summarizeAssistantTurn(nextTurn)
              : nextTurn.reply,
        },
      ])
      setAssistantSessionMemory((current) =>
      ({
        ...rememberConversationTurn(current, prompt, nextTurn.reply),
        codexThreadId: nextTurn.providerMeta?.codexThreadId ?? current.codexThreadId,
      }),
      )

      const nextTaskPlan = parseTaskPlanFromTurn(nextTurn, prompt)
      if (nextTaskPlan) {
        setTaskPlan(nextTaskPlan)
        setActiveStepIndex(getTaskPlanProgress(nextTaskPlan).activeStep)
        setTaskPlanStatus('ready')
        setStatus('task-plan')
        return
      }

      if (nextTurn.mode === 'clarify') {
        setStatus('clarify')
        return
      }

      if (nextTurn.actions.length > 0) {
        if (requiresManualReview(nextTurn, executionPolicy)) {
          setStatus('review')
          return
        }
        await executeTurnSequence({
          initialTurn: nextTurn,
          prompt,
          image: promptImage,
          reviewConfirmed: getTurnReviewState(nextTurn).requiresReview,
          requestId,
        })
        return
      }

      setStatus('idle')
    } catch (error) {
      if (!isActiveAssistantRequest(requestId)) return
      const rawError = error instanceof Error ? error.message : 'Assistant planning failed.'
      const errorMessage =
        rawError.length > 300 || /Input validation failed/i.test(rawError)
          ? 'The AI provider rejected the request. This usually means the attached image or prompt format is not supported by the current model. Try sending the prompt without an image.'
          : rawError
      setAssistantSessionMemory((current) =>
        rememberFailedPrompt(
          {
            ...current,
            lastError: errorMessage,
          },
          prompt,
        ),
      )
      setPanelError(errorMessage)
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-assistant-error`, role: 'assistant', text: errorMessage },
      ])
      showCommandToast(errorMessage)
      setStatus('error')
    }
  }

  const handleSend = async () => submitPrompt(input)

  const editLatestSketch = () => {
    const sketchId = executionResult?.sketchIds[0]
    if (!sketchId) {
      showCommandToast('No CAD sketch is available to edit.')
      return
    }

    useEditor.getState().setPhase('cad')
    useEditor.getState().setMode('build')
    useEditor.getState().setTool('cad-sketch')
    setSelection({ selectedIds: [sketchId], zoneId: null })
    setActiveSketchId(sketchId)
  }

  if (collapsed) {
    return (
      <button
        className={`pointer-events-auto fixed z-[130] rounded-full border border-white/10 bg-neutral-950/88 px-4 py-3 text-sm text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${panelPosition ? '' : 'right-4 bottom-4'
          }`}
        data-testid="assistant-toggle"
        onClick={() => setCollapsed(false)}
        ref={assignFloatingRef}
        style={floatingPositionStyle}
        type="button"
      >
        AI Assistant
      </button>
    )
  }

  return (
    <div
      className={`pointer-events-auto fixed z-[130] flex max-h-[calc(100dvh-120px)] w-[380px] flex-col gap-3 overflow-hidden rounded-[22px] border border-white/8 bg-neutral-950/88 p-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${panelPosition ? '' : 'right-4 bottom-4'
        }`}
      data-testid="assistant-panel"
      ref={assignFloatingRef}
      style={floatingPositionStyle}
    >
      <div
        aria-label="Drag assistant"
        className={`flex items-center justify-center pb-1 text-white/40 transition ${isDraggingPanel ? 'cursor-grabbing' : 'cursor-grab'
          } touch-none select-none`}
        data-testid="assistant-drag-handle"
        onPointerDown={handlePanelDragStart}
        role="button"
        tabIndex={0}
        title="Drag to move assistant"
      >
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">Drag</span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold text-sm tracking-tight flex-wrap">
            <span className="text-cyan-300">AI</span>
            <span>Assistant</span>
            {/* Live Model Badge / Switcher Button */}
            <button
              onClick={() => {
                setIsModelMenuOpen((v) => !v)
                if (!isModelMenuOpen) void loadAvailableModels()
              }}
              className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200 hover:bg-cyan-400/20 transition-colors"
              title="Click to change AI Model (OpenRouter 445+ models)"
              type="button"
            >
              <span className="truncate max-w-[130px]">
                {activeModel === 'openrouter/free' ? '⭐ Free Router' : activeModel.split('/').pop()}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
          <div className="mt-1 text-[11px] text-white/55">
            {phase} · {levelId ?? 'no level'} · {selectedSummary}
          </div>
          {tool && (
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/40">{tool}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${
              executionPolicy === 'autopilot'
                ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                : 'border-white/10 bg-white/5 text-white/75'
            }`}
            data-testid="assistant-policy-toggle"
            onClick={() =>
              setExecutionPolicy((current) => (current === 'autopilot' ? 'review' : 'autopilot'))
            }
            title="Toggle between auto-executing non-destructive plans and manual review."
            type="button"
          >
            {executionPolicy}
          </button>
          <button
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="assistant-new-chat"
            disabled={status === 'planning' || status === 'executing'}
            onClick={() => resetAssistantSession({ preserveChatMode: true })}
            title="Start a fresh assistant chat without changing the current scene."
            type="button"
          >
            New Chat
          </button>
          <button
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80"
            data-testid="assistant-dock-left"
            onClick={handleDockLeft}
            type="button"
          >
            Dock left
          </button>
          <button
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80"
            data-testid="assistant-hide"
            onClick={() => setCollapsed(true)}
            type="button"
          >
            Hide
          </button>
        </div>
      </div>

      {/* Model Selection Dropdown inside Assistant Panel */}
      {isModelMenuOpen && (
        <div className="rounded-2xl border border-cyan-500/30 bg-neutral-950/95 p-3 shadow-2xl space-y-2 backdrop-blur-md">
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <span>Select Model</span>
              <span className="text-[10px] font-normal text-white/50">
                ({availableModels.length || '445+'} OpenRouter models)
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                className="text-[10px] text-cyan-400 hover:text-cyan-300"
                onClick={() => void loadAvailableModels(true)}
                disabled={loadingModels}
                type="button"
              >
                {loadingModels ? 'Loading...' : 'Refresh'}
              </button>
              <button
                className="text-[11px] text-white/50 hover:text-white"
                onClick={() => setIsModelMenuOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'openrouter/free', label: '⭐ Free Router' },
              { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
              { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
              { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5' },
              { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7' },
              { id: 'openai/gpt-4o', label: 'GPT-4o' },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => void handleSelectModel(preset.id)}
                className={`rounded px-1.5 py-0.5 text-[10px] border transition-colors ${
                  activeModel === preset.id
                    ? 'border-cyan-400 bg-cyan-400/20 text-cyan-100 font-medium'
                    : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search 445+ models (e.g. free, llama, deepseek, claude)..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white placeholder:text-white/40 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 text-[10px]">
            <button
              onClick={() => setModelFilter('free')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                modelFilter === 'free'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-white/50 hover:text-white'
              }`}
              type="button"
            >
              ⭐ Free Only ({freeModelCount})
            </button>
            <button
              onClick={() => setModelFilter('recommended')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                modelFilter === 'recommended'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-white/50 hover:text-white'
              }`}
              type="button"
            >
              ⚡ Recommended
            </button>
            <button
              onClick={() => setModelFilter('all')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                modelFilter === 'all'
                  ? 'bg-white/15 text-white border border-white/25'
                  : 'text-white/50 hover:text-white'
              }`}
              type="button"
            >
              All ({availableModels.length})
            </button>
          </div>

          {/* Model list */}
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
            {loadingModels ? (
              <div className="py-3 text-center text-[11px] text-white/50">Loading real models...</div>
            ) : filteredChatModels.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-white/50">No models found</div>
            ) : (
              filteredChatModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void handleSelectModel(m.id)}
                  className={`flex w-full items-center justify-between gap-1.5 rounded-lg p-1.5 text-left text-[11px] transition ${
                    activeModel === m.id
                      ? 'bg-cyan-400/20 text-cyan-100 border border-cyan-400/30'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-medium truncate">{m.name}</span>
                      {m.isFree && (
                        <span className="rounded bg-emerald-500/20 px-1 py-0.1 text-[8px] font-bold text-emerald-300 border border-emerald-500/30">
                          FREE
                        </span>
                      )}
                      {m.contextLength && (
                        <span className="text-[9px] text-white/40">
                          {Math.round(m.contextLength / 1000)}k
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[9px] text-white/40 truncate">{m.id}</div>
                  </div>
                  {activeModel === m.id && (
                    <span className="text-cyan-300 text-xs">✓</span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Collapsible API Key & Custom Configuration */}
          <div className="border-t border-white/10 pt-1.5">
            <button
              onClick={() => setShowApiSettings((v) => !v)}
              className="flex w-full items-center justify-between py-1 text-[10px] text-white/50 hover:text-white transition"
              type="button"
            >
              <span className="flex items-center gap-1">
                <span>⚙️</span>
                <span>Custom API Key & Endpoint</span>
              </span>
              <span>{showApiSettings ? '▲' : '▼'}</span>
            </button>

            {showApiSettings && (
              <div className="mt-1 space-y-1.5 rounded-xl bg-black/40 p-2 border border-white/10">
                <div>
                  <label className="block text-[9px] text-white/50 mb-0.5">API Key (OpenRouter / OpenAI)</label>
                  <input
                    type="password"
                    placeholder="sk-or-v1-..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white placeholder:text-white/30 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-white/50 mb-0.5">Base URL</label>
                  <input
                    type="text"
                    placeholder="https://openrouter.ai/api/v1"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white placeholder:text-white/30 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                {apiConfigMessage && (
                  <div className="text-[9px] text-cyan-300">{apiConfigMessage}</div>
                )}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => void handleSaveApiSettings()}
                    disabled={isSavingApiConfig}
                    className="rounded-lg bg-cyan-500/20 border border-cyan-400/40 px-2.5 py-0.5 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/30 transition"
                    type="button"
                  >
                    {isSavingApiConfig ? 'Saving...' : 'Save & Apply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {([
          { id: 'ask', label: 'Ask' },
          { id: 'create', label: 'Create' },
          { id: 'refine', label: 'Refine' },
        ] as const).map((option) => (
          <button
            key={option.id}
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition ${chatMode === option.id
                ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            data-testid={`assistant-chat-mode-${option.id}`}
            disabled={composerLocked}
            onClick={() => setChatMode(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {(messages.length > 0 || pendingAssistantMessage) && (
        <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.045] p-3">
          {messages.map((message, idx) => (
            <div
              className={`rounded-2xl px-3 py-2 text-[12px] leading-5 flex flex-col gap-2 ${message.role === 'user' ? 'self-end bg-cyan-300 text-black' : 'bg-black/25 text-white/85'
                }`}
              key={message.id}
            >
              {message.imageUrl && (
                <img
                  src={message.imageUrl}
                  alt="Attached"
                  className="max-h-32 rounded-lg object-contain w-full bg-black/10"
                />
              )}
              {message.text}
              {message.role === 'assistant' && idx === messages.length - 1 && lastUndoSnapshot && (
                <div className="pt-1 flex justify-end border-t border-white/5 mt-1">
                  <button
                    onClick={undoLastAssistantTurn}
                    className="text-[10px] text-cyan-300/80 hover:text-cyan-200 underline decoration-dotted transition-colors"
                    type="button"
                  >
                    ↩ Undo this action
                  </button>
                </div>
              )}
            </div>
          ))}
          {pendingAssistantMessage ? (
            <div
              className="rounded-2xl bg-black/25 px-3 py-2 text-[12px] leading-5 text-white/70"
              data-testid="assistant-pending"
            >
              {pendingAssistantMessage}
            </div>
          ) : null}
        </div>
      )}

      <div className="relative">
        {attachedImage && (
          <div className="absolute bottom-full mb-2 left-0 z-10 flex min-w-[280px] items-center gap-2 rounded-xl border border-white/10 bg-neutral-900 p-2 shadow-xl">
            <img src={attachedImage.dataUrl} alt="Preview" className="h-10 w-10 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <div className="max-w-[150px] truncate text-[11px] text-white/70">
                {attachedImage.file.name}
              </div>
              <label className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/45">
                Intent
                <select
                  className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white outline-none"
                  data-testid="assistant-image-intent"
                  onChange={(event) => {
                    const nextKind = event.target.value as AssistantImageKind
                    setAttachedImage((current) => (current ? { ...current, kind: nextKind } : current))
                  }}
                  value={attachedImage.kind}
                >
                  <option value="auto">Auto</option>
                  <option value="workspace">Workspace</option>
                  <option value="reference">Reference</option>
                  <option value="floorplan">Floorplan</option>
                  <option value="sketch">Sketch</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="rounded-full bg-white/10 p-1 hover:bg-white/20"
              onClick={() => setAttachedImage(null)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="relative rounded-2xl border border-white/10 bg-white/[0.045] transition focus-within:border-cyan-400/50 focus-within:bg-white/[0.08]">
          {inlineGhostText ? (
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-3 text-sm leading-5"
              data-testid="assistant-inline-autocomplete"
            >
              <span className="invisible">{input}</span>
              <span className="text-white/25">{inlineGhostText}</span>
            </div>
          ) : null}
          <textarea
            className="relative z-10 w-full min-h-[88px] rounded-2xl bg-transparent px-3 py-3 text-sm text-white outline-none"
            data-gramm="false"
            data-testid="assistant-input"
            disabled={composerLocked}
            onChange={(event) => {
              setInput(event.target.value)
              setDismissedInlineCompletion(null)
            }}
            onKeyDown={handleComposerKeyDown}
            onPaste={(event) => {
              const file = event.clipboardData.files?.[0]
              if (file?.type.startsWith('image/')) {
                event.preventDefault()
                void attachImageFile(file, 'paste')
              }
            }}
            placeholder={composerPlaceholder}
            ref={textareaRef}
            spellCheck={false}
            suppressHydrationWarning
            value={input}
          />
        </div>
      </div>


      {/* Build suggestions removed as per user request to reduce clutter */}

      {taskPlan ? (
        <AssistantTaskPlanCard
          activeStepIndex={activeStepIndex}
          onExecute={() => void executeCurrentTaskPlan()}
          onRetryStep={(stepIndex) => void retryTaskPlanStep(stepIndex)}
          onStopAfterCurrent={() => {
            stopTaskPlanRef.current = true
          }}
          taskPlan={taskPlan}
          taskPlanStatus={taskPlanStatus}
        />
      ) : null}

      {turn?.mode === 'clarify' && status === 'clarify' ? (
        <div
          className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3"
          data-testid="assistant-clarify-card"
        >
          <div className="font-medium text-[12px] text-amber-100">Clarification</div>
          {turn.targetingExplanation ? (
            <div className="mt-2 text-[12px] text-amber-50/90">{turn.targetingExplanation}</div>
          ) : null}
          {turn.ambiguities.length > 0 ? (
            <div className="mt-2 space-y-1 text-[12px] text-amber-50/80">
              {turn.ambiguities.map((ambiguity, index) => (
                <div key={`${ambiguity}-${index}`}>{ambiguity}</div>
              ))}
            </div>
          ) : null}
          {(turn.targetCandidates?.length ?? 0) > 0 ? (
            <div className="mt-3 space-y-1">
              <div className="text-[10px] uppercase tracking-[0.16em] text-amber-50/55">Candidate Targets</div>
              {turn.targetCandidates?.map((candidate) => (
                <div
                  className="rounded-xl bg-black/20 px-3 py-2 text-[12px] text-amber-50/85"
                  key={candidate.id}
                >
                  {(candidate.name ?? candidate.id)} · {candidate.type}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}



      {turn && shouldShowReviewCard ? (
        <div
          className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"
          data-testid="assistant-review-card"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-[12px] text-white/85">Review Required</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/45">
              {turn.actions.length} actions
            </div>
          </div>
          {turn.targetingExplanation ? (
            <div className="mt-2 text-[12px] text-cyan-100/85">{turn.targetingExplanation}</div>
          ) : null}
          <div className="mt-2 text-[11px] text-white/55">{summarizeReviewScope(turn.actions)}</div>
          {(turn.targetCandidates?.length ?? 0) > 0 ? (
            <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[12px] text-white/72">
              {turn.targetCandidates?.map((candidate) => (
                <div className="rounded-xl bg-black/20 px-3 py-2" key={candidate.id}>
                  {(candidate.name ?? candidate.id)} · {candidate.type}
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[12px] text-white/72">
            {turn.actions.map((action, index) => (
              <div className="rounded-xl bg-black/20 px-3 py-2" key={`${action.type}-${index}`}>
                {formatAction(action)}
              </div>
            ))}
          </div>
          <button
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-cyan-300 px-3 py-2 font-medium text-[12px] text-black transition hover:bg-cyan-200"
            data-testid="assistant-apply-plan"
            onClick={() => {
              const requestId = assistantRequestIdRef.current + 1
              assistantRequestIdRef.current = requestId
              void executeTurnSequence({
                initialTurn: turn,
                prompt: lastPrompt ?? turn.reply,
                image: lastPromptImage,
                reviewConfirmed: true,
                requestId,
              })
            }}
            type="button"
          >
            Apply Plan
          </button>
        </div>
      ) : null}

      {/* Compact post-execution result bar — no verbose event log */}
      {(status === 'executed' || panelError) && (
        <div
          className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"
          data-testid="assistant-execution-status"
        >
          {status === 'executed' && !panelError && (
            <div className="flex items-center gap-2 text-[12px] text-emerald-200">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Done{turn?.assumptions.length ? ` — ${turn.assumptions[0]}` : ''}
            </div>
          )}
          {panelError && (
            <div className="text-[12px] text-rose-200">{panelError}</div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {isAutoContinuing ? (
              <button
                className="inline-flex items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 font-medium text-[12px] text-amber-100 transition hover:bg-amber-300/20"
                onClick={stopAutoContinuation}
                type="button"
              >
                Stop Build
              </button>
            ) : null}
            {lastPrompt && (
              <button
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-medium text-[12px] text-white/80 transition hover:bg-white/10"
                disabled={status === 'planning' || status === 'executing'}
                onClick={() => void submitPrompt(lastPrompt, lastPromptImage)}
                type="button"
              >
                Retry
              </button>
            )}
            {lastUndoSnapshot ? (
              <button
                className="inline-flex items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 font-medium text-[12px] text-amber-100 transition hover:bg-amber-300/20"
                data-testid="assistant-undo-last-turn"
                disabled={status === 'planning' || status === 'executing'}
                onClick={undoLastAssistantTurn}
                type="button"
              >
                Undo
              </button>
            ) : null}
            {executionResult?.sketchIds.length ? (
              <button
                className="inline-flex items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 font-medium text-[12px] text-cyan-100 transition hover:bg-cyan-300/20"
                onClick={editLatestSketch}
                type="button"
              >
                Edit Sketch
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <label
          className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-3 transition hover:bg-white/10 opacity-70 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
          title="Attach Image"
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={composerLocked}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void attachImageFile(file, 'upload')
              }
              // reset value so the same file can be selected again
              e.target.value = ''
            }}
          />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </label>
        <button
          className="inline-flex flex-1 items-center justify-center rounded-2xl bg-cyan-300 px-3 py-3 font-medium text-[13px] text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="assistant-send"
          disabled={composerLocked}
          onClick={() => void handleSend()}
          type="button"
        >
          {getAssistantSendLabel(status)}
        </button>
      </div>
    </div>
  )
}
