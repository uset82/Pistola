'use client'

import { useScene } from '@pascal-app/core'
import { get, set } from 'idb-keyval'
import { useViewer } from '@pascal-app/viewer'
import useCad from '../store/use-cad'
import { evaluateCadSolidSpecCached } from './cad/local-kernel'
import useEditor from '../store/use-editor'

export type SceneGraph = {
  nodes: Record<string, unknown>
  rootNodeIds: string[]
}

const AUTHORED_STRUCTURE_TYPES = new Set([
  'wall',
  'slab',
  'ceiling',
  'roof',
  'roof-segment',
  'door',
  'window',
  'zone',
  'cad-sketch',
  'cad-body',
])

function hasAuthoredStructuralNodes(nodes: Record<string, unknown>): boolean {
  return Object.values(nodes).some((node) => {
    if (!node || typeof node !== 'object') return false

    const nodeType = (node as { type?: string }).type
    if (nodeType && AUTHORED_STRUCTURE_TYPES.has(nodeType)) return true

    if (nodeType === 'item') {
      const assetCategory = (node as { asset?: { category?: string } }).asset?.category
      return assetCategory === 'door' || assetCategory === 'window'
    }

    return false
  })
}

export function syncEditorSelectionFromCurrentScene() {
  const sceneNodes = useScene.getState().nodes as Record<string, any>
  const sceneRootIds = useScene.getState().rootNodeIds
  const siteNode = sceneRootIds[0] ? sceneNodes[sceneRootIds[0]] : null
  const resolve = (child: any) => (typeof child === 'string' ? sceneNodes[child] : child)
  const firstBuilding = siteNode?.children?.map(resolve).find((n: any) => n?.type === 'building')
  const firstLevel = firstBuilding?.children?.map(resolve).find((n: any) => n?.type === 'level')
  const editor = useEditor.getState()
  const shouldEnterDesignBootstrap = !hasAuthoredStructuralNodes(sceneNodes)

  if (firstBuilding && firstLevel) {
    useViewer.getState().setSelection({
      buildingId: firstBuilding.id,
      levelId: firstLevel.id,
      selectedIds: [],
      zoneId: null,
    })
    editor.setMode('select')
    editor.setPhase('structure')
    editor.setStructureLayer('elements')

    if (shouldEnterDesignBootstrap) {
      editor.setMode('build')
      editor.setTool('wall')
    }
  } else {
    editor.setMode('select')
    editor.setPhase('site')
    useViewer.getState().setSelection({
      buildingId: null,
      levelId: null,
      selectedIds: [],
      zoneId: null,
    })
  }
}

export function applySceneGraphToEditor(sceneGraph?: SceneGraph | null) {
  if (sceneGraph?.nodes && sceneGraph.rootNodeIds) {
    const { nodes, rootNodeIds } = sceneGraph
    useScene.getState().setScene(nodes as any, rootNodeIds as any)
  } else {
    useScene.getState().clearScene()
  }

  syncEditorSelectionFromCurrentScene()
}

const LOCAL_STORAGE_KEY = 'pascal-editor-scene'
const IDB_SCENE_KEY = 'pascal-editor-scene'
let lastSaveWarning: string | null = null

export const sceneSaveWarning = () => lastSaveWarning

const reportSaveFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Scene save failed.'
  lastSaveWarning = message
  try {
    useCad.getState().showCommandToast(`Scene save failed: ${message}`)
  } catch {
    // The CAD toast store is unavailable outside the editor shell.
  }
  return message
}

export function compactSceneForStorage(scene: SceneGraph): SceneGraph {
  const nodes = structuredClone(scene.nodes) as Record<string, unknown>
  for (const node of Object.values(nodes)) {
    if (!node || typeof node !== 'object') continue
    const body = node as {
      type?: string
      preview?: { primitive?: string; spec?: unknown; positions?: number[]; indices?: number[]; normals?: number[] }
    }
    const preview = body.preview
    if (body.type !== 'cad-body' || preview?.primitive !== 'mesh') continue
    if (!preview.spec || typeof preview.spec !== 'object' || Array.isArray(preview.spec)) continue
    if (Object.keys(preview.spec).length === 0) continue
    preview.positions = []
    preview.indices = []
    delete preview.normals
  }
  return { nodes, rootNodeIds: [...scene.rootNodeIds] }
}

