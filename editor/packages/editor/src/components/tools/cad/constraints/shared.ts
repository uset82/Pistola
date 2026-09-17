import { type AnyNodeId, type CadSketchEntity, type CadSketchNode, useScene } from '@pascal-app/core'
import useEditor from '../../../../store/use-editor'
import { getActiveCadSketch } from '../shared'

const updateActiveSketch = (updater: (sketch: CadSketchNode) => Partial<CadSketchNode>) => {
  const sketch = getActiveCadSketch()
  if (!sketch) return null

  useScene.getState().updateNode(sketch.id as AnyNodeId, updater(sketch) as Partial<CadSketchNode>)
  useEditor.getState().setActiveSketchId(sketch.id)
  return sketch
}

const isLineEntity = (entity: CadSketchEntity): entity is Extract<CadSketchEntity, { kind: 'line' }> =>
  entity.kind === 'line'

export const getLastEntities = (count: number) => {
  const sketch = getActiveCadSketch()
  if (!sketch) return []
  return sketch.entities.slice(-count)
}

export const appendConstraint = (
  kind: CadSketchNode['constraints'][number]['kind'],
  entityIds: string[],
  value?: number,
) => {
  updateActiveSketch((sketch) => ({
    ...(sketch.constraints.some((constraint) => {
      if (constraint.kind !== kind) return false
      if ((constraint.value ?? null) !== (typeof value === 'number' ? value : null)) return false

      const existingIds = [...constraint.entityIds].sort()
      const nextIds = [...entityIds].sort()
      return (
        existingIds.length === nextIds.length &&
        existingIds.every((entityId, index) => entityId === nextIds[index])
      )
    })
      ? {}
      : {
          constraints: [
            ...sketch.constraints,
            {
              id: `${kind}-${sketch.constraints.length + 1}`,
              kind,
              entityIds,
              ...(typeof value === 'number' ? { value } : {}),
            },
          ],
        }),
    editStatus: 'editing',
  }))
}

export const appendDimension = (
  kind: CadSketchNode['dimensions'][number]['kind'],
  entityId: string,
  value: number,
  label?: string,
) => {
  updateActiveSketch((sketch) => ({
    ...(sketch.dimensions.some(
      (dimension) => dimension.kind === kind && dimension.entityId === entityId,
    )
      ? {}
      : {
          dimensions: [
            ...sketch.dimensions,
            {
              id: `dimension-${sketch.dimensions.length + 1}`,
              kind,
              entityId,
              value,
              ...(label ? { label } : {}),
            },
          ],
        }),
    editStatus: 'editing',
  }))
}

export const getLastTwoLineEntities = () => {
  const sketch = getActiveCadSketch()
  if (!sketch) return []
  return sketch.entities.filter(isLineEntity).slice(-2)
}

export const getLastLineEntity = () => {
  const [lastLine] = getLastTwoLineEntities().slice(-1)
  return lastLine ?? null
}

export const getLineLength = (entity: Extract<CadSketchEntity, { kind: 'line' }>) =>
  Math.hypot(entity.end[0] - entity.start[0], entity.end[1] - entity.start[1])
