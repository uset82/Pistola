import type {
  AnyNode,
  CadBodyNode,
  CadInstanceNode,
  DoorNode,
  GuideNode,
  ItemNode,
  ScanNode,
  WindowNode,
} from '@pascal-app/core'

export type TransformMode = 'move' | 'rotate' | 'scale'
export type TransformPivot = 'bounds-center' | 'asset-origin'

export type TransformTarget =
  | {
      kind: 'node'
      nodeId: ItemNode['id'] | DoorNode['id'] | WindowNode['id'] | CadBodyNode['id'] | CadInstanceNode['id']
    }
  | { kind: 'reference'; nodeId: GuideNode['id'] | ScanNode['id'] }

export type ReferenceTransformTarget = Extract<TransformTarget, { kind: 'reference' }>
export type TransformTargetNode = ItemNode | DoorNode | WindowNode | GuideNode | ScanNode | CadBodyNode | CadInstanceNode
export type FullTransformTargetNode = ItemNode | GuideNode | ScanNode | CadBodyNode | CadInstanceNode

export type TransformCapabilities = {
  move: boolean
  rotate: boolean
  scale: boolean
  duplicate: boolean
  delete: boolean
  pivot: boolean
  gizmo: boolean
}

export const isReferenceNode = (node: AnyNode): node is GuideNode | ScanNode =>
  node.type === 'guide' || node.type === 'scan'

export const isTransformItemNode = (node: AnyNode): node is ItemNode => node.type === 'item'

export const isCadBodyNode = (node: AnyNode): node is CadBodyNode => node.type === 'cad-body'

export const isMoveOnlyNode = (node: AnyNode): node is DoorNode | WindowNode =>
  node.type === 'door' || node.type === 'window'

export const isCadInstanceNode = (node: AnyNode): node is CadInstanceNode => node.type === 'cad-instance'

export const isTransformTargetNode = (node: AnyNode): node is TransformTargetNode =>
  isTransformItemNode(node) ||
  isCadBodyNode(node) ||
  isCadInstanceNode(node) ||
  isMoveOnlyNode(node) ||
  isReferenceNode(node)

export const isFullTransformTargetNode = (node: TransformTargetNode): node is FullTransformTargetNode =>
  node.type === 'item' ||
  node.type === 'guide' ||
  node.type === 'scan' ||
  node.type === 'cad-body' ||
  node.type === 'cad-instance'

export const resolveTransformTargetFromSelection = ({
  nodes,
  selectedIds,
  selectedReferenceId,
}: {
  nodes: Record<string, AnyNode>
  selectedIds: string[]
  selectedReferenceId: string | null
}): TransformTarget | null => {
  if (selectedReferenceId) {
    const node = nodes[selectedReferenceId]
    if (node && isReferenceNode(node)) {
      return {
        kind: 'reference',
        nodeId: node.id,
      }
    }
  }

  if (selectedIds.length !== 1) return null

  const node = nodes[selectedIds[0]!]
  if (!(node && (isTransformItemNode(node) || isCadBodyNode(node) || isCadInstanceNode(node) || isMoveOnlyNode(node)))) return null

  return {
    kind: 'node',
    nodeId: node.id,
  }
}

export const getTransformTargetNode = (
  nodes: Record<string, AnyNode>,
  target: TransformTarget | null,
): TransformTargetNode | null => {
  if (!target) return null
  const node = nodes[target.nodeId]
  return node && isTransformTargetNode(node) ? node : null
}

export const getTransformCapabilities = (node: TransformTargetNode): TransformCapabilities => {
  if (node.type === 'door' || node.type === 'window') {
    return {
      move: true,
      rotate: false,
      scale: false,
      duplicate: true,
      delete: true,
      pivot: false,
      gizmo: false,
    }
  }

  return {
    move: true,
    rotate: true,
    scale: true,
    duplicate: true,
    delete: true,
    pivot: true,
    gizmo: true,
  }
}
