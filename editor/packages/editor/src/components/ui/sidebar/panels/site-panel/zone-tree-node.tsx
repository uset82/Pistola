import { useScene, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useState } from 'react'
import { runAssistantCommand } from './../../../../../lib/assistant-command-actions'
import { ColorDot } from './../../../../../components/ui/primitives/color-dot'
import { InlineRenameInput } from './inline-rename-input'
import { TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface ZoneTreeNodeProps {
  node: ZoneNode
  depth: number
  isLast?: boolean
}

export function ZoneTreeNode({ node, depth, isLast }: ZoneTreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const isSelected = useViewer((state) => state.selection.zoneId === node.id)
  const isHovered = useViewer((state) => state.hoveredId === node.id)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  const handleClick = () => {
    void runAssistantCommand([{ type: 'select_nodes', nodeIds: [], zoneId: node.id }])
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
  }

  const handleMouseEnter = () => {
    setHoveredId(node.id)
  }

  const handleMouseLeave = () => {
    setHoveredId(null)
  }

  // Calculate approximate area from polygon
  const area = calculatePolygonArea(node.polygon).toFixed(1)
  const defaultName = `Zone (${area}m²)`

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions node={node} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={
        <ColorDot
          color={node.color}
          onChange={(color) =>
            void runAssistantCommand([{ type: 'update_zone_color', nodeId: node.id, color }])
          }
        />
      }
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      label={
        <InlineRenameInput
          defaultName={defaultName}
          isEditing={isEditing}
          node={node}
          onStartEditing={() => setIsEditing(true)}
          onStopEditing={() => setIsEditing(false)}
        />
      }
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onToggle={() => {}}
    />
  )
}

/**
 * Calculate the area of a polygon using the shoelace formula
 */
function calculatePolygonArea(polygon: Array<[number, number]>): number {
  if (polygon.length < 3) return 0

  let area = 0
  const n = polygon.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += polygon[i]![0] * polygon[j]![1]
    area -= polygon[j]![0] * polygon[i]![1]
  }

  return Math.abs(area) / 2
}
