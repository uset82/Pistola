'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
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

export function saveSceneToLocalStorage(scene: SceneGraph): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(scene))
  } catch {
    // Swallow storage quota errors
  }
}

export function loadSceneFromLocalStorage(): SceneGraph | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return null

    const sceneGraph = JSON.parse(raw) as Partial<SceneGraph>
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
        return (
          childNode &&
          typeof childNode === 'object' &&
          (childNode as { type?: unknown }).type === 'building'
        )
      })
    })

    return hasNodes && hasRoots && hasBuildingHierarchy ? (sceneGraph as SceneGraph) : null
  } catch {
    return null
  }
}
