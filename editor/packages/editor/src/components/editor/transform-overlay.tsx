'use client'

import { getCadBodyTransform, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { TransformControls } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Box3, Euler, Matrix4, Quaternion, Vector3, type Group, type Object3D } from 'three'
import {
  getTransformCapabilities,
  getTransformTargetNode,
  isFullTransformTargetNode,
  resolveTransformTargetFromSelection,
  type FullTransformTargetNode,
  type TransformTarget,
} from '../../lib/transform-target'
import useEditor from '../../store/use-editor'

const translationSnap = 0.1
const rotationSnap = Math.PI / 12
const scaleSnap = 0.1
const minUniformScale = 0.01
const identityMatrix = new Matrix4()

const tempBox = new Box3()
const tempCenter = new Vector3()
const tempPosition = new Vector3()
const tempQuaternion = new Quaternion()
const tempScale = new Vector3()
const tempParentWorld = new Matrix4()
const tempParentInverse = new Matrix4()
const tempObjectLocal = new Matrix4()
const tempObjectWorld = new Matrix4()
const tempProxyWorld = new Matrix4()
const tempDeltaWorld = new Matrix4()
const tempNextObjectWorld = new Matrix4()
const tempNextObjectLocal = new Matrix4()
const tempEuler = new Euler()

const isSameTarget = (a: TransformTarget | null, b: TransformTarget | null) =>
  a?.kind === b?.kind && a?.nodeId === b?.nodeId

const getNodePosition = (node: FullTransformTargetNode) =>
  node.type === 'cad-body' ? getCadBodyTransform(node).position : node.position

const getNodeRotation = (node: FullTransformTargetNode) =>
  node.type === 'cad-body' ? getCadBodyTransform(node).rotation : node.rotation

const getNodeScaleVector = (node: FullTransformTargetNode) => {
  if (node.type === 'item') {
    return new Vector3(node.scale[0], node.scale[1], node.scale[2])
  }

  if (node.type === 'cad-body') {
    const transform = getCadBodyTransform(node)
    return new Vector3(transform.scale[0], transform.scale[1], transform.scale[2])
  }

  return new Vector3(node.scale, node.scale, node.scale)
}

const getNodeQuaternion = (node: FullTransformTargetNode) =>
  new Quaternion().setFromEuler(
    new Euler(getNodeRotation(node)[0], getNodeRotation(node)[1], getNodeRotation(node)[2], 'XYZ'),
  )

const buildObjectWorldMatrix = (node: FullTransformTargetNode) => {
  const parentObject = node.parentId ? sceneRegistry.nodes.get(node.parentId) : null
  const position = getNodePosition(node)
  tempParentWorld.copy(parentObject?.matrixWorld ?? identityMatrix)
  tempObjectLocal.compose(
    tempPosition.set(position[0], position[1], position[2]),
    getNodeQuaternion(node),
    getNodeScaleVector(node),
  )
  return tempObjectWorld.multiplyMatrices(tempParentWorld, tempObjectLocal)
}

const buildPivotWorldMatrix = (
  node: FullTransformTargetNode,
  pivot: 'bounds-center' | 'asset-origin',
) => {
  const objectWorld = buildObjectWorldMatrix(node).clone()

  if (pivot === 'asset-origin') {
    return objectWorld
  }

  const object = sceneRegistry.nodes.get(node.id)
  if (!object) {
    return objectWorld
  }

  tempBox.setFromObject(object)
  if (tempBox.isEmpty()) {
    return objectWorld
  }

  tempBox.getCenter(tempCenter)
  objectWorld.setPosition(tempCenter)
  return objectWorld
}

const getUniformScale = (scale: Vector3, currentScale: number) => {
  const baseline = Math.max(currentScale, minUniformScale)
  const deltas = [scale.x, scale.y, scale.z].map((value) => Math.abs(value / baseline - 1))
  const dominantAxis = deltas.indexOf(Math.max(...deltas))
  const nextScale = [scale.x, scale.y, scale.z][dominantAxis] ?? baseline
  return Math.max(minUniformScale, nextScale)
}

