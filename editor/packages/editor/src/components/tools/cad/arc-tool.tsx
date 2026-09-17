import { useCallback } from 'react'
import { CursorSphere } from '../shared/cursor-sphere'
import {
  appendEntitiesToActiveSketch,
  createCadEntityId,
  ensureActiveCadSketch,
  projectWorldPointToSketchPlane,
  useCadGridCursor,
} from './shared'

export const ArcTool: React.FC = () => {
  const handleGridClick = useCallback((position: [number, number, number]) => {
    const sketch = ensureActiveCadSketch(position)
    if (!sketch) return

    const center = projectWorldPointToSketchPlane(sketch, position)

    appendEntitiesToActiveSketch({
      entities: [
        {
          id: createCadEntityId(),
          kind: 'arc',
          center,
          radius: 0.75,
          startAngle: 0,
          endAngle: Math.PI / 2,
        },
      ],
    })
  }, [])

  const cursorRef = useCadGridCursor(handleGridClick)

  return <CursorSphere ref={cursorRef} />
}
