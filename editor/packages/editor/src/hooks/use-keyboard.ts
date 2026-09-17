import { type AnyNodeId, emitter, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect } from 'react'
import {
  deleteTransformTarget,
} from '../lib/transform-actions'
import {
  activateCadCircleCommand,
  activateCadExtrudeCommand,
  activateCadLineCommand,
  activateCadRectangleCommand,
  activateCadRevolveCommand,
  activateCadSketchCommand,
} from '../lib/cad-command-actions'
import { sfxEmitter } from '../lib/sfx-bus'
import {
  getTransformCapabilities,
  getTransformTargetNode,
  resolveTransformTargetFromSelection,
} from '../lib/transform-target'
import { runAssistantCommand } from '../lib/assistant-command-actions'
import useEditor from '../store/use-editor'

export const useKeyboard = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const nodes = useScene.getState().nodes
      const viewerState = useViewer.getState()
      const editorState = useEditor.getState()
      const transformTarget = resolveTransformTargetFromSelection({
        nodes,
        selectedIds: viewerState.selection.selectedIds,
        selectedReferenceId: editorState.selectedReferenceId,
      })
      const transformNode = getTransformTargetNode(nodes, transformTarget)
      const transformCapabilities = transformNode ? getTransformCapabilities(transformNode) : null

      if (e.key === 'Escape') {
        e.preventDefault()
        emitter.emit('tool:cancel')

        if (transformTarget && editorState.transformMode !== 'move') {
          void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'move' }])
          return
        }

        // Clear selections to close UI panels, but KEEP the active building and level context
        editorState.setSelectedReferenceId(null)
        void runAssistantCommand([{ type: 'select_nodes', nodeIds: [] }])
      } else if (e.key === '1' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([
          { type: 'set_phase', phase: 'site' },
          { type: 'set_mode', mode: 'select' },
        ])
      } else if (e.key === '2' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([
          { type: 'set_phase', phase: 'structure' },
          { type: 'set_mode', mode: 'select' },
        ])
      } else if (e.key === '3' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([
          { type: 'set_phase', phase: 'furnish' },
          { type: 'set_mode', mode: 'select' },
        ])
      } else if (e.key === '4' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([
          { type: 'set_phase', phase: 'cad' },
          { type: 'set_mode', mode: 'select' },
        ])
      } else if (editorState.phase === 'cad' && e.key === 's' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        activateCadSketchCommand()
      } else if (editorState.phase === 'cad' && e.key === 'l' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        activateCadLineCommand()
      } else if (editorState.phase === 'cad' && e.key === 't' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        activateCadRectangleCommand()
      } else if (editorState.phase === 'cad' && e.key === 'o' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        activateCadCircleCommand()
      } else if (editorState.phase === 'cad' && e.key === 'e' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        activateCadExtrudeCommand()
      } else if (editorState.phase === 'cad' && e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        activateCadRevolveCommand()
      } else if (e.key === 's' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([
          { type: 'set_phase', phase: 'structure' },
          { type: 'set_structure_layer', layer: 'elements' },
        ])
      } else if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_phase', phase: 'cad' }])
      } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_phase', phase: 'furnish' }])
      } else if (e.key === 'z' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([
          { type: 'set_phase', phase: 'structure' },
          { type: 'set_structure_layer', layer: 'zones' },
        ])
      }
      if (e.key === 'v' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_mode', mode: 'select' }])
      } else if (e.key === 'b' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_mode', mode: 'build' }])
      } else if (e.key === 'g' && !e.metaKey && !e.ctrlKey && transformTarget && transformCapabilities?.move) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'move' }])
      } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey && transformCapabilities?.rotate) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'rotate' }])
      } else if (e.key === 'e' && !e.metaKey && !e.ctrlKey && transformCapabilities?.scale) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'scale' }])
      } else if (e.key === 'd' && !e.metaKey && !e.ctrlKey && transformTarget && transformCapabilities?.duplicate) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'duplicate_target', nodeId: transformTarget.nodeId }])
      } else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'undo_history' }])
      } else if (e.key === 'Z' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void runAssistantCommand([{ type: 'redo_history' }])
      } else if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const { buildingId, levelId } = useViewer.getState().selection
        if (buildingId) {
          const building = useScene.getState().nodes[buildingId]
          if (building && building.type === 'building' && building.children.length > 0) {
            const currentIdx = levelId ? building.children.indexOf(levelId as any) : -1
            const nextIdx = currentIdx < building.children.length - 1 ? currentIdx + 1 : currentIdx
            if (nextIdx !== -1 && nextIdx !== currentIdx) {
              void runAssistantCommand([
                { type: 'focus_level', levelId: building.children[nextIdx] as any },
              ])
            } else if (currentIdx === -1) {
              void runAssistantCommand([{ type: 'focus_level', levelId: building.children[0] as any }])
            }
          }
        }
      } else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const { buildingId, levelId } = useViewer.getState().selection
        if (buildingId) {
          const building = useScene.getState().nodes[buildingId]
          if (building && building.type === 'building' && building.children.length > 0) {
            const currentIdx = levelId ? building.children.indexOf(levelId as any) : -1
            const prevIdx = currentIdx > 0 ? currentIdx - 1 : currentIdx
            if (prevIdx !== -1 && prevIdx !== currentIdx) {
              void runAssistantCommand([
                { type: 'focus_level', levelId: building.children[prevIdx] as any },
              ])
            } else if (currentIdx === -1) {
              void runAssistantCommand([
                {
                  type: 'focus_level',
                  levelId: building.children[building.children.length - 1] as any,
                },
              ])
            }
          }
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()

        const selectedNodeIds = useViewer.getState().selection.selectedIds as AnyNodeId[]
        if (transformTarget?.kind === 'reference') {
          deleteTransformTarget(transformTarget)
          return
        }

        if (selectedNodeIds.length > 0) {
          // Play appropriate SFX based on what's being deleted
          if (selectedNodeIds.length === 1) {
            const node = useScene.getState().nodes[selectedNodeIds[0]!]
            if (node?.type === 'item') {
              sfxEmitter.emit('sfx:item-delete')
            } else {
              sfxEmitter.emit('sfx:structure-delete')
            }
            } else {
              sfxEmitter.emit('sfx:structure-delete')
            }

          void runAssistantCommand([{ type: 'delete_nodes', nodeIds: selectedNodeIds }])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
