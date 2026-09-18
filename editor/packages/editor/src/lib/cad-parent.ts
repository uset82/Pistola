'use client'

import { type AnyNodeId, ensureProjectWorlds, useScene } from '@pascal-app/core'

export const resolveCadSpaceParentId = (): AnyNodeId | null => {
  const scene = useScene.getState()
  const existing = scene.rootNodeIds.find((rootId) => scene.nodes[rootId]?.type === 'cad-space')
  if (existing) return existing

  const worlds = ensureProjectWorlds(scene.nodes, scene.rootNodeIds)
  useScene.getState().setScene(worlds.nodes, worlds.rootNodeIds)
  return worlds.cadSpaceId
}
