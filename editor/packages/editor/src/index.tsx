export type { EditorProps } from './components/editor'
export { default as Editor } from './components/editor'
export { useCommandPalette } from './components/ui/command-palette'
export { SceneLoader } from './components/ui/scene-loader'
export type {
  ProjectVisibility,
  SettingsPanelProps,
} from './components/ui/sidebar/panels/settings-panel'
export type { SitePanelProps } from './components/ui/sidebar/panels/site-panel'
export type { PresetsAdapter, PresetsTab } from './contexts/presets-context'
export { PresetsProvider } from './contexts/presets-context'
export type { SaveStatus } from './hooks/use-auto-save'
export {
  type AssistantAction,
  type AssistantContinuation,
  type AssistantCadBoxFace,
  AssistantActionSchema,
  AssistantContinuationSchema,
  type AssistantActionSequenceIssue,
  type AssistantActionSequenceIssueCode,
  type AssistantActionSequenceValidationResult,
  buildEarAttachmentSpecs,
  buildFaceExtrusionSpec,
  buildShellPanelSpecs,
  executeAssistantPlan,
  getBoxBodySummary,
  getAssistantWorkspaceContext,
  summarizeAssistantNode,
  validateAssistantActionSequence,
  type AssistantExecutionOptions,
  type AssistantExecutionResult,
  type AssistantExecutionRuntime,
  type AssistantExecutionStatus,
  type AssistantNodeSummary,
  type AssistantPlanValidationResult,
  type AssistantTurnResult,
  AssistantTurnResultSchema,
  type BoxBodySummary,
  type CadAttachmentBodySpec,
  type AssistantWorkspaceContext,
  validateAssistantPlan,
  executeAgentTool,
  calculatePolygonArea,
  listCreationRecipes,
} from './lib/assistant'
export type { SceneGraph } from './lib/scene'
export { applySceneGraphToEditor } from './lib/scene'
export { createMacJob, fetchMacHealth, fetchMacJob, waitForMacJob } from './lib/mac/client'
export { generateMacPart, type GenerateMacPartResult } from './lib/mac/generate-part'
export { default as useCad } from './store/use-cad'
export { default as useEditor } from './store/use-editor'
export { default as useMac } from './store/use-mac'
export { useUploadStore } from './store/use-upload'
