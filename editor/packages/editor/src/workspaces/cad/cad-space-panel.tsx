'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useState } from 'react'
import { placeCadBodyInArchitecture } from '../../lib/place-cad-instance'

export function CadSpacePanel() {
  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const cadSpaceId = rootNodeIds.find((id) => nodes[id]?.type === 'cad-space')
  const cadSpace = cadSpaceId ? nodes[cadSpaceId] : null
  const childIds = cadSpace?.type === 'cad-space' ? cadSpace.children : []
  const selectedBodyId = selectedIds.find((id) => nodes[id as AnyNodeId]?.type === 'cad-body')

  const handleSelectPart = (nodeId: string) => {
    useViewer.getState().setSelection({ selectedIds: [nodeId as AnyNodeId], zoneId: null })
  }

  const handlePlaceInArchitecture = () => {
    try {
      placeCadBodyInArchitecture(selectedBodyId)
      setPlaceError(null)
    } catch (error) {
      setPlaceError(error instanceof Error ? error.message : 'Unable to place the CAD part.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <div>
        <div className="font-medium text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Part library
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Sketches and solids stay in CAD space. Place a definition into a building level when the
          architecture world needs it.
        </p>
      </div>

      <div className="space-y-1">
        {childIds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-[12px] text-muted-foreground">
            No CAD parts yet. Sketch, extrude, or generate a Multi-Agent-CAD part.
          </div>
        ) : (
          childIds.map((childId) => {
            const node = nodes[childId]
            if (!node) return null
            const selected = selectedIds.includes(childId)
            return (
              <button
                aria-label={`Select ${node.name || node.type}`}
                className={
                  selected
                    ? 'flex w-full items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-left text-sm'
                    : 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground'
                }
                key={childId}
                onClick={() => handleSelectPart(childId)}
                type="button"
              >
                <span>{node.name || node.type}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {node.type === 'cad-sketch' ? 'sketch' : 'body'}
                </span>
              </button>
            )
          })
        )}
      </div>

      <button
        aria-label="Place selected CAD body in architecture"
        className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-left text-sm text-cyan-100 hover:bg-cyan-400/20"
        onClick={handlePlaceInArchitecture}
        type="button"
      >
        Place in architecture
      </button>
      {placeError ? <p className="text-[12px] text-red-300">{placeError}</p> : null}

      <p className="text-[11px] text-muted-foreground">
        Ask the AI Assistant to sketch, extrude, or generate a Multi-Agent-CAD part. Workplanes are
        in the CAD toolbar.
      </p>
    </div>
  )
}
