'use client'

import { type CameraControlEvent, emitter, sceneRegistry, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Box3, Vector3 } from 'three'
import { EDITOR_LAYER } from '../../lib/constants'
import useEditor from '../../store/use-editor'

const currentTarget = new Vector3()
const tempBox = new Box3()
const tempCenter = new Vector3()
const tempSize = new Vector3()

const FIT_NODE_TYPES = [
  'wall',
  'item',
  'slab',
  'zone',
  'roof',
  'roof-segment',
  'window',
  'door',
  'ceiling',
  'cad-body',
  'cad-instance',
  'cad-sketch',
] as const

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export const CustomCameraControls = () => {
  const controls = useRef<CameraControlsImpl>(null!)
  const isPreviewMode = useEditor((s) => s.isPreviewMode)
  const selection = useViewer((s) => s.selection)
  const currentLevelId = selection.levelId
  const firstLoad = useRef(true)

  const camera = useThree((state) => state.camera)
  const raycaster = useThree((state) => state.raycaster)
  useEffect(() => {
    camera.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(EDITOR_LAYER)
    raycaster.layers.enable(2)
  }, [camera, raycaster])

  useEffect(() => {
    if (isPreviewMode) return // Preview mode uses auto-navigate instead
    let targetY = 0
    if (currentLevelId) {
      const levelMesh = sceneRegistry.nodes.get(currentLevelId)
      if (levelMesh) {
        targetY = levelMesh.position.y
      }
    }
    if (firstLoad.current) {
      firstLoad.current = false
      const workspace = useViewer.getState().activeWorkspace
      const saved = useViewer.getState().worldCameras[workspace]
      if (saved) {
        ;(controls.current as CameraControlsImpl).setLookAt(
          saved.position[0],
          saved.position[1],
          saved.position[2],
          saved.target[0],
          saved.target[1],
          saved.target[2],
          true,
        )
      } else if (workspace === 'cad') {
        ;(controls.current as CameraControlsImpl).setLookAt(8, 6, 8, 0, 0, 0, true)
      } else {
        ;(controls.current as CameraControlsImpl).setLookAt(20, 20, 20, 0, 0, 0, true)
      }
    }
    if (useViewer.getState().activeWorkspace === 'cad') return
    ;(controls.current as CameraControlsImpl).getTarget(currentTarget)
    ;(controls.current as CameraControlsImpl).moveTo(
      currentTarget.x,
      targetY,
      currentTarget.z,
      true,
    )
  }, [currentLevelId, isPreviewMode])

  const activeWorkspace = useViewer((state) => state.activeWorkspace)
  const previousWorkspace = useRef(activeWorkspace)
  useEffect(() => {
    if (!controls.current || isPreviewMode) return
    if (previousWorkspace.current === activeWorkspace) return

    const position = new Vector3()
    const target = new Vector3()
    controls.current.getPosition(position)
    controls.current.getTarget(target)
    useViewer.getState().setWorldCamera(previousWorkspace.current, {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
    })

    const saved = useViewer.getState().worldCameras[activeWorkspace]
    if (saved) {
      controls.current.setLookAt(
        saved.position[0],
        saved.position[1],
        saved.position[2],
        saved.target[0],
        saved.target[1],
        saved.target[2],
        true,
      )
    } else if (activeWorkspace === 'cad') {
      controls.current.setLookAt(8, 6, 8, 0, 0, 0, true)
    } else {
      controls.current.setLookAt(20, 20, 20, 0, 0, 0, true)
    }

    previousWorkspace.current = activeWorkspace
  }, [activeWorkspace, isPreviewMode])

  // Configure mouse buttons based on control mode and camera mode
  const cameraMode = useViewer((state) => state.cameraMode)
  const mouseButtons = useMemo(() => {
    // Use ZOOM for orthographic camera, DOLLY for perspective camera
    const wheelAction =
      cameraMode === 'orthographic'
        ? CameraControlsImpl.ACTION.ZOOM
        : CameraControlsImpl.ACTION.DOLLY

    return {
      left: isPreviewMode ? CameraControlsImpl.ACTION.SCREEN_PAN : CameraControlsImpl.ACTION.NONE,
      middle: CameraControlsImpl.ACTION.SCREEN_PAN,
      right: CameraControlsImpl.ACTION.ROTATE,
      wheel: wheelAction,
    }
  }, [cameraMode, isPreviewMode])

  useEffect(() => {
    const keyState = {
      shiftRight: false,
      shiftLeft: false,
      controlRight: false,
      controlLeft: false,
      space: false,
    }

    const updateConfig = () => {
      if (!controls.current) return

      const shift = keyState.shiftRight || keyState.shiftLeft
      const control = keyState.controlRight || keyState.controlLeft
      const space = keyState.space

      const wheelAction =
        cameraMode === 'orthographic'
          ? CameraControlsImpl.ACTION.ZOOM
          : CameraControlsImpl.ACTION.DOLLY
      controls.current.mouseButtons.wheel = wheelAction
      controls.current.mouseButtons.middle = CameraControlsImpl.ACTION.SCREEN_PAN
      controls.current.mouseButtons.right = CameraControlsImpl.ACTION.ROTATE
      if (isPreviewMode) {
        // In preview mode, left-click is always pan (viewer-style)
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.SCREEN_PAN
      } else if (space) {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.SCREEN_PAN
      } else {
        controls.current.mouseButtons.left = CameraControlsImpl.ACTION.NONE
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        keyState.space = true
        document.body.style.cursor = 'grab'
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = true
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = true
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = true
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = true
      }
      updateConfig()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        keyState.space = false
        document.body.style.cursor = ''
      }
      if (event.code === 'ShiftRight') {
        keyState.shiftRight = false
      }
      if (event.code === 'ShiftLeft') {
        keyState.shiftLeft = false
      }
      if (event.code === 'ControlRight') {
        keyState.controlRight = false
      }
      if (event.code === 'ControlLeft') {
        keyState.controlLeft = false
      }
      updateConfig()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    updateConfig()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [cameraMode, isPreviewMode])

  // Preview mode: auto-navigate camera to selected node (viewer behavior)
  const previewTargetNodeId = isPreviewMode
    ? (selection.zoneId ?? selection.levelId ?? selection.buildingId)
    : null

  useEffect(() => {
    if (!(isPreviewMode && controls.current)) return

    const nodes = useScene.getState().nodes
    let node = previewTargetNodeId ? nodes[previewTargetNodeId] : null

    if (!previewTargetNodeId) {
      const site = Object.values(nodes).find((n) => n.type === 'site')
      node = site || null
    }
    if (!node) return

    // Check if node has a saved camera
    if (node.camera) {
      const { position, target } = node.camera
      requestAnimationFrame(() => {
        if (!controls.current) return
        controls.current.setLookAt(
          position[0],
          position[1],
          position[2],
          target[0],
          target[1],
          target[2],
          true,
        )
      })
      return
    }

    if (!previewTargetNodeId) return

    // Calculate camera position from bounding box
    const object3D = sceneRegistry.nodes.get(previewTargetNodeId)
    if (!object3D) return

    tempBox.setFromObject(object3D)
    tempBox.getCenter(tempCenter)
    tempBox.getSize(tempSize)

    const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z)
    const distance = Math.max(maxDim * 2, 15)

    controls.current.setLookAt(
      tempCenter.x + distance * 0.7,
      tempCenter.y + distance * 0.5,
      tempCenter.z + distance * 0.7,
      tempCenter.x,
      tempCenter.y,
      tempCenter.z,
      true,
    )
  }, [isPreviewMode, previewTargetNodeId])

  useEffect(() => {
    const handleNodeCapture = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const position = new Vector3()
      const target = new Vector3()
      controls.current.getPosition(position)
      controls.current.getTarget(target)

      const state = useScene.getState()

      state.updateNode(nodeId, {
        camera: {
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z],
          mode: useViewer.getState().cameraMode,
        },
      })
    }
    const handleNodeView = ({ nodeId }: CameraControlEvent) => {
      if (!controls.current) return

      const node = useScene.getState().nodes[nodeId]
      if (!(node && node.camera)) return
      const { position, target } = node.camera

      controls.current.setLookAt(
        position[0],
        position[1],
        position[2],
        target[0],
        target[1],
        target[2],
        true,
      )
    }

    const handleTopView = () => {
      if (!controls.current) return

      const currentPolarAngle = controls.current.polarAngle

      // Toggle: if already near top view (< 0.1 radians ≈ 5.7°), go back to 45°
      // Otherwise, go to top view (0°)
      const targetAngle = currentPolarAngle < 0.1 ? Math.PI / 4 : 0

      controls.current.rotatePolarTo(targetAngle, true)
    }

    const handleOrbitCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded - Math.PI / 2

      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleOrbitCCW = () => {
      if (!controls.current) return

      const currentAzimuth = controls.current.azimuthAngle
      const currentPolar = controls.current.polarAngle
      // Round to nearest 90° increment, then rotate 90° counter-clockwise
      const rounded = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2)
      const target = rounded + Math.PI / 2

      controls.current.rotateTo(target, currentPolar, true)
    }

    const handleFrontView = () => {
      if (!controls.current) return
      controls.current.rotateTo(0, Math.PI / 2 - 0.2, true)
    }

    const handleDolly = ({ direction }: { direction: 'in' | 'out' }) => {
      if (!controls.current) return
      controls.current.dolly(direction === 'in' ? 2 : -2, true)
    }

    const handleTruck = ({ x, y }: { x: number; y: number }) => {
      if (!controls.current) return
      controls.current.truck(x, y, true)
    }

    const handleFit = () => {
      if (!controls.current) return

      const selectedIds = useViewer.getState().selection.selectedIds
      const ids =
        selectedIds.length > 0
          ? selectedIds
          : FIT_NODE_TYPES.flatMap((type) => [...sceneRegistry.byType[type]])
      const box = new Box3()
      let found = false

      for (const id of ids) {
        const object = sceneRegistry.nodes.get(id)
        if (!object) continue
        tempBox.setFromObject(object)
        if (tempBox.isEmpty()) continue
        box.union(tempBox)
        found = true
      }

      if (!found) {
        const workspace = useEditor.getState().workspace
        if (workspace === 'cad') {
          controls.current.setLookAt(8, 6, 8, 0, 0, 0, true)
        } else {
          controls.current.setLookAt(20, 20, 20, 0, 0, 0, true)
        }
        return
      }

      void controls.current.fitToBox(box, true, {
        paddingTop: 0.8,
        paddingBottom: 0.8,
        paddingLeft: 0.8,
        paddingRight: 0.8,
      })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        handleFit()
        return
      }
      if (event.key === '+' || event.key === '=' || event.key === 'Add') {
        event.preventDefault()
        handleDolly({ direction: 'in' })
        return
      }
      if (event.key === '-' || event.key === '_' || event.key === 'Subtract') {
        event.preventDefault()
        handleDolly({ direction: 'out' })
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        handleTruck({ x: 0, y: 1.25 })
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        handleTruck({ x: 0, y: -1.25 })
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handleTruck({ x: -1.25, y: 0 })
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleTruck({ x: 1.25, y: 0 })
        return
      }
      if (event.key === '[') {
        event.preventDefault()
        handleOrbitCCW()
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        handleOrbitCW()
      }
    }

    emitter.on('camera-controls:capture', handleNodeCapture)
    emitter.on('camera-controls:view', handleNodeView)
    emitter.on('camera-controls:top-view', handleTopView)
    emitter.on('camera-controls:front-view', handleFrontView)
    emitter.on('camera-controls:orbit-cw', handleOrbitCW)
    emitter.on('camera-controls:orbit-ccw', handleOrbitCCW)
    emitter.on('camera-controls:dolly', handleDolly)
    emitter.on('camera-controls:truck', handleTruck)
    emitter.on('camera-controls:fit', handleFit)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      emitter.off('camera-controls:capture', handleNodeCapture)
      emitter.off('camera-controls:view', handleNodeView)
      emitter.off('camera-controls:top-view', handleTopView)
      emitter.off('camera-controls:front-view', handleFrontView)
      emitter.off('camera-controls:orbit-cw', handleOrbitCW)
      emitter.off('camera-controls:orbit-ccw', handleOrbitCCW)
      emitter.off('camera-controls:dolly', handleDolly)
      emitter.off('camera-controls:truck', handleTruck)
      emitter.off('camera-controls:fit', handleFit)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const onTransitionStart = useCallback(() => {
    useViewer.getState().setCameraDragging(true)
  }, [])

  const onRest = useCallback(() => {
    useViewer.getState().setCameraDragging(false)
  }, [])

  return (
    <CameraControls
      makeDefault
      maxDistance={100}
      maxPolarAngle={Math.PI / 2 - 0.1}
      minDistance={10}
      minPolarAngle={0}
      mouseButtons={mouseButtons}
      onRest={onRest}
      onSleep={onRest}
      onTransitionStart={onTransitionStart}
      ref={controls}
      restThreshold={0.01}
    />
  )
}
