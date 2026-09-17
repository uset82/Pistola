'use client'

import type { DoorNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import Image from 'next/image'
import { useState } from 'react'
import useEditor from './../../../../../store/use-editor'
import { InlineRenameInput } from './inline-rename-input'
import { runTreeSelectionCommand, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface DoorTreeNodeProps {
  node: DoorNode
  depth: number
  isLast?: boolean
}

export function DoorTreeNode({ node, depth, isLast }: DoorTreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const isSelected = selectedIds.includes(node.id)
  const isHovered = useViewer((state) => state.hoveredId === node.id)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  const defaultName = 'Door'

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions node={node} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={
        <Image alt="" className="object-contain" height={14} src="/icons/door.png" width={14} />
      }
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={node.visible !== false}
      label={
        <InlineRenameInput
          defaultName={defaultName}
          isEditing={isEditing}
          node={node}
          onStartEditing={() => setIsEditing(true)}
          onStopEditing={() => setIsEditing(false)}
        />
      }
      nodeId={node.id}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        runTreeSelectionCommand(
          e,
          node.id,
          selectedIds,
          useEditor.getState().phase === 'furnish' ? [{ type: 'set_phase', phase: 'structure' }] : [],
        )
      }}
      onDoubleClick={() => setIsEditing(true)}
      onMouseEnter={() => setHoveredId(node.id)}
      onMouseLeave={() => setHoveredId(null)}
      onToggle={() => {}}
    />
  )
}
