'use client'

import { initSpaceDetectionSync, initSpatialGridSync, useScene } from '@pascal-app/core'
import { InteractiveSystem, Viewer } from '@pascal-app/viewer'
import { type ReactNode, useEffect, useState } from 'react'
import { ViewerOverlay } from '../../components/viewer-overlay'
import { ViewerZoneSystem } from '../../components/viewer-zone-system'
import { type PresetsAdapter, PresetsProvider } from '../../contexts/presets-context'
import { type SaveStatus, useAutoSave } from '../../hooks/use-auto-save'
import { useKeyboard } from '../../hooks/use-keyboard'
import {
  applySceneGraphToEditor,
  loadPersistedScene,
  syncEditorSelectionFromCurrentScene,
  type SceneGraph,
} from '../../lib/scene'
import { initSFXBus } from '../../lib/sfx-bus'
import useEditor from '../../store/use-editor'
import { CeilingSystem } from '../systems/ceiling/ceiling-system'
import { CadBodyRuntimeSystem } from '../systems/cad/cad-body-runtime-system'
import { ZoneLabelEditorSystem } from '../systems/zone/zone-label-editor-system'
import { ZoneSystem } from '../systems/zone/zone-system'
import { ToolManager } from '../tools/tool-manager'
import { ActionMenu } from '../ui/action-menu'
import { ViewPad } from '../ui/action-menu/view-pad'
import { HelperManager } from '../ui/helpers/helper-manager'
import { PanelManager } from '../ui/panels/panel-manager'
import { ErrorBoundary } from '../ui/primitives/error-boundary'
import { SidebarProvider } from '../ui/primitives/sidebar'
import { SceneLoader } from '../ui/scene-loader'
import { AppSidebar } from '../ui/sidebar/app-sidebar'
import type { SettingsPanelProps } from '../ui/sidebar/panels/settings-panel'
import type { SitePanelProps } from '../ui/sidebar/panels/site-panel'
import { CustomCameraControls } from './custom-camera-controls'
import { ExportManager } from './export-manager'
import { FloatingActionMenu } from './floating-action-menu'
import { Grid } from './grid'
import { PresetThumbnailGenerator } from './preset-thumbnail-generator'
import { SelectionManager } from './selection-manager'
import { SceneCapture } from './scene-capture'
import { SiteEdgeLabels } from './site-edge-labels'
import { ThumbnailGenerator } from './thumbnail-generator'
import { TransformOverlay } from './transform-overlay'

// Load default scene initially (will be replaced when onLoad runs)
useScene.getState().loadScene()
initSpatialGridSync()
initSpaceDetectionSync(useScene, useEditor)
syncEditorSelectionFromCurrentScene()

initSFXBus()

export interface EditorProps {
  // UI slots
  appMenuButton?: ReactNode
  sidebarTop?: ReactNode

  // Persistence — defaults to localStorage when omitted
  onLoad?: () => Promise<SceneGraph | null>
  onSave?: (scene: SceneGraph) => Promise<void>
  onDirty?: () => void
  onSaveStatusChange?: (status: SaveStatus) => void

  // Version preview
  previewScene?: SceneGraph
  isVersionPreviewMode?: boolean

  // Loading indicator (e.g. project fetching in community mode)
  isLoading?: boolean

  // Thumbnail
  onThumbnailCapture?: (blob: Blob) => void

  // Panel config (passed through to sidebar panels)
  settingsPanelProps?: SettingsPanelProps
  sitePanelProps?: SitePanelProps

  // Presets storage backend (defaults to localStorage)
  presetsAdapter?: PresetsAdapter

  // Enables CAD controls and the managed CAD runtime. Static hosts can disable
  // this while still using the browser-based scene editor.
  enableCad?: boolean

  // Controls the helper-backed FreeCAD runtime separately from the CAD UI.
  // Static hosts can expose browser-side sketching without requesting local APIs.
  enableCadRuntime?: boolean
}

function EditorSceneCrashFallback() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/95 p-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-6 shadow-xl">
        <h2 className="font-semibold text-lg">The editor scene failed to render</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          You can retry the scene or return home without reloading the whole app shell.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            className="rounded-md border border-border bg-accent px-3 py-2 font-medium text-sm hover:bg-accent/80"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload editor
          </button>
          <a
            className="rounded-md border border-border bg-background px-3 py-2 font-medium text-sm hover:bg-accent/40"
            href="/"
          >
            Back to home
          </a>
        </div>
      </div>
    </div>
  )
}

