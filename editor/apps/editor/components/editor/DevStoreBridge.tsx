'use client'

import { CadBodyNodeSchema, emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect } from 'react'
import useCad from '../../../../packages/editor/src/store/use-cad'
import useEditor from '../../../../packages/editor/src/store/use-editor'

export function DevStoreBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    ;(window as any).__PASCAL_DEV__ = {
      CadBodyNodeSchema,
      emitter,
      sceneRegistry,
      useCad,
      useEditor,
      useScene,
      useViewer,
    }

    return () => {
      delete (window as any).__PASCAL_DEV__
    }
  }, [])

  return null
}
