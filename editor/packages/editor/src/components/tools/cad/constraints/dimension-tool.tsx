import { useEffect } from 'react'
import useEditor from '../../../../store/use-editor'
import { appendDimension, getLastEntities, getLastLineEntity, getLineLength } from './shared'

export const DimensionTool: React.FC = () => {
  useEffect(() => {
    const lastLine = getLastLineEntity()
    if (lastLine) {
      appendDimension('distance', lastLine.id, Number(getLineLength(lastLine).toFixed(2)), 'D')
      useEditor.getState().setMode('select')
      useEditor.getState().setTool(null)
      return
    }

    const [lastEntity] = getLastEntities(1)
    if (!lastEntity) return

    if (lastEntity.kind === 'circle' || lastEntity.kind === 'arc') {
      appendDimension('radius', lastEntity.id, Number(lastEntity.radius.toFixed(2)), 'R')
      useEditor.getState().setMode('select')
      useEditor.getState().setTool(null)
    }
  }, [])

  return null
}
