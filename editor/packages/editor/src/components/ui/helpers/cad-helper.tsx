'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { AlertCircle, RefreshCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import { cn } from '../../../lib/utils'
import useCad, { cadHelperUnavailableMessage } from '../../../store/use-cad'
import useEditor from '../../../store/use-editor'
import useMac, { macHelperUnavailableMessage } from '../../../store/use-mac'

export function CadHelper() {
  const phase = useEditor((state) => state.phase)
  const workspace = useEditor((state) => state.workspace)
  const activeSketchId = useEditor((state) => state.activeSketchId)
  const activeWorkplane = useEditor((state) => state.activeWorkplane)
  const helperStatus = useCad((state) => state.helperStatus)
  const helperInfo = useCad((state) => state.helperInfo)
  const lastError = useCad((state) => state.lastError)
  const refreshHealth = useCad((state) => state.refreshHealth)
  const macStatus = useMac((state) => state.helperStatus)
  const macInfo = useMac((state) => state.helperInfo)
  const macError = useMac((state) => state.lastError)
  const macGenerateStatus = useMac((state) => state.generateStatus)
  const refreshMacHealth = useMac((state) => state.refreshHealth)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)

  const selectedNode =
    selectedIds.length === 1 ? nodes[selectedIds[0]! as AnyNodeId] ?? null : null

  useEffect(() => {
    void refreshHealth()
    void refreshMacHealth()
    const interval = window.setInterval(() => {
      void refreshHealth()
      void refreshMacHealth()
    }, 15000)

    return () => {
      window.clearInterval(interval)
    }
  }, [refreshHealth, refreshMacHealth])

  const [pos, setPos] = useState({ x: 296, y: 52 })
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    }
    const onUp = () => {
      isDragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (phase !== 'cad' && selectedNode?.type !== 'cad-body' && selectedNode?.type !== 'cad-sketch') {
    return null
  }

  const isStub =
    helperInfo?.engine === 'freecad-stub' ||
    helperInfo?.engine === 'mock' ||
    helperInfo?.engine === 'mock-freecad' ||
    (helperInfo?.runtime === 'mock' && helperStatus === 'ready')
  const isMissingBuild =
    helperStatus === 'error' &&
    (lastError?.includes('FREECAD_PATH') || lastError?.includes('FreeCADCmd'))
  const isMacMock = macInfo?.engine === 'mac-mock' || macInfo?.runtime === 'mock'
  const isMacReady = macStatus === 'ready'

  const helperTone =
    helperStatus === 'ready'
      ? isStub
        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : helperStatus === 'busy' || helperStatus === 'checking'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-red-500/30 bg-red-500/10 text-red-200'
  const macTone =
    isMacReady
      ? isMacMock
        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : macStatus === 'busy' || macStatus === 'checking'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-red-500/30 bg-red-500/10 text-red-200'

  const helperMessage =
    isMissingBuild
      ? 'Set FREECAD_PATH to your FreeCADCmd.exe build or run the FreeCAD submodule build.'
      : lastError ||
        (helperStatus === 'error'
          ? cadHelperUnavailableMessage
          : isStub
            ? 'Hosted FreeCAD preview — sketches still extrude. Install FreeCADCmd for real solids.'
            : 'Use the bottom CAD toolbar for sketch tools and the selection panels for body actions.')

  const macMessage =
    macError ||
    (macStatus === 'error'
      ? macHelperUnavailableMessage
      : isMacMock
        ? 'Hosted Multi-Agent-CAD preview. Clone https://github.com/Pan-Chera/Multi-Agent-CAD for engineered parts.'
        : 'Describe a standalone mechanical or printable part. MAC creates the definition in CAD space.')

  const selectionSummary =
    selectedNode?.type === 'cad-sketch'
      ? selectedNode.closedProfileEntityIds.length > 0
        ? `Sketch ready: ${selectedNode.closedProfileEntityIds.length} closed profile${selectedNode.closedProfileEntityIds.length === 1 ? '' : 's'}.`
        : 'Sketch open: close a loop before extrude or revolve.'
      : selectedNode?.type === 'cad-body'
        ? `Body status: ${selectedNode.regenStatus}.`
        : activeSketchId
          ? `Active sketch: ${activeSketchId}`
          : 'No CAD sketch or body selected.'


  const handleRefreshEngines = () => {
    void refreshHealth()
    void refreshMacHealth()
  }

  return (
    <div
      className="pointer-events-auto fixed z-50 flex w-[320px] flex-col gap-3 rounded-xl border border-border/50 bg-sidebar/95 p-3 shadow-2xl backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-grab items-start justify-between gap-3 active:cursor-grabbing"
        onMouseDown={handleDragStart}
      >
        <div>
          <div className="select-none font-semibold text-sm text-white">CAD Engines</div>
          <div className="select-none text-muted-foreground text-xs">
            FreeCAD sketches plus Multi-Agent-CAD parts
          </div>
        </div>
        <button
          aria-label="Refresh CAD and MAC helpers"
          className="rounded-md bg-[#2C2C2E] p-2 text-muted-foreground transition-colors hover:bg-[#3e3e3e] hover:text-foreground"
          onClick={handleRefreshEngines}
          onMouseDown={(e) => e.stopPropagation()}
          type="button"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>

      <div className={cn('rounded-lg border px-3 py-2 text-xs', helperTone)}>
        <div className="font-medium uppercase tracking-wide">
          {helperStatus === 'ready'
            ? isStub
              ? 'FreeCAD preview'
              : 'FreeCAD ready'
            : helperStatus === 'busy'
              ? 'FreeCAD processing'
              : helperStatus === 'checking'
                ? 'Checking FreeCAD'
                : isMissingBuild
                  ? 'FreeCAD not found'
                  : 'FreeCAD unavailable'}
        </div>
        <div className="mt-1 text-[11px] opacity-80">{helperMessage}</div>
      </div>

      <div className={cn('rounded-lg border px-3 py-2 text-xs', macTone)}>
        <div className="font-medium uppercase tracking-wide">
          {isMacReady
            ? isMacMock
              ? 'Multi-Agent-CAD preview'
              : 'Multi-Agent-CAD ready'
            : macStatus === 'busy'
              ? 'MAC generating'
              : macStatus === 'checking'
                ? 'Checking MAC'
                : 'MAC unavailable'}
        </div>
        <div className="mt-1 text-[11px] opacity-80">{macMessage}</div>
        <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-muted-foreground">
          💡 Controlled via the AI Assistant chat. Ask to build CAD solids, mechanical parts, or printable components.
        </div>
        {macGenerateStatus ? <p className="mt-2 text-[11px] opacity-80">{macGenerateStatus}</p> : null}
      </div>

      {phase === 'cad' && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Workplane
          </div>
          <div className={workspace === 'cad' ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
            {(workspace === 'cad' ? (['XY', 'XZ', 'YZ'] as const) : (['XY', 'XZ', 'YZ', 'level'] as const)).map((plane) => (
              <button
                className={cn(
                  'rounded-md border px-2 py-1.5 font-medium text-[11px] transition-colors',
                  activeWorkplane === plane
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                    : 'border-border/50 bg-[#2C2C2E] text-muted-foreground hover:bg-[#3e3e3e] hover:text-foreground',
                )}
                key={plane}
                onClick={() =>
                  void runAssistantCommand([{ type: 'set_cad_workplane', workplane: plane }])
                }
                type="button"
              >
                {plane.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
        {selectionSummary}
      </div>

      {helperStatus === 'error' && macStatus === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Both CAD engines are offline. Refresh after the Canner helpers start.</div>
        </div>
      )}
    </div>
  )
}
