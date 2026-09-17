'use client'

import { Html } from '@react-three/drei'
import { type AnyNodeId, type CadSketchNode, useScene } from '@pascal-app/core'
import { Box, ArrowDown, ArrowUp, MoveVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../../../lib/utils'
import useCad, { cadHelperUnavailableMessage, type ExtrudeDirection } from '../../../../store/use-cad'
import useEditor from '../../../../store/use-editor'
import { MetricControl } from '../../../ui/controls/metric-control'

type DirectionOption = {
  id: ExtrudeDirection
  icon: React.ReactNode
  label: string
}

const directionOptions: DirectionOption[] = [
  { id: 'positive', icon: <ArrowUp className="h-3.5 w-3.5" />, label: 'Positive' },
  { id: 'negative', icon: <ArrowDown className="h-3.5 w-3.5" />, label: 'Negative' },
  { id: 'symmetric', icon: <MoveVertical className="h-3.5 w-3.5" />, label: 'Symmetric' },
]

export const ExtrudeTool: React.FC = () => {
  const activeSketchId = useEditor((state) => state.activeSketchId)
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const helperStatus = useCad((state) => state.helperStatus)
  const lastError = useCad((state) => state.lastError)
  const extrudeSelectedSketch = useCad((state) => state.extrudeSelectedSketch)
  const nodes = useScene((state) => state.nodes)
  const [depth, setDepth] = useState(1.2)
  const [direction, setDirection] = useState<ExtrudeDirection>('positive')

  const sketch =
    activeSketchId && nodes[activeSketchId as AnyNodeId]?.type === 'cad-sketch'
      ? (nodes[activeSketchId as AnyNodeId] as CadSketchNode)
      : null

  const canExtrude = Boolean(sketch && sketch.closedProfileEntityIds.length > 0)
  const helperUnavailable = helperStatus === 'error'
  const hint = useMemo(() => {
    if (!sketch) return 'Select or reopen a sketch before extruding.'
    if (sketch.closedProfileEntityIds.length === 0) {
      return 'Sketch needs a closed profile before it can become a solid.'
    }

    return `Extrude ${sketch.name || 'active sketch'} into a CAD body.`
  }, [sketch])
  const statusMessage =
    lastError ||
    (helperUnavailable
      ? cadHelperUnavailableMessage
      : canExtrude
        ? 'Confirm to queue regeneration through the CAD helper.'
        : hint)

  return (
    <Html fullscreen>
      <div className="pointer-events-none fixed top-24 left-1/2 z-50 w-[340px] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                <Box className="h-4 w-4" />
                Extrude
              </div>
              <div className="pt-1 text-muted-foreground text-xs">{hint}</div>
            </div>
            <button
              className="rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              onClick={() => {
                setMode('select')
                setTool(null)
              }}
              type="button"
            >
              Cancel
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <MetricControl
              label="Depth"
              max={24}
              min={0.1}
              onChange={setDepth}
              step={0.1}
              unit="m"
              value={depth}
            />

            <div className="grid grid-cols-3 gap-2">
              {directionOptions.map((option) => (
                <button
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-lg border px-2 py-2 font-medium text-xs transition-colors',
                    direction === option.id
                      ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                      : 'border-border/50 bg-[#2C2C2E] text-muted-foreground hover:bg-[#3e3e3e] hover:text-foreground',
                  )}
                  key={option.id}
                  onClick={() => setDirection(option.id)}
                  type="button"
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
            {statusMessage}
          </div>

          <button
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-sm transition-colors',
              canExtrude && !helperUnavailable
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                : 'cursor-not-allowed bg-border/20 text-muted-foreground',
            )}
            disabled={!canExtrude || helperUnavailable}
            onClick={() => void extrudeSelectedSketch({ depth, direction })}
            type="button"
          >
            <Box className="h-4 w-4" />
            Confirm Extrude
          </button>
        </div>
      </div>
    </Html>
  )
}
