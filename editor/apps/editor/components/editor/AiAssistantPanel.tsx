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
  createAssistantRuntime,
  createPistolaAgentApi,
  executeAssistantPlan,
  getAssistantWorkspaceContext,
  summarizeAssistantNode,
  useCad,
  useEditor,
  validateAssistantPlan,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { assistantToolPhaseMap, assistantToolValues } from '../../../../packages/editor/src/lib/assistant/tool-surface'
import {
  boatDetailActions,
  findMatchingRecipe,
} from '../../../../packages/editor/src/lib/assistant/recipes/creation-recipes'
import { shouldRequestAssistantContinuation } from '../../lib/assistant-continuation'
import {
  getInlineAutocompletion,
  resolveAssistantComposerKeyAction,
} from '../../lib/assistant-composer-suggestions'
import {
  buildAssistantSessionId,
  type AssistantChatMode,
} from '../../lib/assistant-chat-contract'
import {
  buildAssistantViewportMetadata,
  createAssistantImageAttachment,
} from '../../lib/assistant-image-client'
import type { AssistantImageAttachment } from '../../lib/assistant-image-contract'
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
import { parseAssistantAgentCommand } from '../../lib/assistant-agent-commands'
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
import { describeModelName } from '../../lib/assistant-model-display'
import { pistolaFetch } from '../../lib/pistola-fetch'
import { useAiSettings } from './assistant/ai-settings-store'
import { ClarifyPrompt, ReviewPrompt, type ReviewActionKind } from './assistant/ApprovalPrompt'
import { Composer, type ComposerSendState } from './assistant/Composer'
import { ExecutionResult } from './assistant/ExecutionResult'
import { AssistantMarkIcon } from './assistant/icons'
import { ModelPicker } from './assistant/ModelPicker'
import { PanelHeader } from './assistant/PanelHeader'
import { PlanChecklist, type TaskPlanStatus } from './assistant/PlanChecklist'
import { ProvidersSheet } from './assistant/ProvidersSheet'
import { StatusLine, type ExecutionPolicy } from './assistant/StatusLine'
import { AssistantMessage, EmptyState, PendingLine, Transcript, UserMessage } from './assistant/Transcript'
import { useFloatingPanel } from './assistant/use-floating-panel'

const isObservationPrompt = (text: string) => {
  const norm = text.toLowerCase()
  return (
    /\b(how (big|many|wide|long|high|tall)|measure|distance|inspect|longest wall|area|perimeter|floor space)\b/i.test(norm) ||
    /\b(cuanto mide|cuántos|cuantos|mide|distancia|área|dimensiones|espacio libre)\b/i.test(norm) ||
    /\b(longest wall|pared mas larga|pared más larga)\b/i.test(norm)
  )
}

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

type PanelAttachedImage = AssistantImageAttachment & { file: File }
type PanelView = 'chat' | 'providers'

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

const classifyReviewAction = (action: AssistantAction): ReviewActionKind => {
  if (action.type.startsWith('delete_') || action.type === 'clear_level_contents') return 'delete'

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
    return 'create'
  }

  return 'edit'
}