export function TransformOverlay() {
  const nodes = useScene((s) => s.nodes)
  const selection = useViewer((s) => s.selection)
  const mode = useEditor((s) => s.mode)
  const movingNode = useEditor((s) => s.movingNode)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const transformMode = useEditor((s) => s.transformMode)
  const transformTarget = useEditor((s) => s.transformTarget)
  const transformPivot = useEditor((s) => s.transformPivot)
  const setTransformMode = useEditor((s) => s.setTransformMode)
  const setTransformTarget = useEditor((s) => s.setTransformTarget)

  const proxyRef = useRef<Group>(null)
  const draggingRef = useRef(false)
  const baselineProxyWorldRef = useRef(new Matrix4())
  const baselineObjectWorldRef = useRef(new Matrix4())

  const resolvedSelectionTarget = useMemo(
    () =>
      mode === 'select' && !movingNode && !isPreviewMode
        ? resolveTransformTargetFromSelection({
            nodes,
            selectedIds: selection.selectedIds,
            selectedReferenceId,
          })
        : null,
    [isPreviewMode, mode, movingNode, nodes, selectedReferenceId, selection.selectedIds],
  )

  useEffect(() => {
    if (!isSameTarget(transformTarget, resolvedSelectionTarget)) {
      setTransformTarget(resolvedSelectionTarget)
    }
  }, [resolvedSelectionTarget, setTransformTarget, transformTarget])

  const targetNode = useMemo(
    () => getTransformTargetNode(nodes, transformTarget),
    [nodes, transformTarget],
  )
  const gizmoNode = useMemo(
    () => (targetNode && isFullTransformTargetNode(targetNode) ? targetNode : null),
    [targetNode],
  )
  const capabilities = useMemo(
    () => (targetNode ? getTransformCapabilities(targetNode) : null),
    [targetNode],
  )

  useEffect(() => {
    if (!(targetNode && capabilities && !capabilities.gizmo && transformMode !== 'move')) {
      return
    }
    setTransformMode('move')
  }, [capabilities, setTransformMode, targetNode, transformMode])

  useLayoutEffect(() => {
    if (!(proxyRef.current && gizmoNode) || draggingRef.current) return

    const pivotWorld = buildPivotWorldMatrix(gizmoNode, transformPivot)
    pivotWorld.decompose(proxyRef.current.position, proxyRef.current.quaternion, proxyRef.current.scale)
    proxyRef.current.updateMatrixWorld(true)
  }, [gizmoNode, transformPivot])

  const updateNodeFromProxy = () => {
    if (!(proxyRef.current && gizmoNode)) return

    proxyRef.current.updateMatrixWorld(true)
    tempProxyWorld.copy(proxyRef.current.matrixWorld)
    tempDeltaWorld.copy(tempProxyWorld).multiply(baselineProxyWorldRef.current.clone().invert())
    tempNextObjectWorld.copy(tempDeltaWorld).multiply(baselineObjectWorldRef.current)

    const parentObject = gizmoNode.parentId ? sceneRegistry.nodes.get(gizmoNode.parentId) : null
    tempParentWorld.copy(parentObject?.matrixWorld ?? identityMatrix)
    tempParentInverse.copy(tempParentWorld).invert()
    tempNextObjectLocal.multiplyMatrices(tempParentInverse, tempNextObjectWorld)
    tempNextObjectLocal.decompose(tempPosition, tempQuaternion, tempScale)

    tempEuler.setFromQuaternion(tempQuaternion, 'XYZ')

    const updates =
      gizmoNode.type === 'item'
        ? {
            position: [tempPosition.x, tempPosition.y, tempPosition.z] as [number, number, number],
            rotation: [tempEuler.x, tempEuler.y, tempEuler.z] as [number, number, number],
            scale: [tempScale.x, tempScale.y, tempScale.z] as [number, number, number],
          }
        : gizmoNode.type === 'cad-body'
          ? {
              transform: {
                position: [tempPosition.x, tempPosition.y, tempPosition.z] as [
                  number,
                  number,
                  number,
                ],
                rotation: [tempEuler.x, tempEuler.y, tempEuler.z] as [number, number, number],
                scale: [tempScale.x, tempScale.y, tempScale.z] as [number, number, number],
              },
            }
          : {
              position: [tempPosition.x, tempPosition.y, tempPosition.z] as [number, number, number],
              rotation: [tempEuler.x, tempEuler.y, tempEuler.z] as [number, number, number],
              scale: getUniformScale(tempScale, gizmoNode.scale),
            }

    useScene.getState().updateNode(gizmoNode.id, updates)
  }

  const beginTransformSession = () => {
    if (!gizmoNode) return

    draggingRef.current = true
    baselineProxyWorldRef.current.copy(buildPivotWorldMatrix(gizmoNode, transformPivot))
    baselineObjectWorldRef.current.copy(buildObjectWorldMatrix(gizmoNode))
    useViewer.getState().setCameraDragging(true)
    useScene.temporal.getState().pause()
  }

  const endTransformSession = () => {
    if (!draggingRef.current) return

    draggingRef.current = false
    useViewer.getState().setCameraDragging(false)
    useScene.temporal.getState().resume()
  }

  const handleMouseDown = () => {
    beginTransformSession()
  }

  const handleMouseUp = () => {
    endTransformSession()
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const dev = (window as any).__PASCAL_DEV__
    if (!dev) return

    dev.transformOverlay = {
      getTargetId: () => gizmoNode?.id ?? null,
      hasGizmo: () => Boolean(gizmoNode && capabilities?.gizmo),
      nudgeBy: (delta: [number, number, number]) => {
        if (!(proxyRef.current && gizmoNode)) return false

        beginTransformSession()
        proxyRef.current.position.x += delta[0]
        proxyRef.current.position.y += delta[1]
        proxyRef.current.position.z += delta[2]
        proxyRef.current.updateMatrixWorld(true)
        updateNodeFromProxy()
        endTransformSession()
        return true
      },
    }

    return () => {
      if ((window as any).__PASCAL_DEV__?.transformOverlay === dev.transformOverlay) {
        delete (window as any).__PASCAL_DEV__.transformOverlay
      }
    }
  }, [beginTransformSession, capabilities?.gizmo, endTransformSession, gizmoNode, updateNodeFromProxy])

  if (!(gizmoNode && capabilities?.gizmo && mode === 'select' && !movingNode && !isPreviewMode)) {
    return null
  }

  return (
    <>
      <group ref={proxyRef} visible={false} />
      <TransformControls
        mode={transformMode === 'move' ? 'translate' : transformMode}
        object={proxyRef as RefObject<Object3D>}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onObjectChange={updateNodeFromProxy}
        rotationSnap={rotationSnap}
        scaleSnap={scaleSnap}
        space={transformMode === 'move' ? 'world' : 'local'}
        translationSnap={translationSnap}
      />
    </>
  )
}
