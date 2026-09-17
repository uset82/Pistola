'use client'

import {
  type AnyNodeId,
  type CadBodyNode,
  type CadBodyOperation,
  normalizeCadBodyOperations,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { FileDown, GripVertical, RefreshCcw, Trash2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import useCad, { cadHelperUnavailableMessage } from '../../../store/use-cad'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { PanelSection } from '../controls/panel-section'
import { PanelWrapper } from './panel-wrapper'

const statusToneByState: Record<CadBodyNode['regenStatus'], string> = {
  idle: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  building: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  queued: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  running: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  error: 'border-rose-400/30 bg-rose-400/10 text-rose-100',
}

const getPreviewSummary = (node: CadBodyNode) =>
  node.preview.primitive === 'box'
    ? `${node.preview.dimensions[0].toFixed(2)} × ${node.preview.dimensions[1].toFixed(2)} × ${node.preview.dimensions[2].toFixed(2)} m`
    : `Cylinder r ${node.preview.radius.toFixed(2)} • h ${node.preview.height.toFixed(2)} m`

const getBodyOperations = (node: CadBodyNode) =>
  normalizeCadBodyOperations(node.operationHistory.length > 0 ? node.operationHistory : node.operations)

const formatOperationKindLabel = (operation: CadBodyOperation) =>
  operation.kind === 'boolean_union' || operation.kind === 'boolean_cut' || operation.kind === 'boolean_intersect'
    ? operation.kind.replace('_', ' ')
    : operation.kind === 'boolean'
      ? `boolean ${operation.operation}`
      : operation.kind

const formatOperationSummary = (operation: CadBodyOperation) => {
  switch (operation.kind) {
    case 'extrude': {
      const dist = (operation.distance ?? operation.params?.distance) ?? 1.2
      const symmetric = operation.symmetric ?? operation.params?.symmetric ?? false
      return `${dist.toFixed(2)} m${symmetric ? ' • symmetric' : ''}`
    }
    case 'revolve': {
      const axis = operation.axis ?? operation.params?.axis ?? 'Z'
      const angle = (operation.angle ?? operation.params?.angle) ?? 360
      return `${axis} axis • ${Number(angle).toFixed(0)} deg`
    }
    case 'boolean_union':
    case 'boolean_cut':
    case 'boolean_intersect':
    case 'boolean':
      return `${operation.operation ?? 'union'} • tool ${(operation.toolBodyIds ?? operation.params?.toolBodyIds ?? []).join(', ') || '(none)'}`
    case 'fillet': {
      const radius = (operation.radius ?? operation.params?.radius) ?? 0.05
      return `${(operation.edgeRefs ?? operation.params?.edgeRefs ?? []).length} edge(s) • r ${radius.toFixed(2)} m`
    }
    case 'chamfer': {
      const dist = (operation.distance ?? operation.params?.distance) ?? 0.05
      return `${(operation.edgeRefs ?? operation.params?.edgeRefs ?? []).length} edge(s) • d ${dist.toFixed(2)} m`
    }
    default:
      return 'Pending operation'
  }
}

export function CadBodyPanel() {
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const nodes = useScene((state) => state.nodes)
  const helperStatus = useCad((state) => state.helperStatus)
  const lastError = useCad((state) => state.lastError)

  const selectedId = selectedIds[0]
  const node =
    selectedId && nodes[selectedId as AnyNodeId]?.type === 'cad-body'
      ? (nodes[selectedId as AnyNodeId] as CadBodyNode)
      : null

  const operations = useMemo(() => (node ? getBodyOperations(node) : []), [node])

  const handleClose = useCallback(() => {
    void runAssistantCommand([{ type: 'select_nodes', nodeIds: [] }])
  }, [])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    void runAssistantCommand([{ type: 'delete_target', nodeId: selectedId }], {
      failureMessage: 'CAD body delete failed.',
    })
  }, [selectedId])

  const handleToggleSuppressed = useCallback(
    async (operationId: string, suppressed: boolean) => {
      if (!node) return
      await runAssistantCommand(
        [
          {
            type: 'set_cad_body_operation_suppressed',
            bodyId: node.id,
            operationId,
            suppressed,
          },
        ],
        { failureMessage: 'CAD operation update failed.' },
      )
    },
    [node],
  )

  if (!node) return null

  return (
    <PanelWrapper onClose={handleClose} title={node.name || 'CAD Body'} width={340}>
      <PanelSection title="Body">
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="text-muted-foreground text-xs">
            Preview: <span className="text-foreground">{getPreviewSummary(node)}</span>
          </div>
          <div
            className={`rounded-full border px-2 py-1 font-semibold text-[10px] uppercase tracking-[0.15em] ${statusToneByState[node.regenStatus]}`}
          >
            {node.regenStatus}
          </div>
        </div>
        <div className="px-2 pt-1 text-muted-foreground text-xs">
          Source sketches: <span className="text-foreground">{node.sourceSketchIds.length}</span>
        </div>
        {helperStatus === 'error' && (
          <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
            {lastError || cadHelperUnavailableMessage}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Operations">
        {operations.length === 0 ? (
          <div className="px-2 text-muted-foreground text-xs">No body operations recorded yet.</div>
        ) : (
          operations.map((operation, index) => (
            <div
              className="rounded-lg border border-border/40 bg-black/10 px-3 py-2"
              key={operation.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-xs uppercase tracking-[0.15em] text-foreground/80">
                    {index + 1}. {formatOperationKindLabel(operation)}
                  </div>
                  <div className="pt-1 text-[11px] text-muted-foreground">
                    {formatOperationSummary(operation)}
                  </div>
                </div>
              <div className="flex items-center gap-1 text-muted-foreground/60">
                <GripVertical className="h-4 w-4" />
              </div>
            </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted-foreground">
                  {operation.suppressed ? 'Suppressed during regen' : 'Included in regen'}
                </div>
                <button
                  className="rounded-md border border-border/50 bg-background/50 px-2 py-1 font-medium text-[11px] text-foreground transition-colors hover:bg-accent/40"
                  onClick={() => void handleToggleSuppressed(operation.id, !operation.suppressed)}
                  type="button"
                >
                  {operation.suppressed ? 'Restore' : 'Suppress'}
                </button>
              </div>
            </div>
          ))
        )}
      </PanelSection>

      {node.regenStatus === 'error' && node.regenError && (
        <PanelSection title="Error">
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">
            {node.regenError}
          </div>
          <ActionGroup>
            <ActionButton
              icon={<RefreshCcw className="h-3.5 w-3.5" />}
              label="Retry"
              onClick={() =>
                void runAssistantCommand([{ type: 'retry_cad_body', bodyId: node.id }], {
                  failureMessage: 'CAD body retry failed.',
                })
              }
            />
          </ActionGroup>
        </PanelSection>
      )}

      <PanelSection title="Actions">
        <ActionGroup>
          <ActionButton
            icon={<RefreshCcw className="h-3.5 w-3.5" />}
            label="Regenerate"
            onClick={() =>
              void runAssistantCommand([{ type: 'regenerate_cad_body', bodyId: node.id }], {
                failureMessage: 'CAD body regenerate failed.',
              })
            }
          />
          <ActionButton
            icon={<FileDown className="h-3.5 w-3.5" />}
            label="Export STEP"
            onClick={() =>
              void runAssistantCommand([{ type: 'export_cad_body_step', bodyId: node.id }], {
                failureMessage: 'CAD body export failed.',
              })
            }
          />
        </ActionGroup>
        <ActionGroup className="mt-1.5">
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