const summarizeReviewScope = (actions: AssistantAction[]) => {
  let createCount = 0
  let editCount = 0
  let deleteCount = 0

  for (const action of actions) {
    const kind = classifyReviewAction(action)
    if (kind === 'delete') deleteCount += 1
    else if (kind === 'create') createCount += 1
    else editCount += 1
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

  const floatingPanel = useFloatingPanel()
  const { collapsed, setCollapsed } = floatingPanel
  const activeModel = useAiSettings((state) => state.activeModel)
  const activeProvider = useAiSettings((state) => state.activeProvider)
  const aiCatalog = useAiSettings((state) => state.catalog)
  const loadAiConfig = useAiSettings((state) => state.loadConfig)
  const loadAiCatalog = useAiSettings((state) => state.loadCatalog)
  const selectAiModel = useAiSettings((state) => state.selectModel)

  const [panelView, setPanelView] = useState<PanelView>('chat')
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
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
  const [isAutoContinuing, setIsAutoContinuing] = useState(false)
  const [taskPlan, setTaskPlan] = useState<TaskPlan | null>(null)
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null)
  const [taskPlanStatus, setTaskPlanStatus] = useState<TaskPlanStatus>('ready')
  const [inlineGhostText, setInlineGhostText] = useState('')
  const [inlineCompletionText, setInlineCompletionText] = useState('')
  const [dismissedInlineCompletion, setDismissedInlineCompletion] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const continuationRunIdRef = useRef(0)
  const assistantRequestIdRef = useRef(0)
  const assistantRequestWorkspaceContextRef = useRef<ReturnType<typeof getAssistantWorkspaceContext> | null>(null)
  const stopContinuationRef = useRef(false)
  const stopTaskPlanRef = useRef(false)

  useEffect(() => {
    void loadAiConfig()
  }, [loadAiConfig])

  const closeModelMenu = useCallback(() => setIsModelMenuOpen(false), [])

  const openModelMenu = () => {
    setPanelView('chat')
    setIsModelMenuOpen(true)
  }

  const handleSelectModel = async (modelId: string) => {
    const result = await selectAiModel(modelId)
    showCommandToast(result.ok ? result.message : result.error)
    return result
  }

  const levelLabel = useMemo(() => {
    if (!levelId) return 'no level'
    const level = nodes[levelId as AnyNodeId]
    if (level?.type !== 'level') return levelId
    return level.name || `Level ${level.level}`
  }, [levelId, nodes])

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
      ? 'Ask about the workspace or the tools'
      : chatMode === 'refine'
        ? 'Describe the change to the selection or last result'
        : 'Describe a part, a room, or an edit'

  const turnNeedsManualReview = turn ? requiresManualReview(turn, executionPolicy) : false
  const shouldShowReviewCard =
    Boolean(turn?.actions.length) && turnNeedsManualReview && turn?.mode !== 'task-plan'

  const pendingAssistantMessage =
    status === 'planning'
      ? 'Planning'
      : status === 'executing'
        ? isAutoContinuing
          ? 'Continuing the build'
          : 'Applying changes'
        : null
  const composerLocked = isAssistantComposerLocked(status)

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
    setChatMode(nextSessionState.chatMode)
    localStorage.removeItem('pistola:aiAssistantSessionMemory')
    localStorage.removeItem('pistola:aiAssistantConversationHistory')
    if (options.showToast ?? true) {
      showCommandToast('Started a new assistant chat.')
    }
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

    // Composer suggestions are not rendered, so arrow keys and Tab keep their
    // normal textarea behaviour; only submission is resolved here.
    const keyAction = resolveAssistantComposerKeyAction({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      activeSuggestionIndex: 0,
      suggestionCount: 0,
    })

    if (keyAction.type === 'submit-prompt') {
      event.preventDefault()
      if (!composerLocked && input.trim()) void handleSend()
    }
  }

  const handleComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = event.clipboardData.files?.[0]
    if (file?.type.startsWith('image/')) {
      event.preventDefault()
      void attachImageFile(file, 'paste')
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
    ...createAssistantRuntime({ runCadPrompt }),
    executeCadBrief: executeCadBriefAction,
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

    try {
      const agentCommand = parseAssistantAgentCommand(trimmed)
      if (agentCommand) {
        const api =
          typeof window !== 'undefined' && 'pistola' in window && window.pistola
            ? window.pistola
            : createPistolaAgentApi()
        let payload: unknown
        if (agentCommand.kind === 'manual') payload = await api.manual()
        else if (agentCommand.kind === 'inspect') {
          payload = await api.inspect(
            agentCommand.query as { levelId?: string; type?: string; nameQuery?: string; limit?: number },
          )
        }
        else if (agentCommand.kind === 'validate') payload = await api.validate(agentCommand.actions)
        else if (agentCommand.kind === 'run') payload = await api.run(agentCommand.actions)
        else if (agentCommand.kind === 'recipe') payload = await api.runRecipe(agentCommand.name, agentCommand.params)
        else payload = await api.run([{ type: 'build_cad_solid', spec: agentCommand.spec }])

        setMessages((current) => [
          ...current,
          { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
          {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            text: JSON.stringify(payload, null, 2),
          },
        ])
        setInput('')
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent command failed.'
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        { id: `${Date.now()}-assistant`, role: 'assistant', text: message },
      ])
      setInput('')
      return
    }

    // 1. Model Switching commands (supports /model <name> and natural language "Switch model to Claude 3.7 Sonnet")
    const modelSwitchMatch =
      trimmed.match(/^\/model\s*(.*)$/i) ||
      lower.match(/^(?:switch|change|set|use|cambiar|cambia|usar)\s+(?:the\s+)?(?:ai\s+)?model\s+(?:to\s+)?(.+?)[.!]?$/i) ||
      lower.match(/^(?:switch|change|set)\s+to\s+(?:model\s+)?(.+?)[.!]?$/i)

    if (modelSwitchMatch) {
      const rawArg = modelSwitchMatch[1]?.trim().replace(/[.!]^/, '').trim() || ''
      const arg = rawArg.toLowerCase()
      if (!arg || arg === 'list') {
        openModelMenu()
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
        await loadAiCatalog()
        const found = useAiSettings.getState().catalog.find(
          (m) =>
            m.id.toLowerCase() === arg ||
            m.name.toLowerCase().includes(arg) ||
            m.id.toLowerCase().includes(arg),
        )
        if (found) targetModel = found.id
      }

      const switchResult = await handleSelectModel(targetModel)
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-user`, role: 'user', text: rawPrompt },
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: switchResult.ok
            ? `Switched the model to \`${targetModel}\`. The Assistant, CAD and MAC now use it.`
            : `Could not switch to \`${targetModel}\`: ${switchResult.error}`,
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

  const isBusy = status === 'planning' || status === 'executing'
  const canStopRunningWork = isAutoContinuing || taskPlanStatus === 'executing'
  const sendState: ComposerSendState = canStopRunningWork ? 'stop' : isBusy ? 'busy' : 'send'
  const lastMessage = messages[messages.length - 1]
  const showExecutionResult = status === 'executed' || Boolean(panelError)
  const showClarifyPrompt = turn?.mode === 'clarify' && status === 'clarify'
  const hasConversation =
    messages.length > 0 ||
    Boolean(pendingAssistantMessage) ||
    Boolean(taskPlan) ||
    Boolean(turn) ||
    showExecutionResult
  const modelLabel = describeModelName(
    aiCatalog.find((model) => model.id === activeModel) ?? { id: activeModel },
  ).title
  const statusContext = [
    phase,
    levelLabel,
    selectedSummary === 'No selection' ? 'nothing selected' : selectedSummary,
    tool,
  ]
    .filter(Boolean)
    .join(' · ')
  const transcriptFollowKey = [
    messages.length,
    pendingAssistantMessage,
    status,
    taskPlan?.steps.map((step) => step.status).join(','),
    shouldShowReviewCard,
  ].join('|')

  const applyReviewedTurn = () => {
    if (!turn) return
    const requestId = assistantRequestIdRef.current + 1
    assistantRequestIdRef.current = requestId
    void executeTurnSequence({
      initialTurn: turn,
      prompt: lastPrompt ?? turn.reply,
      image: lastPromptImage,
      reviewConfirmed: true,
      requestId,
    })
  }

  const stopRunningWork = () => {
    if (isAutoContinuing) stopAutoContinuation()
    if (taskPlanStatus === 'executing') stopTaskPlanRef.current = true
    showCommandToast('Stopping after the current step.')
  }

  if (collapsed) {
    return (
      <div
        aria-label="Open assistant"
        className={`pointer-events-auto fixed z-[130] inline-flex h-10 touch-none select-none items-center gap-2 rounded-full border border-as-line bg-as-panel/95 pr-4 pl-2 font-medium text-[13px] text-as-text shadow-[0_2px_6px_rgba(0,0,0,0.12),0_16px_40px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-colors hover:bg-as-surface ${
          floatingPanel.isDragging ? 'cursor-grabbing' : 'cursor-grab'
        } ${floatingPanel.positionStyle ? '' : 'right-4 bottom-4'}`}
        data-testid="assistant-toggle"
        onClick={() => {
          if (floatingPanel.consumeDragClickSuppression()) return
          setCollapsed(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setCollapsed(false)
          }
        }}
        onPointerDown={(event) => floatingPanel.startDrag(event, { allowInteractive: true })}
        ref={floatingPanel.assignRef}
        role="button"
        style={floatingPanel.positionStyle}
        tabIndex={0}
        title="Drag to move · click to open"
      >
        <span className="pointer-events-none flex h-6 w-6 items-center justify-center rounded-full border border-as-line bg-as-surface text-as-accent">
          <AssistantMarkIcon size={13} />
        </span>
        Assistant
      </div>
    )
  }

  return (
    <section
      aria-label="Assistant"
      className={`pointer-events-auto fixed z-[130] flex max-h-[calc(100dvh-120px)] w-[380px] flex-col rounded-[14px] border border-as-line bg-as-panel/95 text-as-text shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_2px_6px_rgba(0,0,0,0.12),0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl ${
        floatingPanel.positionStyle ? '' : 'right-4 bottom-4'
      }`}
      data-testid="assistant-panel"
      ref={floatingPanel.assignRef}
      style={floatingPanel.positionStyle}
    >
      {panelView === 'providers' ? (
        <>
          <PanelHeader
            isDragging={floatingPanel.isDragging}
            onBack={() => setPanelView('chat')}
            onDragStart={floatingPanel.startDrag}
            onMinimize={() => setCollapsed(true)}
            title="Model providers"
          />
          <ProvidersSheet onBrowseModels={openModelMenu} />
        </>
      ) : (
        <>
          <PanelHeader
            isDragging={floatingPanel.isDragging}
            newChatDisabled={isBusy}
            onDockLeft={floatingPanel.dockLeft}
            onDragStart={floatingPanel.startDrag}
            onMinimize={() => setCollapsed(true)}
            onNewChat={() => resetAssistantSession({ preserveChatMode: true })}
          />

          {hasConversation ? (
            <Transcript followKey={transcriptFollowKey}>
              {messages.map((message, index) => {
                const isLast = index === messages.length - 1
                return message.role === 'user' ? (
                  <UserMessage imageUrl={message.imageUrl} key={message.id} text={message.text} />
                ) : (
                  <AssistantMessage
                    imageUrl={message.imageUrl}
                    isLast={isLast}
                    key={message.id}
                    onUndo={isLast && lastUndoSnapshot && !showExecutionResult ? undoLastAssistantTurn : undefined}
                    text={message.text}
                  />
                )
              })}

              {pendingAssistantMessage ? <PendingLine text={pendingAssistantMessage} /> : null}

              {taskPlan ? (
                <PlanChecklist
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

              {showClarifyPrompt && turn ? (
                <ClarifyPrompt
                  ambiguities={turn.ambiguities}
                  candidates={turn.targetCandidates ?? []}
                  explanation={turn.targetingExplanation}
                />
              ) : null}

              {turn && shouldShowReviewCard ? (
                <ReviewPrompt
                  actions={turn.actions.map((action) => ({
                    label: formatAction(action),
                    kind: classifyReviewAction(action),
                  }))}
                  autopilotOn={executionPolicy === 'autopilot'}
                  candidates={turn.targetCandidates ?? []}
                  explanation={turn.targetingExplanation}
                  onApply={applyReviewedTurn}
                  onApplyAndAutopilot={() => {
                    setExecutionPolicy('autopilot')
                    applyReviewedTurn()
                  }}
                  onRevise={() => textareaRef.current?.focus()}
                  scopeSummary={summarizeReviewScope(turn.actions)}
                />
              ) : null}

              {showExecutionResult ? (
                <ExecutionResult
                  actionLabels={status === 'executed' && turn ? turn.actions.map(formatAction) : []}
                  busy={isBusy}
                  // The failure is usually also the last message; do not print it twice.
                  error={panelError && panelError !== lastMessage?.text ? panelError : null}
                  executed={status === 'executed'}
                  note={turn?.assumptions[0]}
                  onEditSketch={executionResult?.sketchIds.length ? editLatestSketch : undefined}
                  onRetry={lastPrompt ? () => void submitPrompt(lastPrompt, lastPromptImage) : undefined}
                  onStopBuild={isAutoContinuing ? stopAutoContinuation : undefined}
                  onUndo={lastUndoSnapshot ? undoLastAssistantTurn : undefined}
                />
              ) : null}
            </Transcript>
          ) : (
            <EmptyState />
          )}

          <Composer
            attachedImage={
              attachedImage
                ? { dataUrl: attachedImage.dataUrl, name: attachedImage.file.name, kind: attachedImage.kind }
                : null
            }
            chatMode={chatMode}
            ghostText={inlineGhostText}
            input={input}
            locked={composerLocked}
            modelLabel={modelLabel}
            modelMenuOpen={isModelMenuOpen}
            onAttachFile={(file) => void attachImageFile(file, 'upload')}
            onChatModeChange={setChatMode}
            onImageKindChange={(kind) =>
              setAttachedImage((current) => (current ? { ...current, kind } : current))
            }
            onInputChange={(value) => {
              setInput(value)
              setDismissedInlineCompletion(null)
            }}
            onKeyDown={handleComposerKeyDown}
            onPaste={handleComposerPaste}
            onRemoveImage={() => setAttachedImage(null)}
            onSend={() => void handleSend()}
            onStop={stopRunningWork}
            onToggleModelMenu={() => setIsModelMenuOpen((open) => !open)}
            placeholder={isBusy ? 'Working on it…' : composerPlaceholder}
            popover={
              isModelMenuOpen ? (
                <ModelPicker
                  onClose={closeModelMenu}
                  onOpenProviders={() => {
                    setIsModelMenuOpen(false)
                    setPanelView('providers')
                  }}
                  onSelected={showCommandToast}
                />
              ) : null
            }
            sendLabel={getAssistantSendLabel(status)}
            sendState={sendState}
            textareaRef={textareaRef}
          />

          <StatusLine
            context={statusContext}
            onTogglePolicy={() =>
              setExecutionPolicy((current) => (current === 'autopilot' ? 'review' : 'autopilot'))
            }
            policy={executionPolicy}
          />
        </>
      )}
    </section>
  )
}

