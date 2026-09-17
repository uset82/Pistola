'use client'

import { type AnyNode, type RoofNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useCallback } from 'react'
import { runAssistantCommand } from '../../../lib/assistant-command-actions'
import { ActionButton } from '../controls/action-button'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

type LegacyRoofNode = RoofNode & {
  length?: number
  height?: number
  leftWidth?: number
  rightWidth?: number
}

export function RoofPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const nodes = useScene((s) => s.nodes)

  const selectedId = selectedIds[0]
  const node = selectedId ? (nodes[selectedId as AnyNode['id']] as LegacyRoofNode | undefined) : undefined

  const handleUpdate = useCallback(
    (updates: Partial<LegacyRoofNode>) => {
      if (!selectedId) return
      void runAssistantCommand([
        {
          type: 'update_roof_properties',
          nodeId: selectedId,
          ...(updates.position ? { position: updates.position } : {}),
          ...(typeof updates.rotation === 'number' ? { rotation: updates.rotation } : {}),
          ...(typeof updates.length === 'number' ? { length: updates.length } : {}),
          ...(typeof updates.height === 'number' ? { height: updates.height } : {}),
          ...(typeof updates.leftWidth === 'number' ? { leftWidth: updates.leftWidth } : {}),
          ...(typeof updates.rightWidth === 'number' ? { rightWidth: updates.rightWidth } : {}),
        },
      ])
    },
    [selectedId],
  )

  const handleClose = useCallback(() => {
    void runAssistantCommand([{ type: 'select_nodes', nodeIds: [] }])
  }, [])

  if (!node || node.type !== 'roof' || selectedIds.length !== 1) return null

  const leftWidth = node.leftWidth ?? 0
  const rightWidth = node.rightWidth ?? 0
  const roofLength = node.length ?? 0
  const roofHeight = node.height ?? 0
  const totalWidth = leftWidth + rightWidth

  return (
    <PanelWrapper
      icon="/icons/roof.png"
      onClose={handleClose}
      title={node.name || 'Roof'}
      width={300}
    >
      <PanelSection title="Dimensions">
        <SliderControl
          label="Length"
          max={20}
          min={0.5}
          onChange={(v) => handleUpdate({ length: v })}
          precision={2}
          step={0.5}
          unit="m"
          value={Math.round(roofLength * 100) / 100}
        />
        <SliderControl
          label="Height"
          max={10}
          min={0.1}
          onChange={(v) => handleUpdate({ height: v })}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(roofHeight * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="Slope Widths">
        <div className="flex items-center justify-between px-2 pb-2 font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
          <span>Widths</span>
          <span>Total: {totalWidth.toFixed(1)}m</span>
        </div>
        <SliderControl
          label="Left"
          max={10}
          min={0.1}
          onChange={(v) => handleUpdate({ leftWidth: v })}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(leftWidth * 100) / 100}
        />
        <SliderControl
          label="Right"
          max={10}
          min={0.1}
          onChange={(v) => handleUpdate({ rightWidth: v })}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(rightWidth * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="Rotation">
        <SliderControl
          label={
            <>
              R<sub className="ml-[1px] text-[11px] opacity-70">rot</sub>
            </>
          }
          max={180}
          min={-180}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({ rotation: radians })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation * 180) / Math.PI)}
        />
        <div className="flex gap-1.5 px-1 pt-2 pb-1">
          <ActionButton
            label="-90°"
            onClick={() => handleUpdate({ rotation: node.rotation - Math.PI / 2 })}
          />
          <ActionButton
            label="+90°"
            onClick={() => handleUpdate({ rotation: node.rotation + Math.PI / 2 })}
          />
        </div>
      </PanelSection>

      <PanelSection title="Position">
        <SliderControl
          label={
            <>
              X<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={50}
          min={-50}
          onChange={(v) => {
            const pos = [...node.position] as [number, number, number]
            pos[0] = v
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[0] * 100) / 100}
        />
        <SliderControl
          label={
            <>
              Y<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={50}
          min={-50}
          onChange={(v) => {
            const pos = [...node.position] as [number, number, number]
            pos[1] = v
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        <SliderControl
          label={
            <>
              Z<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={50}
          min={-50}
          onChange={(v) => {
            const pos = [...node.position] as [number, number, number]
            pos[2] = v
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[2] * 100) / 100}
        />
      </PanelSection>
    </PanelWrapper>
  )
}
