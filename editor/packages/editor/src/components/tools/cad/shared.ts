import {
  type AnyNodeId,
  type CadSketchEntity,
  type CadSketchNode,
  generateId,
  useScene,
} from '@pascal-app/core'
import { emitter, type GridEvent } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useRef } from 'react'
import { type Group, Vector3 } from 'three'
import useCad from '../../../store/use-cad'
import useEditor from '../../../store/use-editor'

type SketchPoint = [number, number]
type SketchEntityAppender = {
  entities: CadSketchEntity[]
  closedProfileEntityIds?: string[]
}

type GridPositionResolver = (
  position: [number, number, number],
  event: GridEvent,
) => [number, number, number]

const cursorHeightOffset = 0.01

export const projectWorldPointToSketchPlane = (
  sketch: CadSketchNode,
  worldPoint: [number, number, number],
): SketchPoint => {
  switch (sketch.plane) {
    case 'XY':
      return [worldPoint[0] - sketch.position[0], worldPoint[1] - sketch.position[1]]
    case 'YZ':
      return [worldPoint[2] - sketch.position[2], worldPoint[1] - sketch.position[1]]
    default:
      return [worldPoint[0] - sketch.position[0], worldPoint[2] - sketch.position[2]]
  }
}

export const getActiveCadSketch = (): CadSketchNode | null => {
  const activeSketchId = useEditor.getState().activeSketchId
  if (activeSketchId) {
    const activeNode = useScene.getState().nodes[activeSketchId as AnyNodeId]
    if (activeNode?.type === 'cad-sketch') {
      return activeNode
    }
  }

  const selectedIds = useViewer.getState().selection.selectedIds
  if (selectedIds.length === 1) {
    const node = useScene.getState().nodes[selectedIds[0] as AnyNodeId]
    if (node?.type === 'cad-sketch') {
      return node
    }
  }

  return null
}

export const ensureActiveCadSketch = (
  position?: [number, number, number],
): CadSketchNode | null => {
  const sketch = getActiveCadSketch()
  if (sketch) return sketch

  const { tool } = useEditor.getState()
  const createdSketch = useCad.getState().createDefaultSketch(position)
  if (!createdSketch) return null

  // Keep drawing tools armed when the first click also has to create the sketch.
  if (tool) {
    useEditor.getState().setMode('build')
    useEditor.getState().setTool(tool)
  }

  return createdSketch
}

export const appendEntitiesToActiveSketch = ({
  closedProfileEntityIds = [],
  entities,
}: SketchEntityAppender): string | null => {
  const sketch = getActiveCadSketch()
  if (!sketch) return null

  useScene.getState().updateNode(sketch.id as AnyNodeId, {
    editStatus: 'editing',
    entities: [...sketch.entities, ...entities],
    closedProfileEntityIds: [...sketch.closedProfileEntityIds, ...closedProfileEntityIds],
  } as Partial<CadSketchNode>)

  useEditor.getState().setActiveSketchId(sketch.id)
  return sketch.id
}

export const createCadEntityId = () => generateId('cse')

export const useCadGridCursor = (
  onGridClick: (position: [number, number, number], event: GridEvent) => void,
  options: {
    resolvePosition?: GridPositionResolver
  } = {},
) => {
  const cursorRef = useRef<Group>(null)
  const lastGridPositionRef = useRef<[number, number, number]>([0, cursorHeightOffset, 0])
  const resolvePosition = options.resolvePosition

  useEffect(() => {
    const onGridMove = (event: GridEvent) => {
      const rawPosition: [number, number, number] = [
        Math.round(event.position[0] * 2) / 2,
        event.position[1] + cursorHeightOffset,
        Math.round(event.position[2] * 2) / 2,
      ]
      const nextPosition = resolvePosition ? resolvePosition(rawPosition, event) : rawPosition
      lastGridPositionRef.current = nextPosition

      if (cursorRef.current) {
        cursorRef.current.position.copy(new Vector3(...nextPosition))
      }
    }

    const handleGridClick = (event: GridEvent) => {
      onGridClick(lastGridPositionRef.current, event)
    }

    emitter.on('grid:move', onGridMove)
    emitter.on('grid:click', handleGridClick)

    return () => {
      emitter.off('grid:move', onGridMove)
      emitter.off('grid:click', handleGridClick)
    }
  }, [onGridClick, resolvePosition])

  return cursorRef
}
