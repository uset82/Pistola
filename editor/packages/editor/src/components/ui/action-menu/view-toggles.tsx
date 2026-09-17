'use client'

import { useViewer } from '@pascal-app/viewer'
import { Camera, Diamond, Layers, Layers2 } from 'lucide-react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import { cn } from '../../../lib/utils'
import { ActionButton } from './action-button'

const levelModeLabels: Record<'stacked' | 'exploded' | 'solo', string> = {
  stacked: 'Stacked',
  exploded: 'Exploded',
  solo: 'Solo',
}

const levelModeOrder: ('stacked' | 'exploded' | 'solo')[] = ['stacked', 'exploded', 'solo']

type WallMode = 'up' | 'cutaway' | 'down'

const wallModeConfig: Record<
  WallMode,
  { icon: React.FC<React.ComponentProps<'img'>>; label: string }
> = {
  up: {
    icon: (props) => (
      <img alt="Full Height" height={20} src="/icons/room.png" width={20} {...props} />
    ),
    label: 'Full Height',
  },
  cutaway: {
    icon: (props) => (
      <img alt="Cutaway" height={20} src="/icons/wallcut.png" width={20} {...props} />
    ),
    label: 'Cutaway',
  },
  down: {
    icon: (props) => <img alt="Low" height={20} src="/icons/walllow.png" width={20} {...props} />,
    label: 'Low',
  },
}

const wallModeOrder: WallMode[] = ['cutaway', 'up', 'down']

export function ViewToggles() {
  const cameraMode = useViewer((state) => state.cameraMode)
  const levelMode = useViewer((state) => state.levelMode)
  const wallMode = useViewer((state) => state.wallMode)
  const showScans = useViewer((state) => state.showScans)
  const showGuides = useViewer((state) => state.showGuides)

  const cycleLevelMode = () => {
    const nextMode =
      levelMode === 'manual'
        ? 'stacked'
        : levelModeOrder[(levelModeOrder.indexOf(levelMode as 'stacked' | 'exploded' | 'solo') + 1) % levelModeOrder.length]
    if (levelMode === 'manual') {
      void runAssistantCommand([{ type: 'set_level_view_mode', levelMode: 'stacked' }])
      return
    }
    if (nextMode) {
      void runAssistantCommand([{ type: 'set_level_view_mode', levelMode: nextMode }])
    }
  }

  const cycleWallMode = () => {
    const currentIndex = wallModeOrder.indexOf(wallMode)
    const nextIndex = (currentIndex + 1) % wallModeOrder.length
    const nextMode = wallModeOrder[nextIndex]
    if (nextMode) {
      void runAssistantCommand([{ type: 'set_wall_view_mode', wallMode: nextMode }])
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Camera Mode */}
      <ActionButton
        className={cn(
          cameraMode === 'orthographic'
            ? 'bg-violet-500/20 text-violet-400'
            : 'hover:text-violet-400',
        )}
        label={`Camera: ${cameraMode === 'perspective' ? 'Perspective' : 'Orthographic'}`}
        onClick={() =>
          void runAssistantCommand([
            {
              type: 'set_camera_mode',
              cameraMode: cameraMode === 'perspective' ? 'orthographic' : 'perspective',
            },
          ])
        }
        size="icon"
        variant="ghost"
      >
        <Camera className="h-6 w-6" />
      </ActionButton>

      {/* Level Mode */}
      <ActionButton
        className={cn(
          levelMode !== 'stacked' ? 'bg-amber-500/20 text-amber-400' : 'hover:text-amber-400',
        )}
        label={`Levels: ${levelMode === 'manual' ? 'Manual' : levelModeLabels[levelMode as keyof typeof levelModeLabels]}`}
        onClick={cycleLevelMode}
        size="icon"
        variant="ghost"
      >
        {levelMode === 'solo' && <Diamond className="h-6 w-6" />}
        {levelMode === 'exploded' && <Layers2 className="h-6 w-6" />}
        {(levelMode === 'stacked' || levelMode === 'manual') && <Layers className="h-6 w-6" />}
      </ActionButton>

      {/* Wall Mode */}
      <ActionButton
        className={cn(
          'p-0',
          wallMode !== 'cutaway'
            ? 'bg-white/10'
            : 'opacity-60 grayscale hover:bg-white/5 hover:opacity-100 hover:grayscale-0',
        )}
        label={`Walls: ${wallModeConfig[wallMode].label}`}
        onClick={cycleWallMode}
        size="icon"
        variant="ghost"
      >
        {(() => {
          const Icon = wallModeConfig[wallMode].icon
          return <Icon className="h-[28px] w-[28px]" />
        })()}
      </ActionButton>

      {/* Show Scans */}
      <ActionButton
        className={cn(
          'p-0',
          showScans
            ? 'bg-white/10'
            : 'opacity-60 grayscale hover:bg-white/5 hover:opacity-100 hover:grayscale-0',
        )}
        label={`Scans: ${showScans ? 'Visible' : 'Hidden'}`}
        onClick={() =>
          void runAssistantCommand([{ type: 'set_scans_visibility', enabled: !showScans }])
        }
        size="icon"
        variant="ghost"
      >
        <img alt="Scans" className="h-[28px] w-[28px] object-contain" src="/icons/mesh.png" />
      </ActionButton>

      {/* Show Guides */}
      <ActionButton
        className={cn(
          'p-0',
          showGuides
            ? 'bg-white/10'
            : 'opacity-60 grayscale hover:bg-white/5 hover:opacity-100 hover:grayscale-0',
        )}
        label={`Guides: ${showGuides ? 'Visible' : 'Hidden'}`}
        onClick={() =>
          void runAssistantCommand([{ type: 'set_guides_visibility', enabled: !showGuides }])
        }
        size="icon"
        variant="ghost"
      >
        <img alt="Guides" className="h-[28px] w-[28px] object-contain" src="/icons/floorplan.png" />
      </ActionButton>
    </div>
  )
}
