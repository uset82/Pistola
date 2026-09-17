import type { CadBodyNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Box } from 'lucide-react'
import { useState } from 'react'
import useEditor from './../../../../../store/use-editor'
import { InlineRenameInput } from './inline-rename-input'
import { runTreeSelectionCommand, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

export function CadBodyTreeNode({
  node,
  depth,
  isLast,
}: {
  node: CadBodyNode
  depth: number
  isLast?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const isSelected = selectedIds.includes(node.id)
  const isHovered = useViewer((state) => state.hoveredId === node.id)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions node={node} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={<Box className="h-3.5 w-3.5" />}
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={node.visible !== false}
      label={
        <InlineRenameInput
          defaultName={node.name || 'CAD Body'}
          isEditing={isEditing}
          node={node}
          onStartEditing={() => setIsEditing(true)}
          onStopEditing={() => setIsEditing(false)}
        />
      }
      nodeId={node.id}
      onClick={(event) => {
        event.stopPropagation()
        runTreeSelectionCommand(
          event,
          node.id,
          selectedIds,
          useEditor.getState().phase !== 'cad' ? [{ type: 'set_phase', phase: 'cad' }] : [],
        )
      }}
      onDoubleClick={() => setIsEditing(true)}
      onMouseEnter={() => setHoveredId(node.id)}
      onMouseLeave={() => setHoveredId(null)}
      onToggle={() => {}}
    />
  )
}
