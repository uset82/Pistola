'use client'

import { motion } from 'motion/react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import { cn } from '../../../lib/utils'
import useEditor from '../../../store/use-editor'

export function WorkspaceSwitcher({
  enableCad = true,
  onWorkspaceChange,
}: {
  enableCad?: boolean
  onWorkspaceChange?: () => void
}) {
  const structureLayer = useEditor((state) => state.structureLayer)
  const phase = useEditor((state) => state.phase)

  const activeTab =
    phase === 'structure' && structureLayer === 'elements'
      ? 'structure'
      : phase === 'furnish'
        ? 'furnish'
        : enableCad && phase === 'cad'
          ? 'cad'
        : phase === 'structure' && structureLayer === 'zones'
          ? 'zones'
          : 'none'

  const activateStructure = () => {
    onWorkspaceChange?.()
    void runAssistantCommand([
      { type: 'set_phase', phase: 'structure' },
      { type: 'set_structure_layer', layer: 'elements' },
    ])
  }

  const activateFurnish = () => {
    onWorkspaceChange?.()
    void runAssistantCommand([{ type: 'set_phase', phase: 'furnish' }])
  }

  const activateZones = () => {
    onWorkspaceChange?.()
    void runAssistantCommand([
      { type: 'set_phase', phase: 'structure' },
      { type: 'set_structure_layer', layer: 'zones' },
    ])
  }

  const activateCad = () => {
    onWorkspaceChange?.()
    void runAssistantCommand([{ type: 'set_phase', phase: 'cad' }])
  }

  return (
    <div
      className={cn(
        'relative grid items-center gap-1 rounded-xl border border-border/50 bg-[#2C2C2E] p-1',
        enableCad ? 'grid-cols-4' : 'grid-cols-3',
      )}
    >
      <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-medium text-[10px] transition-all duration-200',
          activeTab === 'structure'
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
        onClick={activateStructure}
        type="button"
      >
        {activeTab === 'structure' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-[#3e3e3e] shadow-sm ring-1 ring-border/50"
            layoutId="workspaceSwitcherActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <img
            alt="Structure"
            className={cn(
              'mb-1 h-6 w-6 transition-all',
              activeTab !== 'structure' && 'opacity-50 grayscale',
            )}
            src="/icons/room.png"
          />
          Structure
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            S
          </span>
        </div>
      </button>

      <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-medium text-[10px] transition-all duration-200',
          activeTab === 'furnish'
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
        onClick={activateFurnish}
        type="button"
      >
        {activeTab === 'furnish' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-[#3e3e3e] shadow-sm ring-1 ring-border/50"
            layoutId="workspaceSwitcherActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <img
            alt="Furnish"
            className={cn(
              'mb-1 h-6 w-6 transition-all',
              activeTab !== 'furnish' && 'opacity-50 grayscale',
            )}
            src="/icons/couch.png"
          />
          Furnish
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            3
          </span>
        </div>
      </button>

      <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-medium text-[10px] transition-all duration-200',
          activeTab === 'zones'
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
        onClick={activateZones}
        type="button"
      >
        {activeTab === 'zones' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-[#3e3e3e] shadow-sm ring-1 ring-border/50"
            layoutId="workspaceSwitcherActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <img
            alt="Zones"
            className={cn(
              'mb-1 h-6 w-6 transition-all',
              activeTab !== 'zones' && 'opacity-50 grayscale',
            )}
            src="/icons/kitchen.png"
          />
          Zones
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            Z
          </span>
        </div>
      </button>

      {enableCad ? (
        <button
        className={cn(
          'relative flex flex-1 cursor-pointer flex-col items-center justify-center rounded-md py-2 font-medium text-[10px] transition-all duration-200',
          activeTab === 'cad'
            ? 'text-foreground'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
        onClick={activateCad}
        type="button"
      >
        {activeTab === 'cad' && (
          <motion.div
            className="absolute inset-0 rounded-md bg-[#3e3e3e] shadow-sm ring-1 ring-border/50"
            layoutId="workspaceSwitcherActiveBg"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <img
            alt="CAD"
            className={cn('mb-1 h-6 w-6 transition-all', activeTab !== 'cad' && 'opacity-50 grayscale')}
            src="/icons/mesh.png"
          />
          CAD
        </div>
        <div className="absolute right-1.5 bottom-1 z-10 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
          <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
            4
          </span>
        </div>
        </button>
      ) : null}
    </div>
  )
}
