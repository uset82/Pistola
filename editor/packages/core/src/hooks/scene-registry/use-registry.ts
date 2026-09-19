'use client'

import { useLayoutEffect } from 'react'
import type * as THREE from 'three'
import { sceneRegistry } from './scene-registry'

export function useRegistry(
  id: string,
  type: keyof typeof sceneRegistry.byType,
  ref: React.RefObject<THREE.Object3D>,
) {
  useLayoutEffect(() => {
    const obj = ref.current
    if (!obj) return

    sceneRegistry.nodes.set(id, obj)
    sceneRegistry.byType[type].add(id)

    return () => {
      sceneRegistry.nodes.delete(id)
      sceneRegistry.byType[type].delete(id)
    }
  }, [id, type, ref])
}
