'use client'

import { type CadSpaceNode, useRegistry } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import { AxesHelper, type Group, type Object3D } from 'three'
import { EDITOR_LAYER } from '../../../lib/layers'
import { NodeRenderer } from '../node-renderer'

export const CadSpaceRenderer = ({ node }: { node: CadSpaceNode }) => {
  const ref = useRef<Group>(null!)
  const origin = useMemo(() => {
    const axes = new AxesHelper(1.5)
    axes.layers.set(EDITOR_LAYER)
    axes.traverse((child: Object3D) => {
      child.layers.set(EDITOR_LAYER)
    })
    return axes
  }, [])
  useRegistry(node.id, 'cad-space', ref)

  return (
    <group name="cad-space" ref={ref} visible={node.visible}>
      <primitive object={origin} />
      {node.children.map((childId) => (
        <NodeRenderer key={childId} nodeId={childId} />
      ))}
    </group>
  )
}