export default function Editor({
  appMenuButton,
  sidebarTop,
  onLoad,
  onSave,
  onDirty,
  onSaveStatusChange,
  previewScene,
  isVersionPreviewMode = false,
  isLoading = false,
  onThumbnailCapture,
  settingsPanelProps,
  sitePanelProps,
  presetsAdapter,
  enableCad = true,
  enableCadRuntime = true,
}: EditorProps) {
  useKeyboard()

  const { isLoadingSceneRef } = useAutoSave({
    onSave,
    onDirty,
    onSaveStatusChange,
    isVersionPreviewMode,
  })

  const [isSceneLoading, setIsSceneLoading] = useState(false)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const workspace = useEditor((s) => s.workspace)

  // Load scene on mount (or when onLoad identity changes, e.g. project switch)
  useEffect(() => {
    let cancelled = false

    async function load() {
      isLoadingSceneRef.current = true
      setIsSceneLoading(true)

      try {
        const sceneGraph = onLoad ? await onLoad() : await loadPersistedScene()
        if (!cancelled) {
          applySceneGraphToEditor(sceneGraph)
        }
      } catch {
        if (!cancelled) applySceneGraphToEditor(null)
      } finally {
        if (!cancelled) {
          setIsSceneLoading(false)
          requestAnimationFrame(() => {
            isLoadingSceneRef.current = false
          })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [onLoad, isLoadingSceneRef])

  // Apply preview scene when version preview mode changes
  useEffect(() => {
    if (isVersionPreviewMode && previewScene) {
      applySceneGraphToEditor(previewScene)
    }
  }, [isVersionPreviewMode, previewScene])

  useEffect(() => {
    document.body.classList.add('dark')
    return () => {
      document.body.classList.remove('dark')
    }
  }, [])

  const showLoader = isLoading || isSceneLoading

  return (
    <PresetsProvider adapter={presetsAdapter}>
      <div className="dark h-full w-full text-foreground">
        {showLoader && <SceneLoader />}

        {isPreviewMode ? (
          <ViewerOverlay onBack={() => useEditor.getState().setPreviewMode(false)} />
        ) : (
          <>
            <ActionMenu enableCadRuntime={enableCadRuntime} />
            <ViewPad />
            <PanelManager />
            <HelperManager enableCad={enableCad} enableCadRuntime={enableCadRuntime} />

            <SidebarProvider className="fixed z-20">
              <AppSidebar
                appMenuButton={appMenuButton}
                enableCad={enableCad}
                enableCadRuntime={enableCadRuntime}
                settingsPanelProps={settingsPanelProps}
                sidebarTop={sidebarTop}
                sitePanelProps={sitePanelProps}
              />
            </SidebarProvider>
          </>
        )}

        <ErrorBoundary fallback={<EditorSceneCrashFallback />}>
          <Viewer selectionManager={isPreviewMode ? 'default' : 'custom'}>
            {!isPreviewMode && <SelectionManager />}
            {!isPreviewMode && <FloatingActionMenu />}
            {!isPreviewMode && <TransformOverlay />}
            <ExportManager />
            {enableCad && enableCadRuntime && <CadBodyRuntimeSystem />}
            {isPreviewMode ? <ViewerZoneSystem /> : <ZoneSystem />}
            <CeilingSystem />
            {!isPreviewMode && (
              <Grid
                cellColor="#aaa"
                fadeDistance={workspace === 'cad' ? 4000 : 500}
                sectionColor="#ccc"
              />
            )}
            {!isPreviewMode && <ToolManager />}
            <CustomCameraControls />
            <ThumbnailGenerator onThumbnailCapture={onThumbnailCapture} />
            <SceneCapture />
            <PresetThumbnailGenerator />
            {!isPreviewMode && workspace === 'architecture' && <SiteEdgeLabels />}
            {isPreviewMode && <InteractiveSystem />}
          </Viewer>
          {!isPreviewMode && <ZoneLabelEditorSystem />}
        </ErrorBoundary>
      </div>
    </PresetsProvider>
  )
}
