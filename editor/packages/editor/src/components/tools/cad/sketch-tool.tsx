import { getLevelFloorElevation, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useMemo } from 'react'
import useCad, { getSelectedCadLevelFloorY } from '../../../store/use-cad'
import useEditor from '../../../store/use-editor'
import { CursorSphere } from '../shared/cursor-sphere'
import { useCadGridCursor } from './shared'

export const SketchTool: React.FC = () => {
  const activeWorkplane = useEditor((state) => state.activeWorkplane)
  const createDefaultSketch = useCad((state) => state.createDefaultSketch)
  const levelId = useViewer((state) => state.selection.levelId)
  const nodes = useScene((state) => state.nodes)
  const levelPlaneY = useMemo(() => {
    if (!(activeWorkplane === 'level' && levelId)) return null
    const levelNode = nodes[levelId]
    if (levelNode?.type !== 'level') return null
    return getLevelFloorElevation(levelId, nodes) + 0.002
  }, [activeWorkplane, levelId, nodes])

  const handleGridClick = useCallback(
    (position: [number, number, number]) => {
      createDefaultSketch(position)
    },
    [createDefaultSketch],
  )

  const resolveCursorPosition = useCallback(
    (position: [number, number, number]) => {
      if (activeWorkplane !== 'level') return position
      return [position[0], getSelectedCadLevelFloorY() + 0.01, position[2]] as [
        number,
        number,
        number,
      ]
    },
    [activeWorkplane],
  )

  const cursorRef = useCadGridCursor(handleGridClick, {
    resolvePosition: resolveCursorPosition,
  })

  return (
    <>
      {levelPlaneY !== null && (
        <mesh position={[0, levelPlaneY, 0]} renderOrder={1} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[24, 24]} />
          <meshBasicMaterial color="#38bdf8" depthWrite={false} opacity={0.12} transparent />
        </mesh>
      )}
      <CursorSphere ref={cursorRef} />
    </>
  )
}
