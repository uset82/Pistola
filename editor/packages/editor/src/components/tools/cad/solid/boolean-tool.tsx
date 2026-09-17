'use client'

import { Html } from '@react-three/drei'
import { type AnyNodeId, type CadBodyNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Box } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../../../lib/utils'
import useCad, { cadHelperUnavailableMessage, type BooleanOperationMode } from '../../../../store/use-cad'
import useEditor from '../../../../store/use-editor'

const operationLabels: Record<BooleanOperationMode, string> = {
  union: 'Union',
  cut: 'Cut',
  intersect: 'Intersect',
}

export const BooleanTool: React.FC = () => {
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const presetOperation = useEditor((state) => state.cadBooleanMode)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const helperStatus = useCad((state) => state.helperStatus)
  const lastError = useCad((state) => state.lastError)
  const applyBooleanToSelection = useCad((state) => state.applyBooleanToSelection)
  const [operation, setOperation] = useState<BooleanOperationMode>(presetOperation)

  const selectedBodies = useMemo(
    () =>
      selectedIds
        .map((id) => nodes[id as AnyNodeId])
        .filter((node): node is CadBodyNode => node?.type === 'cad-body'),
    [nodes, selectedIds],
  )

  const [targetBody, toolBody] = selectedBodies
  const canApply = selectedBodies.length === 2
  const helperUnavailable = helperStatus === 'error'
  const hint = canApply
    ? `Apply ${operationLabels[operation].toLowerCase()} from ${toolBody?.name || toolBody?.id} into ${targetBody?.name || targetBody?.id}.`
    : 'Select exactly two CAD bodies. The first selection is the target body.'
  const statusMessage = lastError || (helperUnavailable ? cadHelperUnavailableMessage : hint)

  useEffect(() => {
    setOperation(presetOperation)
  }, [presetOperation])

  return (
    <Html fullscreen>
      <div className="pointer-events-none fixed top-24 left-1/2 z-50 w-[360px] -translate-x-1/2">
        <div className="pointer-events-auto rounded-2xl border border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                <Box className="h-4 w-4" />
                Boolean
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

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(operationLabels) as BooleanOperationMode[]).map((option) => (
              <button
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg border px-2 py-2 font-medium text-xs transition-colors',
                  operation === option
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                    : 'border-border/50 bg-[#2C2C2E] text-muted-foreground hover:bg-[#3e3e3e] hover:text-foreground',
                )}
                key={option}
                onClick={() => setOperation(option)}
                type="button"
              >
                {operationLabels[option]}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-black/10 p-3 text-[11px] text-muted-foreground">
            <div>
              Target: <span className="text-foreground">{targetBody?.name || targetBody?.id || 'None'}</span>
            </div>
            <div>
              Tool: <span className="text-foreground">{toolBody?.name || toolBody?.id || 'None'}</span>
            </div>
            <div className="rounded-md border border-border/40 bg-black/20 px-2 py-1.5">
              {statusMessage}
            </div>
          </div>

          <button
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-sm transition-colors',
              canApply && !helperUnavailable
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                : 'cursor-not-allowed bg-border/20 text-muted-foreground',
            )}
            disabled={!canApply || helperUnavailable}
            onClick={() => void applyBooleanToSelection({ operation })}
            type="button"
          >
            <Box className="h-4 w-4" />
            Confirm {operationLabels[operation]}
          </button>
        </div>
      </div>
    </Html>
  )
}
