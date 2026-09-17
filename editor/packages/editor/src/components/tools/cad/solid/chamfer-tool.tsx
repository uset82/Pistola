'use client'

import { Html } from '@react-three/drei'
import { type AnyNodeId, type CadBodyNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Box } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../../../lib/utils'
import useCad, { cadHelperUnavailableMessage } from '../../../../store/use-cad'
import useEditor from '../../../../store/use-editor'
import { MetricControl } from '../../../ui/controls/metric-control'
import { getCadBodyEdgeRefs } from './shared'

export const ChamferTool: React.FC = () => {
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const helperStatus = useCad((state) => state.helperStatus)
  const lastError = useCad((state) => state.lastError)
  const applyChamferToSelection = useCad((state) => state.applyChamferToSelection)
  const [distance, setDistance] = useState(0.06)

  const body =
    selectedIds.length === 1 && nodes[selectedIds[0]! as AnyNodeId]?.type === 'cad-body'
      ? (nodes[selectedIds[0]! as AnyNodeId] as CadBodyNode)
      : null

  const edgeRefs = useMemo(() => (body ? getCadBodyEdgeRefs(body) : []), [body])
  const [selectedEdgeRefs, setSelectedEdgeRefs] = useState<string[]>([])

  useEffect(() => {
    setSelectedEdgeRefs(edgeRefs.slice(0, 1))
  }, [edgeRefs])

  const canApply = Boolean(body && selectedEdgeRefs.length > 0)
  const helperUnavailable = helperStatus === 'error'
  const hint = body
    ? 'Choose one or more preview edges, then queue a chamfer regeneration.'
    : 'Select a single CAD body before applying a chamfer.'
  const statusMessage =
    lastError ||
    (helperUnavailable
      ? cadHelperUnavailableMessage
      : canApply
        ? `Queue chamfer on ${selectedEdgeRefs.join(', ')}.`
        : hint)

  return (
    <Html fullscreen>
      <div className="pointer-events-none fixed top-24 left-1/2 z-50 w-[380px] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                <Box className="h-4 w-4" />
                Chamfer
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
              label="Distance"
              max={0.5}
              min={0.01}
              onChange={setDistance}
              precision={2}
              step={0.01}
              unit="m"
              value={distance}
            />

            <div className="space-y-2">
              <div className="font-medium text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                Edge Selection
              </div>
              <div className="grid grid-cols-3 gap-2">
                {edgeRefs.map((edgeRef) => {
                  const isSelected = selectedEdgeRefs.includes(edgeRef)
                  return (
                    <button
                      className={cn(
                        'rounded-lg border px-2 py-2 font-medium text-xs transition-colors',
                        isSelected
                          ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                          : 'border-border/50 bg-[#2C2C2E] text-muted-foreground hover:bg-[#3e3e3e] hover:text-foreground',
                      )}
                      key={edgeRef}
                      onClick={() =>
                        setSelectedEdgeRefs((current) =>
                          current.includes(edgeRef)
                            ? current.filter((value) => value !== edgeRef)
                            : [...current, edgeRef],
                        )
                      }
                      type="button"
                    >
                      {edgeRef}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-black/10 px-3 py-2 text-[11px] text-muted-foreground">
            {statusMessage}
          </div>

          <button
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-sm transition-colors',
              canApply && !helperUnavailable
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                : 'cursor-not-allowed bg-border/20 text-muted-foreground',
            )}
            disabled={!canApply || helperUnavailable}
            onClick={() =>
              void applyChamferToSelection({ distance, edgeRefs: selectedEdgeRefs })
            }
            type="button"
          >
            <Box className="h-4 w-4" />
            Confirm Chamfer
          </button>
        </div>
      </div>
    </Html>
  )
}
