import { useCallback } from 'react'
import { appendConstraint } from './constraints/shared'
import { CursorSphere } from '../shared/cursor-sphere'
import {
  appendEntitiesToActiveSketch,
  createCadEntityId,
  ensureActiveCadSketch,
  projectWorldPointToSketchPlane,
  useCadGridCursor,
} from './shared'

export const RectangleTool: React.FC = () => {
  const handleGridClick = useCallback((position: [number, number, number]) => {
    const sketch = ensureActiveCadSketch(position)
    if (!sketch) return

    const [x, y] = projectWorldPointToSketchPlane(sketch, position)
    const halfWidth = 1
    const halfHeight = 0.75

    const lineA = createCadEntityId()
    const lineB = createCadEntityId()
    const lineC = createCadEntityId()
    const lineD = createCadEntityId()

    appendEntitiesToActiveSketch({
      entities: [
        {
          id: lineA,
          kind: 'line',
          start: [x - halfWidth, y - halfHeight],
          end: [x + halfWidth, y - halfHeight],
        },
        {
          id: lineB,
          kind: 'line',
          start: [x + halfWidth, y - halfHeight],
          end: [x + halfWidth, y + halfHeight],
        },
        {
          id: lineC,
          kind: 'line',
          start: [x + halfWidth, y + halfHeight],
          end: [x - halfWidth, y + halfHeight],
        },
        {
          id: lineD,
          kind: 'line',
          start: [x - halfWidth, y + halfHeight],
          end: [x - halfWidth, y - halfHeight],
        },
      ],
      closedProfileEntityIds: [lineA, lineB, lineC, lineD],
    })

    appendConstraint('coincident', [lineA, lineB])
    appendConstraint('coincident', [lineB, lineC])
    appendConstraint('coincident', [lineC, lineD])
    appendConstraint('coincident', [lineD, lineA])
  }, [])

  const cursorRef = useCadGridCursor(handleGridClick)

  return <CursorSphere ref={cursorRef} />
}
