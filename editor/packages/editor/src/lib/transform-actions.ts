import {
  type AnyNodeId,
  CadBodyNode,
  DoorNode,
  GuideNode,
  ItemNode,
  ScanNode,
  getCadBodyTransform,
  useScene,
  WindowNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import type { TransformMode, TransformTarget, TransformTargetNode } from './transform-target'
import { getTransformCapabilities, getTransformTargetNode } from './transform-target'
import useEditor from '../store/use-editor'

const duplicateOffset = [0.5, 0, 0.5] as const

const offsetPosition = (position: [number, number, number]): [number, number, number] => [
  position[0] + duplicateOffset[0],
  position[1] + duplicateOffset[1],
  position[2] + duplicateOffset[2],
]

const selectNodeTarget = (nodeId: string) => {
  useEditor.getState().setSelectedReferenceId(null)
  useViewer.getState().setSelection({ selectedIds: [nodeId], zoneId: null })
}

const selectReferenceTarget = (nodeId: string) => {
  useEditor.getState().setSelectedReferenceId(nodeId)
}

export const setTransformModeForSelection = (mode: TransformMode) => {
  useEditor.getState().setTransformMode(mode)
}

export const startTransformMove = (target: TransformTarget | null) => {
  if (!target) return

  const node = getTransformTargetNode(useScene.getState().nodes, target)
  if (!node) return

  const capabilities = getTransformCapabilities(node)
  if (!capabilities.move) return

  if (node.type === 'door' || node.type === 'window') {
    useEditor.getState().setMovingNode(node)
    useViewer.getState().setSelection({ selectedIds: [] })
    useEditor.getState().setTransformMode('move')
    return
  }

  useEditor.getState().setTransformMode('move')
}

export const deleteTransformTarget = (target: TransformTarget | null) => {
  if (!target) return

  const node = getTransformTargetNode(useScene.getState().nodes, target)
  if (!node) return

  useScene.getState().deleteNode(node.id as AnyNodeId)

  if (node.parentId) {
    useScene.getState().dirtyNodes.add(node.parentId as AnyNodeId)
  }

  if (target.kind === 'reference') {
    useEditor.getState().setSelectedReferenceId(null)
    return
  }

  useViewer.getState().setSelection({ selectedIds: [] })
}

const duplicateItemNode = (node: TransformTargetNode) => {
  if (node.type !== 'item' || !node.parentId) return

  const duplicate = ItemNode.parse({
    position: offsetPosition(node.position),
    rotation: [...node.rotation] as [number, number, number],
    scale: [...node.scale] as [number, number, number],
    name: node.name,
    parentId: node.parentId,
    side: node.side,
    wallId: node.wallId,
    wallT: node.wallT,
    visible: node.visible,
    metadata: node.metadata,
    collectionIds: node.collectionIds,
    asset: node.asset,
  })

  useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
  useEditor.getState().setTransformMode('move')
  selectNodeTarget(duplicate.id)
}

const duplicateCadBodyNode = (node: TransformTargetNode) => {
  if (node.type !== 'cad-body' || !node.parentId) return

  const transform = getCadBodyTransform(node)
  const duplicate = CadBodyNode.parse({
    name: node.name,
    parentId: node.parentId,
    visible: node.visible,
    metadata: node.metadata,
    transform: {
      position: offsetPosition(transform.position),
      rotation: [...transform.rotation] as [number, number, number],
      scale: [...transform.scale] as [number, number, number],
    },
    sourceSketchId: node.sourceSketchId,
    sourceSketchIds: node.sourceSketchIds,
    regenStatus: node.regenStatus,
    regenError: node.regenError,
    operations: node.operations,
    operationHistory: node.operationHistory,
    preview: node.preview,
    artifacts: node.artifacts,
    previewArtifactRef: node.previewArtifactRef,
    cadArtifactRef: node.cadArtifactRef,
    warnings: node.warnings,
  })

  useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
  useEditor.getState().setTransformMode('move')
  selectNodeTarget(duplicate.id)
}

const duplicateReferenceNode = (node: TransformTargetNode) => {
  if (!(node.type === 'guide' || node.type === 'scan') || !node.parentId) return

  const base = {
    position: offsetPosition(node.position),
    rotation: [...node.rotation] as [number, number, number],
    scale: node.scale,
    opacity: node.opacity,
    url: node.url,
    name: node.name,
    parentId: node.parentId,
    visible: node.visible,
    metadata: node.metadata,
  }

  const duplicate =
    node.type === 'scan' ? ScanNode.parse(base) : GuideNode.parse(base)

  useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
  useEditor.getState().setTransformMode('move')
  selectReferenceTarget(duplicate.id)
}

const duplicateOpeningNode = (node: TransformTargetNode) => {
  if (!(node.type === 'door' || node.type === 'window') || !node.parentId) return

  useScene.temporal.getState().pause()

  const duplicateInfo = structuredClone(node) as Record<string, unknown>
  delete duplicateInfo.id
  duplicateInfo.metadata = {
    ...(typeof node.metadata === 'object' && node.metadata !== null ? node.metadata : {}),
    isNew: true,
  }

  const duplicate =
    node.type === 'door'
      ? DoorNode.parse(duplicateInfo)
      : WindowNode.parse(duplicateInfo)

  useScene.getState().createNode(duplicate, node.parentId as AnyNodeId)
  useViewer.getState().setSelection({ selectedIds: [] })
  useEditor.getState().setMovingNode(duplicate)
  useEditor.getState().setTransformMode('move')
}

export const duplicateTransformTarget = (target: TransformTarget | null) => {
  if (!target) return

  const node = getTransformTargetNode(useScene.getState().nodes, target)
  if (!node) return

  if (node.type === 'item') {
    duplicateItemNode(node)
    return
  }

  if (node.type === 'cad-body') {
    duplicateCadBodyNode(node)
    return
  }

  if (node.type === 'guide' || node.type === 'scan') {
    duplicateReferenceNode(node)
    return
  }

  duplicateOpeningNode(node)
}
