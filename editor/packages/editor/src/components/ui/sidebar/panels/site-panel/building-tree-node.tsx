import { type BuildingNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'
import { runAssistantCommand } from './../../../../../lib/assistant-command-actions'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../../../components/ui/primitives/tooltip'
import { TreeNode, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface BuildingTreeNodeProps {
  node: BuildingNode
  depth: number
  isLast?: boolean
}

export function BuildingTreeNode({ node, depth, isLast }: BuildingTreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = useViewer((state) => state.selection.buildingId === node.id)
  const isHovered = useViewer((state) => state.hoveredId === node.id)

  const handleClick = () => {
    void runAssistantCommand([{ type: 'focus_building', buildingId: node.id }])
  }

  const handleAddLevel = (e: React.MouseEvent) => {
    e.stopPropagation()
    void runAssistantCommand([{ type: 'create_level', buildingId: node.id }])
  }

  return (
    <TreeNodeWrapper
      actions={
        <div className="flex items-center gap-0.5">
          <TreeNodeActions node={node} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-primary-foreground/20"
                onClick={handleAddLevel}
              >
                <Plus className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Add new level</TooltipContent>
          </Tooltip>
        </div>
      }
      depth={depth}
      expanded={expanded}
      hasChildren={node.children.length > 0}
      icon={<Building2 className="h-3.5 w-3.5" />}
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      label={node.name || 'Building'}
      onClick={handleClick}
      onToggle={() => setExpanded(!expanded)}
    >
      {node.children.map((childId, index) => (
        <TreeNode
          depth={depth + 1}
          isLast={index === node.children.length - 1}
          key={childId}
          nodeId={childId}
        />
      ))}
    </TreeNodeWrapper>
  )
}
