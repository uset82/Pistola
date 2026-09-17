import { useCallback } from 'react'
import { CursorSphere } from '../shared/cursor-sphere'
import {
  appendEntitiesToActiveSketch,
  createCadEntityId,
  ensureActiveCadSketch,
  projectWorldPointToSketchPlane,
  useCadGridCursor,
} from './shared'

export const LineTool: React.FC = () => {
  const handleGridClick = useCallback((position: [number, number, number]) => {
    const sketch = ensureActiveCadSketch(position)
    if (!sketch) return

    const [x, y] = projectWorldPointToSketchPlane(sketch, position)

    appendEntitiesToActiveSketch({
      entities: [
        {
          id: createCadEntityId(),
          kind: 'line',
          start: [x - 0.5, y],
          end: [x + 0.5, y],
        },
      ],
    })
  }, [])

  const cursorRef = useCadGridCursor(handleGridClick)

  return <CursorSphere ref={cursorRef} />
}
