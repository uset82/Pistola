import type { RoofNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import Image from 'next/image'
import { useState } from 'react'
import useEditor from './../../../../../store/use-editor'
import { InlineRenameInput } from './inline-rename-input'
import { runTreeSelectionCommand, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface RoofTreeNodeProps {
  node: RoofNode
  depth: number
  isLast?: boolean
}

type LegacyRoofNode = RoofNode & {
  length?: number
  leftWidth?: number
  rightWidth?: number
}

export function RoofTreeNode({ node, depth, isLast }: RoofTreeNodeProps) {
  const roofNode = node as LegacyRoofNode
  const [isEditing, setIsEditing] = useState(false)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const isSelected = selectedIds.includes(roofNode.id)
  const isHovered = useViewer((state) => state.hoveredId === roofNode.id)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    runTreeSelectionCommand(
      e,
      roofNode.id,
      selectedIds,
      useEditor.getState().phase === 'furnish' ? [{ type: 'set_phase', phase: 'structure' }] : [],
    )
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
  }

  const handleMouseEnter = () => {
    setHoveredId(roofNode.id)
  }

  const handleMouseLeave = () => {
    setHoveredId(null)
  }

  // Calculate dimensions: length × total width (leftWidth + rightWidth)
  const totalWidth = (roofNode.leftWidth ?? 0) + (roofNode.rightWidth ?? 0)
  const sizeLabel = `${(roofNode.length ?? 0).toFixed(1)}×${totalWidth.toFixed(1)}m`
  const defaultName = `Roof (${sizeLabel})`

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions node={roofNode} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={
        <Image alt="" className="object-contain" height={14} src="/icons/roof.png" width={14} />
      }
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={roofNode.visible !== false}
      label={
        <InlineRenameInput
          defaultName={defaultName}
          isEditing={isEditing}
          node={roofNode}
          onStartEditing={() => setIsEditing(true)}
          onStopEditing={() => setIsEditing(false)}
        />
      }
      nodeId={roofNode.id}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onToggle={() => {}}
    />
  )
}
