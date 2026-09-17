import { useEffect } from 'react'
import useEditor from '../../../../store/use-editor'
import { appendConstraint, getLastEntities } from './shared'

export const EqualTool: React.FC = () => {
  useEffect(() => {
    const entities = getLastEntities(2)
    if (entities.length < 2) return
    appendConstraint(
      'equal',
      entities.map((entity) => entity.id),
    )
    useEditor.getState().setMode('select')
    useEditor.getState().setTool(null)
  }, [])

  return null
}
