import { useCallback } from 'react'
import { CursorSphere } from '../shared/cursor-sphere'
import {
  appendEntitiesToActiveSketch,
  createCadEntityId,
  ensureActiveCadSketch,
  projectWorldPointToSketchPlane,
  useCadGridCursor,
} from './shared'

export const PolylineTool: React.FC = () => {
  const handleGridClick = useCallback((position: [number, number, number]) => {
    const sketch = ensureActiveCadSketch(position)
    if (!sketch) return

    const [x, y] = projectWorldPointToSketchPlane(sketch, position)

    appendEntitiesToActiveSketch({
      entities: [
        {
          id: createCadEntityId(),
          kind: 'polyline',
          points: [
            [x - 0.8, y - 0.4],
            [x + 0.4, y - 0.4],
            [x + 0.8, y + 0.5],
          ],
          closed: false,
        },
      ],
    })
  }, [])

  const cursorRef = useCadGridCursor(handleGridClick)

  return <CursorSphere ref={cursorRef} />
}
