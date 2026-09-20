'use client'

import { useScene } from '@pascal-app/core'
import {
  applySceneGraphToEditor,
  executeAssistantPlan,
  type SceneGraph,
} from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { create } from 'zustand'
import { GLTF_IMPORT_HINT, isGltfJsonDocument, textLooksLikeGltf } from './import-glb'

export type ActiveProjectModal =
  | 'new-project'
  | 'shortcuts'
  | 'share'
  | 'export'
  | 'save-as'
  | null

export interface ProjectState {
  projectName: string
  isDirty: boolean
  lastSaved: number | null
  activeModal: ActiveProjectModal
  setProjectName: (name: string) => void
  markDirty: (dirty?: boolean) => void
  markSaved: () => void
  setActiveModal: (modal: ActiveProjectModal) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectName: 'Untitled Project',
  isDirty: false,
  lastSaved: null,
  activeModal: null,
  setProjectName: (projectName) => set({ projectName }),
  markDirty: (isDirty = true) => set({ isDirty }),
  markSaved: () => set({ isDirty: false, lastSaved: Date.now() }),
  setActiveModal: (activeModal) => set({ activeModal }),
}))

const LOCAL_STORAGE_SCENE_KEY = 'pascal-editor-scene'
const LOCAL_STORAGE_PROJECT_KEY = 'pistola-current-project'

/**
 * Creates a brand new empty project, resetting the scene graph.
 */
export function createNewProject(name: string = 'Untitled Project') {
  applySceneGraphToEditor(null)

  const viewer = useViewer.getState()
  viewer.setSelection({
    selectedIds: [],
    levelId: null,
    zoneId: null,
    buildingId: null,
  })

  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_STORAGE_SCENE_KEY)
    localStorage.removeItem(LOCAL_STORAGE_PROJECT_KEY)
  }

  const projectStore = useProjectStore.getState()
  projectStore.setProjectName(name)
  projectStore.markSaved()

  return true
}

/**
 * Saves current project to localStorage.
 */
export function saveProjectToStorage(projectName?: string): boolean {
  try {
    const { nodes, rootNodeIds } = useScene.getState()
    const name = projectName ?? useProjectStore.getState().projectName

    const payload = {
      name,
      updatedAt: Date.now(),
      scene: { nodes, rootNodeIds },
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_SCENE_KEY, JSON.stringify({ nodes, rootNodeIds }))
      localStorage.setItem(LOCAL_STORAGE_PROJECT_KEY, JSON.stringify(payload))
    }

    useProjectStore.getState().markSaved()
    return true
  } catch (error) {
    console.error('Failed to save project:', error)
    return false
  }
}

/**
 * Downloads the current scene as a JSON file backup.
 */
export function downloadProjectFile(name?: string) {
  const { nodes, rootNodeIds } = useScene.getState()
  const projectName = name ?? useProjectStore.getState().projectName
  const cleanName = projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
  const dateStamp = new Date().toISOString().split('T')[0]

  const data = {
    schemaVersion: 1,
    projectName,
    exportedAt: new Date().toISOString(),
    nodes,
    rootNodeIds,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${cleanName}_${dateStamp}.pistola.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  useProjectStore.getState().markSaved()
}

/**
 * Parses and loads a scene graph from a JSON string or file.
 */
export function loadProjectFromJson(jsonString: string): { success: boolean; error?: string } {
  try {
    const parsed = JSON.parse(jsonString) as Partial<SceneGraph> & {
      projectName?: string
      nodes?: Record<string, unknown>
      rootNodeIds?: string[]
    }

    if (isGltfJsonDocument(parsed)) {
      return {
        success: false,
        error: `This file is a glTF mesh, not a Pistola project. ${GLTF_IMPORT_HINT}`,
      }
    }

    if (!parsed.nodes || typeof parsed.nodes !== 'object' || Array.isArray(parsed.nodes)) {
      return { success: false, error: 'Invalid project file: missing nodes.' }
    }

    const rootNodeIds = Array.isArray(parsed.rootNodeIds) ? parsed.rootNodeIds : Object.keys(parsed.nodes)
    applySceneGraphToEditor({
      nodes: parsed.nodes as any,
      rootNodeIds,
    })

    if (parsed.projectName) {
      useProjectStore.getState().setProjectName(parsed.projectName)
    }

    useProjectStore.getState().markSaved()
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse project JSON.'
    if (textLooksLikeGltf(jsonString)) {
      return { success: false, error: `${message}. ${GLTF_IMPORT_HINT}` }
    }
    return { success: false, error: message }
  }
}

/**
 * Captures a screenshot of the main 3D canvas and downloads it.
 */
export function captureCanvasScreenshot(filename = 'pistola_render.png'): boolean {
  if (typeof document === 'undefined') return false
  const canvas = document.querySelector('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) {
    return false
  }

  const url = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return true
}

/**
 * Copies the current shareable project URL to clipboard.
 */
export async function copyShareLink(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(window.location.href)
    return true
  } catch {
    return false
  }
}

/**
 * Dispatches export commands for various formats.
 */
export async function exportProjectFormat(
  format: 'glb' | 'step' | 'ifc' | 'json' | 'screenshot',
): Promise<boolean> {
  try {
    switch (format) {
      case 'glb': {
        const exportScene = useViewer.getState().exportScene
        if (!exportScene) {
          throw new Error('GLB export is not initialized in this session.')
        }
        await exportScene()
        return true
      }
      case 'step': {
        await executeAssistantPlan([{ type: 'export_cad_body_step' }])
        return true
      }
      case 'ifc': {
        await executeAssistantPlan([{ type: 'export_scene', format: 'ifc' }])
        return true
      }
      case 'json': {
        downloadProjectFile()
        return true
      }
      case 'screenshot': {
        return captureCanvasScreenshot()
      }
    }
  } catch (error) {
    console.error(`Export failed for format ${format}:`, error)
    return false
  }
}
