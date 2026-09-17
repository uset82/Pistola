import { type AnyNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Camera, Eye, EyeOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { runAssistantCommand } from './../../../../../lib/assistant-command-actions'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './../../../../../components/ui/primitives/popover'

interface TreeNodeActionsProps {
  node: AnyNode
}

export function TreeNodeActions({ node }: TreeNodeActionsProps) {
  const [open, setOpen] = useState(false)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const hasCamera = !!node.camera
  const isVisible = node.visible !== false

  const toggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newVisibility = !isVisible
    const nodeIds = selectedIds && selectedIds.includes(node.id) ? selectedIds : [node.id]
    void runAssistantCommand([{ type: 'set_node_visibility', nodeIds, visible: newVisibility }])
  }

  const handleCaptureCamera = (e: React.MouseEvent) => {
    e.stopPropagation()
    void runAssistantCommand([{ type: 'capture_camera_snapshot', nodeId: node.id }], {
      onSuccess: () => setOpen(false),
    })
  }
  const handleViewCamera = (e: React.MouseEvent) => {
    e.stopPropagation()
    void runAssistantCommand([{ type: 'view_camera_snapshot', nodeId: node.id }], {
      onSuccess: () => setOpen(false),
    })
  }

  const handleClearCamera = (e: React.MouseEvent) => {
    e.stopPropagation()
    void runAssistantCommand([{ type: 'clear_camera_snapshot', nodeId: node.id }], {
      onSuccess: () => setOpen(false),
    })
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        onClick={toggleVisibility}
        title={isVisible ? 'Hide' : 'Show'}
      >
        {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-50" />}
      </button>

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={(e) => e.stopPropagation()}
            title="Camera snapshot"
          >
            <Camera className="h-3 w-3" />
            {hasCamera && (
              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-1"
          onClick={(e) => e.stopPropagation()}
          side="right"
        >
          <div className="flex flex-col gap-0.5">
            {hasCamera && (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                onClick={handleViewCamera}
              >
                <Camera className="h-3.5 w-3.5" />
                View snapshot
              </button>
            )}
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
              onClick={handleCaptureCamera}
            >
              <Camera className="h-3.5 w-3.5" />
              {hasCamera ? 'Update snapshot' : 'Take snapshot'}
            </button>
            {hasCamera && (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleClearCamera}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear snapshot
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
