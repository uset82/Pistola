import { useEffect } from 'react'
import useEditor from '../../../../store/use-editor'
import { appendConstraint, getLastTwoLineEntities } from './shared'

const getDirection = (start: [number, number], end: [number, number]) => {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy) || 1
  return [dx / length, dy / length] as const
}

export const ParallelPerpendicularTool: React.FC = () => {
  useEffect(() => {
    const entities = getLastTwoLineEntities()
    if (entities.length < 2) return

    const [first, second] = entities
    if (!(first && second)) return

    const dirA = getDirection(first.start, first.end)
    const dirB = getDirection(second.start, second.end)
    const dot = Math.abs(dirA[0] * dirB[0] + dirA[1] * dirB[1])

    appendConstraint(dot > 0.7 ? 'parallel' : 'perpendicular', [first.id, second.id])
    useEditor.getState().setMode('select')
    useEditor.getState().setTool(null)
  }, [])

  return null
}
