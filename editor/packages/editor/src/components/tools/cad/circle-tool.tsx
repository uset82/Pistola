import { useCallback } from 'react'
import { CursorSphere } from '../shared/cursor-sphere'
import {
  appendEntitiesToActiveSketch,
  createCadEntityId,
  ensureActiveCadSketch,
  projectWorldPointToSketchPlane,
  useCadGridCursor,
} from './shared'

export const CircleTool: React.FC = () => {
  const handleGridClick = useCallback((position: [number, number, number]) => {
    const sketch = ensureActiveCadSketch(position)
    if (!sketch) return

    const center = projectWorldPointToSketchPlane(sketch, position)

    appendEntitiesToActiveSketch({
      entities: [
        {
          id: createCadEntityId(),
          kind: 'circle',
          center,
          radius: 0.75,
        },
      ],
    })
  }, [])

  const cursorRef = useCadGridCursor(handleGridClick)

  return <CursorSphere ref={cursorRef} />
}
