'use client'

import useEditor from '../store/use-editor'
import { cn } from '../lib/utils'

export function WorldSwitcher() {
  const workspace = useEditor((state) => state.workspace)

  const handleSelectArchitecture = () => {
    useEditor.getState().setWorkspace('architecture')
  }

  const handleSelectCad = () => {
    useEditor.getState().setWorkspace('cad')
  }

  return (
    <div
      aria-label="Project worlds"
      className="grid grid-cols-2 gap-1 rounded-xl border border-border/50 bg-[#1f1f21] p-1"
      role="tablist"
    >
      <button
        aria-label="Architecture workspace"
        aria-selected={workspace === 'architecture'}
        className={cn(
          'rounded-lg px-2 py-2 font-medium text-[11px] transition-colors',
          workspace === 'architecture'
            ? 'bg-[#3e3e3e] text-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
        onClick={handleSelectArchitecture}
        role="tab"
        type="button"
      >
        Architecture
      </button>
      <button
        aria-label="CAD workspace"
        aria-selected={workspace === 'cad'}
        className={cn(
          'rounded-lg px-2 py-2 font-medium text-[11px] transition-colors',
          workspace === 'cad'
            ? 'bg-[#3e3e3e] text-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        )}
        onClick={handleSelectCad}
        role="tab"
        type="button"
      >
        CAD
      </button>
    </div>
  )
}
