'use client'

import { Html } from '@react-three/drei'
import { type AnyNodeId, type CadSketchNode, useScene } from '@pascal-app/core'
import { RotateCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../../../lib/utils'
import useCad, { cadHelperUnavailableMessage, type RevolveAxis } from '../../../../store/use-cad'
import useEditor from '../../../../store/use-editor'
import { MetricControl } from '../../../ui/controls/metric-control'

const axisOptions: RevolveAxis[] = ['X', 'Y', 'Z', 'custom']

export const RevolveTool: React.FC = () => {
  const activeSketchId = useEditor((state) => state.activeSketchId)
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const helperStatus = useCad((state) => state.helperStatus)
  const lastError = useCad((state) => state.lastError)
  const revolveSelectedSketch = useCad((state) => state.revolveSelectedSketch)
  const nodes = useScene((state) => state.nodes)
  const [angle, setAngle] = useState(360)
  const [axis, setAxis] = useState<RevolveAxis>('Z')
  const [customAxis, setCustomAxis] = useState<[number, number, number]>([0, 1, 0])

  const sketch =
    activeSketchId && nodes[activeSketchId as AnyNodeId]?.type === 'cad-sketch'
      ? (nodes[activeSketchId as AnyNodeId] as CadSketchNode)
      : null

  const canRevolve = Boolean(sketch && sketch.closedProfileEntityIds.length > 0)
  const helperUnavailable = helperStatus === 'error'
  const hint = useMemo(() => {
    if (!sketch) return 'Select or reopen a sketch before revolving.'
    if (sketch.closedProfileEntityIds.length === 0) {
      return 'Sketch needs a closed profile before it can become a revolved body.'
    }

    return `Revolve ${sketch.name || 'active sketch'} around an axis.`
  }, [sketch])
  const statusMessage =
    lastError ||
    (helperUnavailable
      ? cadHelperUnavailableMessage
      : canRevolve
        ? 'Confirm to queue regeneration through the CAD helper.'
        : hint)

  return (
    <Html fullscreen>
      <div className="pointer-events-none fixed top-24 left-1/2 z-50 w-[360px] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                <RotateCw className="h-4 w-4" />
                Revolve
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
              label="Angle"
              max={360}
              min={5}
              onChange={setAngle}
              precision={0}
              step={5}
              unit="deg"
              value={angle}
            />

            <div className="grid grid-cols-4 gap-2">
              {axisOptions.map((option) => (
                <button
                  className={cn(
                    'rounded-lg border px-2 py-2 font-medium text-xs transition-colors',
                    axis === option
                      ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                      : 'border-border/50 bg-[#2C2C2E] text-muted-foreground hover:bg-[#3e3e3e] hover:text-foreground',
                  )}
                  key={option}
                  onClick={() => setAxis(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>

            {axis === 'custom' && (
              <div className="space-y-2">
                <MetricControl
                  label="Axis X"
                  max={1}
                  min={-1}
                  onChange={(value) => setCustomAxis([value, customAxis[1], customAxis[2]])}
                  precision={2}
                  step={0.1}
                  value={customAxis[0]}
                />
                <MetricControl
                  label="Axis Y"
                  max={1}
                  min={-1}
                  onChange={(value) => setCustomAxis([customAxis[0], value, customAxis[2]])}
                  precision={2}
                  step={0.1}
                  value={customAxis[1]}
                />
                <MetricControl
                  label="Axis Z"
                  max={1}
                  min={-1}
                  onChange={(value) => setCustomAxis([customAxis[0], customAxis[1], value])}
                  precision={2}
                  step={0.1}
                  value={customAxis[2]}
                />
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
            {statusMessage}
          </div>

          <button
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-sm transition-colors',
              canRevolve && !helperUnavailable
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                : 'cursor-not-allowed bg-border/20 text-muted-foreground',
            )}
            disabled={!canRevolve || helperUnavailable}
            onClick={() =>
              void revolveSelectedSketch({
                angle,
                axis,
                ...(axis === 'custom' ? { customAxis } : {}),
              })
            }
            type="button"
          >
            <RotateCw className="h-4 w-4" />
            Confirm Revolve
          </button>
        </div>
      </div>
    </Html>
  )
}
