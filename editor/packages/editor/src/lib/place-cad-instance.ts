'use client'

import {
  CadInstanceNode,
  type AnyNodeId,
  type CadBodyNode,
  type LevelNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../store/use-editor'

const findLevelId = (explicitLevelId?: string) => {
  const nodes = useScene.getState().nodes
  if (explicitLevelId && nodes[explicitLevelId as AnyNodeId]?.type === 'level') {
    return explicitLevelId as LevelNode['id']
  }

  const selectedLevelId = useViewer.getState().selection.levelId
  if (selectedLevelId && nodes[selectedLevelId]?.type === 'level') return selectedLevelId

  const groundLevel = Object.values(nodes).find((node) => node.type === 'level' && node.level === 0)
  const anyLevel = groundLevel ?? Object.values(nodes).find((node) => node.type === 'level')
  return anyLevel?.type === 'level' ? anyLevel.id : null
}

const findCadBodyId = (explicitBodyId?: string) => {
  const nodes = useScene.getState().nodes
  if (explicitBodyId && nodes[explicitBodyId as AnyNodeId]?.type === 'cad-body') {
    return explicitBodyId as CadBodyNode['id']
  }

  const selected = useViewer
    .getState()
    .selection.selectedIds.find((id) => nodes[id as AnyNodeId]?.type === 'cad-body')
  if (selected) return selected as CadBodyNode['id']

  const bodies = Object.values(nodes).filter((node) => node.type === 'cad-body')
  const latest = bodies[bodies.length - 1]
  return latest?.type === 'cad-body' ? latest.id : null
}

export const placeCadBodyInArchitecture = (bodyId?: string, levelId?: string) => {
  const sourceId = findCadBodyId(bodyId)
  if (!sourceId) {
    throw new Error('Create a CAD body before placing it in architecture.')
  }

  const parentLevelId = findLevelId(levelId)
  if (!parentLevelId) {
    throw new Error('Architecture needs a level before a CAD part can be placed.')
  }

  const source = useScene.getState().nodes[sourceId]
  if (source?.type !== 'cad-body') {
    throw new Error('The selected node is not a CAD body definition.')
  }

  const instance = CadInstanceNode.parse({
    name: source.name ? `${source.name} placement` : 'CAD placement',
    parentId: parentLevelId,
    sourceCadBodyId: source.id,
    metadata: { sourceCadBodyId: source.id },
  })

  useScene.getState().createNode(instance, parentLevelId)
  useEditor.getState().setWorkspace('architecture')
  useViewer.getState().setSelection({
    levelId: parentLevelId,
    selectedIds: [instance.id],
    zoneId: null,
  })

  return instance.id
}
