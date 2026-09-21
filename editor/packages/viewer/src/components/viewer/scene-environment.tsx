'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { themeFromViewerAppearance } from '../../lib/scene-themes'
import useViewer from '../../store/use-viewer'

/**
 * Procedural gradient-sky IBL from pascalorg/editor main.
 * Cool zenith / warm horizon / ground bounce — used as environment only.
 */

const ZENITH = [0.4, 0.56, 0.78] as const
const HORIZON = [0.95, 0.84, 0.66] as const
const GROUND = [0.38, 0.35, 0.3] as const

const ENV_INTENSITY = 0.6
const ENV_INTENSITY_DARK = 0.2
const WIDTH = 64
const HEIGHT = 32

function buildGradientSky(): THREE.DataTexture {
  const data = new Float32Array(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    const lat = ((y + 0.5) / HEIGHT) * 2 - 1
    let r: number
    let g: number
    let b: number
    if (lat <= 0) {
      const k = 1 + lat * 0.35
      r = GROUND[0] * k
      g = GROUND[1] * k
      b = GROUND[2] * k
    } else {
      const t = lat ** 0.65
      r = HORIZON[0] + (ZENITH[0] - HORIZON[0]) * t
      g = HORIZON[1] + (ZENITH[1] - HORIZON[1]) * t
      b = HORIZON[2] + (ZENITH[2] - HORIZON[2]) * t
    }
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 1
    }
  }
  const texture = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat, THREE.FloatType)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.LinearSRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export function SceneEnvironment() {
  const scene = useThree((state) => state.scene)
  const texture = useMemo(buildGradientSky, [])
  const appearance = useViewer((state) => themeFromViewerAppearance(state.theme).appearance)

  useEffect(() => {
    const prevEnvironment = scene.environment
    const prevIntensity = scene.environmentIntensity
    scene.environment = texture
    return () => {
      if (scene.environment === texture) {
        scene.environment = prevEnvironment
        scene.environmentIntensity = prevIntensity
      }
      texture.dispose()
    }
  }, [scene, texture])

  useEffect(() => {
    scene.environmentIntensity = appearance === 'dark' ? ENV_INTENSITY_DARK : ENV_INTENSITY
  }, [appearance, scene])

  return null
}
