'use client'

import { type AnyNodeId, type CadSketchNode, useScene } from '@pascal-app/core'
import { Box, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { PanelSection } from '../controls/panel-section'
import { PanelWrapper } from './panel-wrapper'

const formatEntitySummary = (entity: CadSketchNode['entities'][number]) => {
  switch (entity.kind) {
    case 'line':
      return `(${entity.start[0].toFixed(2)}, ${entity.start[1].toFixed(2)}) -> (${entity.end[0].toFixed(2)}, ${entity.end[1].toFixed(2)})`
    case 'rectangle':
      return `${entity.width.toFixed(2)} x ${entity.height.toFixed(2)} m`
    case 'circle':
      return `r ${entity.radius.toFixed(2)} m`
    case 'arc':
      return `r ${entity.radius.toFixed(2)} • ${entity.startAngle.toFixed(2)} -> ${entity.endAngle.toFixed(2)}`
    case 'polyline':
      return `${entity.points.length} pts${entity.closed ? ' • closed' : ''}`
  }
}

const badgeToneByStatus: Record<CadSketchNode['editStatus'], string> = {
  editing: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100',
  idle: 'border-slate-400/30 bg-slate-400/10 text-slate-100',
  invalid: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
}

export function CadSketchPanel() {
  const phase = useEditor((state) => state.phase)
  const activeSketchId = useEditor((state) => state.activeSketchId)
  const nodes = useScene((state) => state.nodes)

  const node =
    phase === 'cad' && activeSketchId && nodes[activeSketchId as AnyNodeId]?.type === 'cad-sketch'
      ? (nodes[activeSketchId as AnyNodeId] as CadSketchNode)
      : null
  const closedProfileCount = node?.closedProfileEntityIds.length ?? 0
  const profileReady = closedProfileCount > 0

  const handleClose = useCallback(() => {
    if (!node) return
    void runAssistantCommand([
      { type: 'close_cad_sketch', sketchId: node.id },
      { type: 'select_nodes', nodeIds: [] },
    ])
  }, [node])

  const handleDelete = useCallback(() => {
    if (!node) return
    void runAssistantCommand([{ type: 'delete_target', nodeId: node.id }], {
      failureMessage: 'CAD sketch delete failed.',
    })
  }, [node])

  const handleConstraintDelete = useCallback(
    (constraintId: string) => {
      if (!node) return
      void runAssistantCommand(
        [{ type: 'delete_cad_sketch_constraint', sketchId: node.id, constraintId }],
        {
          failureMessage: 'CAD sketch constraint delete failed.',
        },
      )
    },
    [node],
  )

  const handleDimensionUpdate = useCallback(
    (dimensionId: string, value: number) => {
      if (!node || Number.isNaN(value) || value <= 0) return
      void runAssistantCommand(
        [{ type: 'update_cad_sketch_dimension', sketchId: node.id, dimensionId, value }],
        {
          failureMessage: 'CAD sketch dimension update failed.',
        },
      )
    },
    [node],
  )

  if (!node) return null

  return (
    <PanelWrapper onClose={handleClose} title={node.name || 'CAD Sketch'} width={320}>
      <PanelSection title="Sketch">
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="text-muted-foreground text-xs">
            Workplane: <span className="text-foreground uppercase">{node.plane}</span>
          </div>
          <div
            className={`rounded-full border px-2 py-1 font-semibold text-[10px] uppercase tracking-[0.15em] ${badgeToneByStatus[node.editStatus]}`}
          >
            {node.editStatus}
          </div>
        </div>
        <div className="px-2 pt-1 text-muted-foreground text-xs">
          Entities: <span className="text-foreground">{node.entities.length}</span> • Constraints:{' '}
          <span className="text-foreground">{node.constraints.length}</span>
        </div>
      </PanelSection>

      <PanelSection title="Profile Readiness">
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="text-muted-foreground text-xs">
            Closed profiles: <span className="text-foreground">{closedProfileCount}</span>
          </div>
          <div
            className={`rounded-full border px-2 py-1 font-semibold text-[10px] uppercase tracking-[0.15em] ${
              profileReady
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-100'
            }`}
          >
            {profileReady ? 'Ready' : 'Open'}
          </div>
        </div>
        <div className="px-2 pt-1 text-muted-foreground text-xs">
          {profileReady
            ? 'This sketch is ready for extrude or revolve.'
            : 'Complete at least one closed loop before creating a CAD body.'}
        </div>
      </PanelSection>

      <PanelSection title="Entities">
        {node.entities.length === 0 ? (
          <div className="px-2 text-muted-foreground text-xs">No sketch entities yet.</div>
        ) : (
          node.entities.map((entity) => (
            <div
              className="rounded-lg border border-border/40 bg-black/10 px-3 py-2"
              key={entity.id}
            >
              <div className="font-medium text-xs uppercase tracking-[0.15em] text-foreground/80">
                {entity.kind}
              </div>
              <div className="pt-1 text-[11px] text-muted-foreground">
                {formatEntitySummary(entity)}
              </div>
            </div>
          ))
        )}
      </PanelSection>

      <PanelSection title="Constraints">
        {node.constraints.length === 0 ? (
          <div className="px-2 text-muted-foreground text-xs">No constraints applied.</div>
        ) : (
          node.constraints.map((constraint) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-black/10 px-3 py-2"
              key={constraint.id}
            >
              <div>
                <div className="font-medium text-xs uppercase tracking-[0.15em] text-foreground/80">
                  {constraint.kind}
                </div>
                <div className="pt-1 text-[11px] text-muted-foreground">
                  {constraint.entityIds.join(', ') || 'No entities'}
                </div>
              </div>
              <button
                className="rounded-md bg-red-500/10 px-2 py-1 font-medium text-[11px] text-red-200 transition-colors hover:bg-red-500/20"
                onClick={() => handleConstraintDelete(constraint.id)}
                type="button"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </PanelSection>

      <PanelSection title="Dimensions">
        {node.dimensions.length === 0 ? (
          <div className="px-2 text-muted-foreground text-xs">No dimensions defined.</div>
        ) : (
          node.dimensions.map((dimension) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-black/10 px-3 py-2"
              key={dimension.id}
            >
              <div className="min-w-0">
                <div className="font-medium text-xs uppercase tracking-[0.15em] text-foreground/80">
                  {dimension.label || dimension.kind}
                </div>
                <div className="pt-1 text-[11px] text-muted-foreground">{dimension.entityId}</div>
              </div>
              <input
                className="w-20 rounded-md border border-border/50 bg-black/20 px-2 py-1 text-right text-xs text-foreground outline-none focus:border-cyan-400/50"
                min={0.01}
                onChange={(event) =>
                  handleDimensionUpdate(dimension.id, Number.parseFloat(event.target.value))
                }
                step={0.1}
                type="number"
                value={dimension.value}
              />
            </div>
          ))
        )}
      </PanelSection>

      <PanelSection title="Actions">
        <ActionGroup>
          <ActionButton
            icon={<Box className="h-3.5 w-3.5" />}
            disabled={!profileReady}
            label="Extrude"
            onClick={() =>
              void runAssistantCommand([
                { type: 'extrude_cad_sketch', sketchId: node.id, depth: 1.2, direction: 'positive' },
              ], {
                failureMessage: 'CAD sketch extrude failed.',
              })
            }
          />
          <ActionButton
            disabled={!profileReady}
            label="Revolve"
            onClick={() =>
              void runAssistantCommand(
                [{ type: 'revolve_cad_sketch', sketchId: node.id, angle: 360, axis: 'Z' }],
                {
                  failureMessage: 'CAD sketch revolve failed.',
                },
              )
            }
          />
          <ActionButton
            label="Close Sketch"
            onClick={handleClose}
          />
          <ActionButton
            className="text-red-200 hover:bg-red-500/10"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete"
            onClick={handleDelete}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
