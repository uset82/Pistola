'use client'

import { sceneRegistry } from '@pascal-app/core'
import { requestPipelineCapture, snapLevelsToTruePositions } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { subscribeSceneCaptures, takeSceneCapture } from '../../lib/render/capture-registry'

/**
 * Renders a requested view into an offscreen canvas. The live camera object is
 * only read, and editor helpers stay on EDITOR_LAYER so they are not captured.
 */
export const SceneCapture = () => {
  const liveCamera = useThree((state) => state.camera)

  useEffect(() => {
    let stopped = false

    const pump = async () => {
      if (stopped) return
      const next = takeSceneCapture()
      if (!next) return
      let restoreLevels = () => {}
      const visibility = new Map<string, boolean>()
      try {
        const { width, height } = next.request
        const pose = next.request.pose
        const captureCamera = new THREE.PerspectiveCamera(pose.fov, 1, 0.05, 10_000)
        if (pose.live) {
          captureCamera.position.copy(liveCamera.position)
          captureCamera.quaternion.copy(liveCamera.quaternion)
          captureCamera.up.copy(liveCamera.up)
          if (liveCamera instanceof THREE.PerspectiveCamera) captureCamera.fov = liveCamera.fov
        } else {
          captureCamera.position.set(pose.position[0], pose.position[1], pose.position[2])
          captureCamera.up.set(pose.up[0], pose.up[1], pose.up[2])
          captureCamera.lookAt(pose.target[0], pose.target[1], pose.target[2])
          if (pose.projection === 'orthographic') {
            const distance = Math.hypot(
              pose.position[0] - pose.target[0],
              pose.position[1] - pose.target[1],
              pose.position[2] - pose.target[2],
            )
            const half = pose.orthoHalfHeight ?? 1
            captureCamera.fov = (2 * Math.atan(half / Math.max(distance, 0.001)) * 180) / Math.PI
          } else {
            captureCamera.fov = pose.fov
          }
        }
        captureCamera.near = 0.05
        captureCamera.far = 10_000
        captureCamera.updateProjectionMatrix()
        captureCamera.updateMatrixWorld()

        restoreLevels = snapLevelsToTruePositions()
        for (const type of ['scan', 'guide'] as const) {
          sceneRegistry.byType[type].forEach((id) => {
            const object = sceneRegistry.nodes.get(id)
            if (!object) return
            visibility.set(id, object.visible)
            object.visible = false
          })
        }

        const quaternion = captureCamera.quaternion
        const frame = await requestPipelineCapture({
          position: [captureCamera.position.x, captureCamera.position.y, captureCamera.position.z],
          quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
          fov: captureCamera.fov,
          near: captureCamera.near,
          far: captureCamera.far,
        })

        const output = document.createElement('canvas')
        output.width = width
        output.height = height
        const context = output.getContext('2d')
        if (!context) throw new Error('Could not create a capture canvas.')
        const source = document.createElement('canvas')
        source.width = frame.width
        source.height = frame.height
        const sourceContext = source.getContext('2d')
        if (!sourceContext) throw new Error('Could not create a capture canvas.')
        const bitmap = new Uint8ClampedArray(frame.pixels.length)
        bitmap.set(frame.pixels)
        sourceContext.putImageData(new ImageData(bitmap, frame.width, frame.height), 0, 0)
        context.drawImage(source, 0, 0, width, height)

        const position = captureCamera.position
        const lookTarget = new THREE.Vector3()
        captureCamera.getWorldDirection(lookTarget)
        lookTarget.add(position)
        next.resolve({
          dataUrl: output.toDataURL('image/png'),
          camera: {
            position: [position.x, position.y, position.z],
            target: pose.live
              ? [lookTarget.x, lookTarget.y, lookTarget.z]
              : [pose.target[0], pose.target[1], pose.target[2]],
            up: [captureCamera.up.x, captureCamera.up.y, captureCamera.up.z],
            fov: captureCamera instanceof THREE.PerspectiveCamera ? captureCamera.fov : pose.fov,
            projection: pose.live ? 'perspective' : pose.projection,
          },
          bounds: next.bounds,
        })
      } catch (error) {
        next.reject(error instanceof Error ? error : new Error(String(error)))
      } finally {
        restoreLevels()
        visibility.forEach((wasVisible, id) => {
          const object = sceneRegistry.nodes.get(id)
          if (object) object.visible = wasVisible
        })
      }
      void pump()
    }

    pump()
    const unsubscribe = subscribeSceneCaptures(() => {
      queueMicrotask(pump)
    })
    return () => {
      stopped = true
      unsubscribe()
    }
  }, [liveCamera])

  return null
}
