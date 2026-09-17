'use client'

import { sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Copy, LocateFixed, Maximize2, Move, RotateCw, Trash2 } from 'lucide-react'
import { useCallback, useRef } from 'react'
import * as THREE from 'three'
import { runAssistantCommand } from '../../lib/assistant-command-actions'
import {
  getTransformCapabilities,
  getTransformTargetNode,
  resolveTransformTargetFromSelection,
} from '../../lib/transform-target'
import { sfxEmitter } from '../../lib/sfx-bus'
import useEditor from '../../store/use-editor'

function ActionButton({
  active = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean
  icon: React.ReactNode
  label: string
  onClick: (event: React.MouseEvent) => void
}) {
  return (
    <button
      className={`tooltip-trigger inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function FloatingActionMenu() {
  const nodes = useScene((s) => s.nodes)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const mode = useEditor((s) => s.mode)
  const movingNode = useEditor((s) => s.movingNode)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const transformMode = useEditor((s) => s.transformMode)
  const transformPivot = useEditor((s) => s.transformPivot)

  const groupRef = useRef<THREE.Group>(null)

  const target = resolveTransformTargetFromSelection({
    nodes,
    selectedIds,
    selectedReferenceId,
  })
  const node = getTransformTargetNode(nodes, target)
  const capabilities = node ? getTransformCapabilities(node) : null

  useFrame(() => {
    if (!(target && groupRef.current)) return

    const object = sceneRegistry.nodes.get(target.nodeId)
    if (!object) return

    const box = new THREE.Box3().setFromObject(object)
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      groupRef.current.position.set(center.x, box.max.y + 0.35, center.z)
      return
    }

    object.getWorldPosition(groupRef.current.position)
    groupRef.current.position.y += 0.35
  })

  const handleMove = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'move' }], {
        onSuccess: () => sfxEmitter.emit('sfx:item-pick'),
      })
    },
    [],
  )

  const handleRotate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'rotate' }])
    },
    [],
  )

  const handleScale = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      void runAssistantCommand([{ type: 'set_transform_mode', transformMode: 'scale' }])
    },
    [],
  )

  const handlePivot = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      void runAssistantCommand([
        {
          type: 'set_transform_pivot',
          pivot: transformPivot === 'bounds-center' ? 'asset-origin' : 'bounds-center',
        },
      ])
    },
    [transformPivot],
  )

  const handleDuplicate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      if (!target) return
      void runAssistantCommand([{ type: 'duplicate_target', nodeId: target.nodeId }], {
        onSuccess: () => sfxEmitter.emit('sfx:item-pick'),
      })
    },
    [target],
  )

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      if (!target) return
      void runAssistantCommand([{ type: 'delete_target', nodeId: target.nodeId }], {
        onSuccess: () => sfxEmitter.emit('sfx:item-delete'),
      })
    },
    [target],
  )

  if (
    !(
      target &&
      node &&
      capabilities &&
      mode === 'select' &&
      !movingNode &&
      !isPreviewMode
    )
  ) {
    return null
  }

  return (
    <group ref={groupRef}>
      <Html
        center
        style={{
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
        zIndexRange={[100, 0]}
      >
        <div
          className="flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-xl backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          {capabilities.move && (
            <ActionButton
              active={transformMode === 'move'}
              icon={<Move className="h-3.5 w-3.5" />}
              label="Move"
              onClick={handleMove}
            />
          )}
          {capabilities.rotate && (
            <ActionButton
              active={transformMode === 'rotate'}
              icon={<RotateCw className="h-3.5 w-3.5" />}
              label="Rotate"
              onClick={handleRotate}
            />
          )}
          {capabilities.scale && (
            <ActionButton
              active={transformMode === 'scale'}
              icon={<Maximize2 className="h-3.5 w-3.5" />}
              label="Scale"
              onClick={handleScale}
            />
          )}
          {capabilities.pivot && (
            <ActionButton
              active={transformPivot === 'asset-origin'}
              icon={<LocateFixed className="h-3.5 w-3.5" />}
              label={transformPivot === 'bounds-center' ? 'Center' : 'Origin'}
              onClick={handlePivot}
            />
          )}
          {capabilities.duplicate && (
            <ActionButton
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Duplicate"
              onClick={handleDuplicate}
            />
          )}
          {capabilities.delete && (
            <ActionButton
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete"
              onClick={handleDelete}
            />
          )}
        </div>
      </Html>
    </group>
  )
}
