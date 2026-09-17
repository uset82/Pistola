import { useEffect } from 'react'
import useEditor from '../../../../store/use-editor'
import { appendConstraint, getLastTwoLineEntities } from './shared'

export const CoincidentTool: React.FC = () => {
  useEffect(() => {
    const entities = getLastTwoLineEntities()
    if (entities.length < 2) return
    appendConstraint(
      'coincident',
      entities.map((entity) => entity.id),
    )
    useEditor.getState().setMode('select')
    useEditor.getState().setTool(null)
  }, [])

  return null
}
