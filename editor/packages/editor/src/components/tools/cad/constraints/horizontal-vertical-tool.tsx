import { useEffect } from 'react'
import useEditor from '../../../../store/use-editor'
import { appendConstraint, getLastLineEntity } from './shared'

export const HorizontalVerticalTool: React.FC = () => {
  useEffect(() => {
    const entity = getLastLineEntity()
    if (!entity) return

    const deltaX = Math.abs(entity.end[0] - entity.start[0])
    const deltaY = Math.abs(entity.end[1] - entity.start[1])

    appendConstraint(deltaX >= deltaY ? 'horizontal' : 'vertical', [entity.id])
    useEditor.getState().setMode('select')
    useEditor.getState().setTool(null)
  }, [])

  return null
}
