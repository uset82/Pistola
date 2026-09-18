'use client'

import { type CadSpaceNode, useRegistry } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import { AxesHelper, type Group } from 'three'
import { NodeRenderer } from '../node-renderer'

export const CadSpaceRenderer = ({ node }: { node: CadSpaceNode }) => {
  const ref = useRef<Group>(null!)
  const origin = useMemo(() => new AxesHelper(1.5), [])
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
