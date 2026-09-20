'use client'

import { ItemNode, saveAsset, useScene, type AnyNodeId } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Box3 } from 'three'
import { dimensionsFromBounds, floorOffsetFromBounds } from './import-glb'
import { useProjectStore } from './project-actions'

export type ImportGlbResult = { success: true; itemId: string } | { success: false; error: string }

const modelName = (fileName: string) => fileName.replace(/\.(glb|gltf)$/i, '').trim() || 'Imported model'

const activeLevelId = (): AnyNodeId | null => {
  const nodes = useScene.getState().nodes
  const selected = useViewer.getState().selection.levelId
  if (selected && nodes[selected]?.type === 'level') return selected
  const level = Object.values(nodes).find((node) => node.type === 'level')
  return level?.id ?? null
}

/**
 * Store a GLB/glTF in IndexedDB and place it as one selectable item on the
 * active level. Named meshes stay inside the model; the project is not replaced.
 */
export const importGlbFileAsItem = async (file: File): Promise<ImportGlbResult> => {
  if (file.size === 0) return { success: false, error: 'This file is empty.' }

  const levelId = activeLevelId()
  if (!levelId) {
    return { success: false, error: 'Import needs a level. Create or open a project first.' }
  }

  let src: string
  try {
    src = await saveAsset(file)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Could not store this model.',
    }
  }

  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    const buffer = await file.arrayBuffer()
    const gltf = await new Promise<{ scene: import('three').Object3D }>((resolve, reject) => {
      loader.parse(
        buffer,
        '',
        (parsed) => resolve(parsed),
        (error) => {
          reject(error instanceof Error ? error : new Error('Could not read this GLB or glTF file.'))
        },
      )
    })

    const box = new Box3().setFromObject(gltf.scene)
    const bounds = { min: box.min, max: box.max }
    const dimensions = dimensionsFromBounds(bounds)
    if (box.isEmpty() || !dimensions) {
      return { success: false, error: 'This file has no mesh to import.' }
    }

    const name = modelName(file.name)
    const item = ItemNode.parse({
      name,
      asset: {
        id: `imported-${crypto.randomUUID()}`,
        category: 'imported',
        name,
        src,
        dimensions,
        offset: floorOffsetFromBounds(bounds),
      },
      position: [0, 0, 0],
    })

    useScene.getState().createNode(item, levelId)
    const level = useScene.getState().nodes[levelId]
    if (!level || level.type !== 'level') {
      return { success: false, error: 'Import needs a level. Create or open a project first.' }
    }
    const parent = level.parentId ? useScene.getState().nodes[level.parentId as AnyNodeId] : null

    useEditor.getState().setMode('select')
    useEditor.getState().setSelectedReferenceId(null)
    useViewer.getState().setSelection({
      buildingId: parent?.type === 'building' ? parent.id : useViewer.getState().selection.buildingId,
      levelId: level.id,
      zoneId: null,
      selectedIds: [item.id],
    })
    useProjectStore.getState().markDirty(true)
    return { success: true, itemId: item.id }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Could not read this GLB or glTF file.',
    }
  }
}