export function rehydrateSceneMeshes(scene: SceneGraph): SceneGraph {
  const nodes = structuredClone(scene.nodes) as Record<string, unknown>
  for (const node of Object.values(nodes)) {
    if (!node || typeof node !== 'object') continue
    const body = node as {
      type?: string
      preview?: { primitive?: string; spec?: unknown; positions?: number[]; indices?: number[]; normals?: number[] }
    }
    const preview = body.preview
    if (body.type !== 'cad-body' || preview?.primitive !== 'mesh') continue
    if (!preview.spec || typeof preview.spec !== 'object' || Array.isArray(preview.spec)) continue
    if (Array.isArray(preview.positions) && preview.positions.length > 0) continue
    try {
      const mesh = evaluateCadSolidSpecCached(preview.spec)
      preview.positions = mesh.positions
      preview.indices = mesh.indices
      preview.normals = mesh.normals
    } catch {
      // Leave the mesh empty. The structure check reports an open or missing solid.
    }
  }
  return { nodes, rootNodeIds: [...scene.rootNodeIds] }
}

const isStoredScene = (value: unknown): value is SceneGraph => {
  if (!value || typeof value !== 'object') return false
  const sceneGraph = value as Partial<SceneGraph>
  return typeof sceneGraph.nodes === 'object' && sceneGraph.nodes !== null && Array.isArray(sceneGraph.rootNodeIds)
}

export async function saveScene(scene: SceneGraph): Promise<void> {
  const compact = compactSceneForStorage(scene)
  try {
    if (typeof indexedDB === 'undefined') {
      if (typeof localStorage === 'undefined') throw new Error('Scene storage is unavailable.')
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compact))
    } else {
      await set(IDB_SCENE_KEY, compact)
    }
    lastSaveWarning = null
  } catch (error) {
    reportSaveFailure(error)
    throw error
  }
}

export function saveSceneToLocalStorage(scene: SceneGraph): void {
  const compact = compactSceneForStorage(scene)
  try {
    if (typeof localStorage === 'undefined') throw new Error('Scene storage is unavailable.')
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compact))
    lastSaveWarning = null
  } catch (error) {
    reportSaveFailure(error)
    throw error
  }
  if (typeof indexedDB !== 'undefined') {
    void set(IDB_SCENE_KEY, compact).catch((error) => {
      reportSaveFailure(error)
    })
  }
}

const readLocalScene = (): SceneGraph | null => {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return null
    const sceneGraph = JSON.parse(raw) as Partial<SceneGraph>
    return hasLoadableScene(sceneGraph) ? (sceneGraph as SceneGraph) : null
  } catch {
    return null
  }
}

const hasLoadableScene = (sceneGraph: Partial<SceneGraph>) => {
  const hasNodes =
    typeof sceneGraph.nodes === 'object' && sceneGraph.nodes !== null && !Array.isArray(sceneGraph.nodes)
  const hasRoots = Array.isArray(sceneGraph.rootNodeIds) && sceneGraph.rootNodeIds.length > 0
  const nodes = hasNodes ? (sceneGraph.nodes as Record<string, unknown>) : {}
  const hasBuildingHierarchy = (sceneGraph.rootNodeIds || []).some((rootNodeId) => {
    const rootNode = nodes[rootNodeId]
    if (!rootNode || typeof rootNode !== 'object' || (rootNode as { type?: unknown }).type !== 'site') {
      return false
    }
    const children = (rootNode as { children?: unknown }).children
    if (!Array.isArray(children)) return false
    return children.some((child) => {
      const childNode = typeof child === 'string' ? nodes[child] : child
      return childNode && typeof childNode === 'object' && (childNode as { type?: unknown }).type === 'building'
    })
  })
  return hasNodes && hasRoots && hasBuildingHierarchy
}

export function loadSceneFromLocalStorage(): SceneGraph | null {
  const stored = readLocalScene()
  return stored ? rehydrateSceneMeshes(stored) : null
}

export async function loadPersistedScene(): Promise<SceneGraph | null> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const stored = await get(IDB_SCENE_KEY)
      if (isStoredScene(stored) && hasLoadableScene(stored)) return rehydrateSceneMeshes(stored)
    } catch {
      // Fall through to the previous localStorage save.
    }
  }
  return loadSceneFromLocalStorage()
}
