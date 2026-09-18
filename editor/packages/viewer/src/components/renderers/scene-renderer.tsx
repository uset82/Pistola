'use client'

import { useScene } from '@pascal-app/core'
import useViewer from '../../store/use-viewer'
import { NodeRenderer } from './node-renderer'

export const SceneRenderer = () => {
  const rootNodes = useScene((state) => state.rootNodeIds)
  const nodes = useScene((state) => state.nodes)
  const activeWorkspace = useViewer((state) => state.activeWorkspace)
  const visibleRoots = rootNodes.filter((nodeId) => {
    const node = nodes[nodeId]
    if (!node) return false
    if (activeWorkspace === 'cad') return node.type === 'cad-space'
    return node.type !== 'cad-space'
  })

  return (
    <group name="scene-renderer">
      {visibleRoots.map((nodeId) => (
        <NodeRenderer key={nodeId} nodeId={nodeId} />
      ))}
    </group>
  )
}
