import { useScene, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Camera, Hexagon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ColorDot } from './../../../../../components/ui/primitives/color-dot'
import { runAssistantCommand } from './../../../../../lib/assistant-command-actions'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './../../../../../components/ui/primitives/popover'
import { cn } from './../../../../../lib/utils'

function ZoneItem({ zone }: { zone: ZoneNode }) {
  const [cameraPopoverOpen, setCameraPopoverOpen] = useState(false)
  const selectedZoneId = useViewer((state) => state.selection.zoneId)

  const isSelected = selectedZoneId === zone.id

  const handleClick = () => {
    void runAssistantCommand([
      { type: 'select_nodes', nodeIds: [], zoneId: zone.id },
      { type: 'set_phase', phase: 'structure' },
      { type: 'set_mode', mode: 'select' },
    ])
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    void runAssistantCommand([{ type: 'delete_target', nodeId: zone.id }])
  }

  const handleColorChange = (color: string) => {
    void runAssistantCommand([{ type: 'update_zone_color', nodeId: zone.id, color }])
  }

  return (
    <div
      className={cn(
        'group/row mx-1 mb-0.5 flex h-8 cursor-pointer select-none items-center rounded-lg border px-2 text-sm transition-all duration-200',
        isSelected
          ? 'border-neutral-200/60 bg-white text-foreground shadow-[0_1px_2px_0px_rgba(0,0,0,0.05)] ring-1 ring-white/50 ring-inset dark:border-border/50 dark:bg-accent/50 dark:ring-white/10'
          : 'border-transparent text-muted-foreground hover:border-neutral-200/50 hover:bg-white/40 hover:text-foreground dark:hover:border-border/40 dark:hover:bg-accent/30',
      )}
      onClick={handleClick}
    >
      <span className="mr-2">
        <ColorDot color={zone.color} onChange={handleColorChange} />
      </span>
      <Hexagon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{zone.name}</span>
      {/* Camera snapshot button */}
      <Popover onOpenChange={setCameraPopoverOpen} open={cameraPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-black/5 hover:text-foreground group-hover/row:opacity-100 dark:hover:bg-white/10"
            onClick={(e) => e.stopPropagation()}
            title="Camera snapshot"
          >
            <Camera className="h-3 w-3" />
            {zone.camera && (
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
            {zone.camera && (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  void runAssistantCommand([{ type: 'view_camera_snapshot', nodeId: zone.id }], {
                    onSuccess: () => setCameraPopoverOpen(false),
                  })
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                View snapshot
              </button>
            )}
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation()
                void runAssistantCommand([{ type: 'capture_camera_snapshot', nodeId: zone.id }], {
                  onSuccess: () => setCameraPopoverOpen(false),
                })
              }}
            >
              <Camera className="h-3.5 w-3.5" />
              {zone.camera ? 'Update snapshot' : 'Take snapshot'}
            </button>
            {zone.camera && (
              <button
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground text-sm hover:bg-destructive hover:text-destructive-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  void runAssistantCommand([{ type: 'clear_camera_snapshot', nodeId: zone.id }], {
                    onSuccess: () => setCameraPopoverOpen(false),
                  })
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear snapshot
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <button
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-black/5 hover:text-foreground group-hover/row:opacity-100 dark:hover:bg-white/10"
        onClick={handleDelete}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}

export function ZonePanel() {
  const nodes = useScene((state) => state.nodes)
  const currentLevelId = useViewer((state) => state.selection.levelId)

  // Filter nodes to get zones for the current level
  const levelZones = Object.values(nodes).filter(
    (node): node is ZoneNode => node.type === 'zone' && node.parentId === currentLevelId,
  )

  const handleAddZone = () => {
    if (currentLevelId) {
      void runAssistantCommand([
        { type: 'set_structure_layer', layer: 'zones' },
        { type: 'activate_tool', tool: 'zone' },
      ])
    }
  }

  if (!currentLevelId) {
    return (
      <div className="px-3 py-4 text-muted-foreground text-sm">
        Select a level to view and create zones
      </div>
    )
  }

  return (
    <div className="py-1">
      {levelZones.length === 0 ? (
        <div className="px-3 py-4 text-muted-foreground text-sm">
          No zones on this level.{' '}
          <button className="cursor-pointer text-primary hover:underline" onClick={handleAddZone}>
            Add one
          </button>
        </div>
      ) : (
        levelZones.map((zone) => <ZoneItem key={zone.id} zone={zone} />)
      )}
    </div>
  )
}
