'use client'

import { type CadBodyNode, type CadInstanceNode, useRegistry, useScene } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'

const getSourceDimensions = (body: CadBodyNode | undefined): [number, number, number] => {
  if (!body) return [0.4, 0.4, 0.4]
  if (body.preview.primitive === 'box') return body.preview.dimensions
  if (body.preview.primitive === 'cylinder') {
    return [body.preview.radius * 2, body.preview.height, body.preview.radius * 2]
  }
  return [
    Math.max(...body.preview.points.map((point) => point[0])) - Math.min(...body.preview.points.map((point) => point[0])),
    body.preview.height,
    Math.max(...body.preview.points.map((point) => point[1])) - Math.min(...body.preview.points.map((point) => point[1])),
  ]
}

export const CadInstanceRenderer = ({ node }: { node: CadInstanceNode }) => {
  const ref = useRef<Group>(null!)
  const source = useScene((state) => state.nodes[node.sourceCadBodyId as CadBodyNode['id']])
  const body = source?.type === 'cad-body' ? source : undefined
  const dimensions = getSourceDimensions(body)
  const color = body?.preview.color ?? '#60a5fa'
  const material = useMemo(
    () =>
      new MeshStandardNodeMaterial({
        color,
        roughness: 0.45,
        metalness: 0.15,
      }),
    [color],
  )
  const handlers = useNodeEvents(node, 'cad-instance')

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  useRegistry(node.id, 'cad-instance', ref)

  return (
    <group
      name="cad-instance"
      position={node.position}
      ref={ref}
      rotation={node.rotation}
      scale={node.scale}
      visible={node.visible}
      {...handlers}
    >
      <mesh material={material} position-y={dimensions[1] / 2}>
        <boxGeometry args={dimensions} />
      </mesh>
    </group>
  )
}
