'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../../store/use-editor'
import { CadBodyPanel } from './cad-body-panel'
import { CadSketchPanel } from './cad-sketch-panel'
import { CeilingPanel } from './ceiling-panel'
import { DoorPanel } from './door-panel'
import { ItemPanel } from './item-panel'
import { ReferencePanel } from './reference-panel'
import { RoofPanel } from './roof-panel'
import { SlabPanel } from './slab-panel'
import { WallPanel } from './wall-panel'
import { WindowPanel } from './window-panel'

export function PanelManager() {
  const phase = useEditor((s) => s.phase)
  const activeSketchId = useEditor((s) => s.activeSketchId)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const nodes = useScene((s) => s.nodes)

  // Show reference panel if a reference is selected
  if (selectedReferenceId) {
    return <ReferencePanel />
  }

  if (phase === 'cad' && activeSketchId && nodes[activeSketchId as AnyNodeId]?.type === 'cad-sketch') {
    return <CadSketchPanel />
  }

  // Show appropriate panel based on selected node type
  if (selectedIds.length === 1) {
    const selectedNode = selectedIds[0]
    const node = nodes[selectedNode as AnyNodeId]
    if (node) {
      switch (node.type) {
        case 'cad-body':
          return phase === 'cad' ? <CadBodyPanel /> : null
        case 'cad-sketch':
          return phase === 'cad' ? <CadSketchPanel /> : null
        case 'item':
          return <ItemPanel />
        case 'roof':
          return <RoofPanel />
        case 'slab':
          return <SlabPanel />
        case 'ceiling':
          return <CeilingPanel />
        case 'wall':
          return <WallPanel />
        case 'door':
          return <DoorPanel />
        case 'window':
          return <WindowPanel />
      }
    }
  }

  return null
}
