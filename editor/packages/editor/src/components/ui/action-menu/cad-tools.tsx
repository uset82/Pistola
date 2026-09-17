'use client'

import {
  Box,
  Circle,
  Cylinder,
  FileDown,
  GitBranch,
  Minus,
  PencilLine,
  Pointer,
  Share2,
  Square,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import { cn } from '../../../lib/utils'
import useEditor, { type CadTool } from '../../../store/use-editor'
import { ActionButton } from './action-button'

type CadToolConfig = {
  id: string
  icon: ReactNode
  label: string
  tool: CadTool | null
  requiresBuildMode: boolean
  shortcut?: string
}

type CadToolGroup = {
  id: string
  label: string
  tools: CadToolConfig[]
}

const cadToolGroups: CadToolGroup[] = [
  {
    id: 'sketch',
    label: 'Sketcher',
    tools: [
      { id: 'cad-sketch', icon: <PencilLine className="h-4 w-4" />, label: 'New Sketch', tool: 'cad-sketch', requiresBuildMode: true, shortcut: 'S' },
      { id: 'cad-line', icon: <Minus className="h-4 w-4" />, label: 'Line', tool: 'cad-line', requiresBuildMode: true, shortcut: 'L' },
      { id: 'cad-rectangle', icon: <Square className="h-4 w-4" />, label: 'Rectangle', tool: 'cad-rectangle', requiresBuildMode: true, shortcut: 'T' },
      { id: 'cad-circle', icon: <Circle className="h-4 w-4" />, label: 'Circle', tool: 'cad-circle', requiresBuildMode: true, shortcut: 'O' },
      { id: 'cad-arc', icon: <Share2 className="h-4 w-4" />, label: 'Arc', tool: 'cad-arc', requiresBuildMode: true },
      { id: 'cad-polyline', icon: <GitBranch className="h-4 w-4" />, label: 'Polyline', tool: 'cad-polyline', requiresBuildMode: true },
    ],
  },
  {
    id: 'solid',
    label: 'Part Design',
    tools: [
      { id: 'cad-extrude', icon: <Box className="h-4 w-4 text-emerald-400" />, label: 'Extrude (Pad)', tool: 'cad-extrude', requiresBuildMode: true, shortcut: 'E' },
      { id: 'cad-revolve', icon: <Cylinder className="h-4 w-4 text-emerald-400" />, label: 'Revolve', tool: 'cad-revolve', requiresBuildMode: true, shortcut: 'R' },
      { id: 'cad-import-step', icon: <FileDown className="h-4 w-4 text-emerald-400" />, label: 'Import STEP', tool: 'cad-import-step', requiresBuildMode: true },
    ],
  },
]

export function CadTools() {
  const activeTool = useEditor((state) => state.tool)

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-1 py-1 scrollbar-hide">
      <ActionButton
        className={cn(
          'rounded-lg duration-300 self-center',
          !activeTool
            ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
            : 'scale-95 bg-transparent opacity-70 hover:bg-black/20 hover:opacity-100',
        )}
        key="select"
        label="Select"
        onClick={() => void runAssistantCommand([{ type: 'set_mode', mode: 'select' }])}
        shortcut="Escape"
        size="icon"
        variant="ghost"
      >
        <Pointer className="h-4 w-4" />
      </ActionButton>

      {cadToolGroups.map((group, groupIndex) => (
        <div className="flex items-center gap-1.5" key={group.id}>
          <div className="mx-1 h-5 w-px bg-border/50" />
          {group.tools.map((tool) => {
            const isActive = activeTool === tool.tool

            return (
              <ActionButton
                className={cn(
                  'rounded-lg duration-300',
                  isActive
                    ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
                    : 'scale-95 bg-transparent opacity-70 hover:bg-black/20 hover:opacity-100',
                )}
                key={tool.id}
                label={tool.label}
                onClick={() =>
                  tool.tool
                    ? void runAssistantCommand([{ type: 'activate_tool', tool: tool.tool }])
                    : undefined
                }
                shortcut={tool.shortcut}
                size="icon"
                variant="ghost"
              >
                {tool.icon}
              </ActionButton>
            )
          })}
        </div>
      ))}
    </div>
  )
}
