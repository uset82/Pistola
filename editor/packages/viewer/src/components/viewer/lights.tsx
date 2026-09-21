import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
} from 'three/webgpu'
import * as THREE from 'three/webgpu'
import { themeFromViewerAppearance } from '../../lib/scene-themes'
import useViewer from '../../store/use-viewer'

const MAX_SHADOW_INTENSITY = 0.75
const SHADOW_DEPTH_BIAS = -0.0005
const SHADOW_NORMAL_BIAS = 0.08

/**
 * Sun-dominant lighting from pascalorg/editor main, mapped onto the local
 * light/dark theme toggle via studio / night scene themes.
 */
export function Lights() {
  const themeToggle = useViewer((state) => state.theme)
  const theme = useMemo(() => themeFromViewerAppearance(themeToggle), [themeToggle])

  const keyRef = useRef<DirectionalLight>(null)
  const fillRef = useRef<DirectionalLight>(null)
  const hemiRef = useRef<HemisphereLight>(null)
  const ambientRef = useRef<AmbientLight>(null)
  const shadowCamera = useRef<OrthographicCamera>(null)
  const shadowCameraSize = 50
  const initialized = useRef(false)

  const targets = useMemo(
    () => ({
      keyColor: new THREE.Color(),
      fillColor: new THREE.Color(),
      ambColor: new THREE.Color(),
      hemiSky: new THREE.Color(),
      hemiGround: new THREE.Color(),
    }),
    [],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1) * 4
    const key = theme.lights[0]
    const fill = theme.lights[1]
    const hemi = theme.hemi

    if (!initialized.current) {
      if (keyRef.current && key) {
        keyRef.current.intensity = key.intensity
        keyRef.current.color.set(key.color)
        if (keyRef.current.shadow) {
          keyRef.current.shadow.intensity = Math.min(MAX_SHADOW_INTENSITY, key.intensity > 2 ? 0.75 : 0.55)
          keyRef.current.shadow.bias = SHADOW_DEPTH_BIAS
          keyRef.current.shadow.normalBias = SHADOW_NORMAL_BIAS
        }
      }
      if (fillRef.current && fill) {
        fillRef.current.intensity = fill.intensity
        fillRef.current.color.set(fill.color)
      }
      if (ambientRef.current) {
        ambientRef.current.intensity = theme.ambient.intensity
        ambientRef.current.color.set(theme.ambient.color)
      }
      if (hemiRef.current && hemi) {
        hemiRef.current.intensity = hemi.intensity
        hemiRef.current.color.set(hemi.sky)
        hemiRef.current.groundColor.set(hemi.ground)
      }
      initialized.current = true
      return
    }

    if (keyRef.current && key) {
      keyRef.current.intensity = THREE.MathUtils.lerp(keyRef.current.intensity, key.intensity, dt)
      targets.keyColor.set(key.color)
      keyRef.current.color.lerp(targets.keyColor, dt)
      if (keyRef.current.shadow?.intensity !== undefined) {
        keyRef.current.shadow.intensity = THREE.MathUtils.lerp(
          keyRef.current.shadow.intensity,
          Math.min(MAX_SHADOW_INTENSITY, key.intensity > 2 ? 0.75 : 0.55),
          dt,
        )
      }
    }

    if (fillRef.current && fill) {
      fillRef.current.intensity = THREE.MathUtils.lerp(fillRef.current.intensity, fill.intensity, dt)
      targets.fillColor.set(fill.color)
      fillRef.current.color.lerp(targets.fillColor, dt)
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity,
        theme.ambient.intensity,
        dt,
      )
      targets.ambColor.set(theme.ambient.color)
      ambientRef.current.color.lerp(targets.ambColor, dt)
    }

    if (hemiRef.current && hemi) {
      hemiRef.current.intensity = THREE.MathUtils.lerp(hemiRef.current.intensity, hemi.intensity, dt)
      targets.hemiSky.set(hemi.sky)
      targets.hemiGround.set(hemi.ground)
      hemiRef.current.color.lerp(targets.hemiSky, dt)
      hemiRef.current.groundColor.lerp(targets.hemiGround, dt)
    }
  })

  useEffect(() => {
    initialized.current = false
  }, [theme.id])

  const key = theme.lights[0] ?? {
    position: [10, 10, 10] as [number, number, number],
    color: '#ffffff',
    intensity: 4,
    castShadow: true,
  }
  const fill = theme.lights[1]

  return (
    <>
      <directionalLight
        castShadow={key.castShadow !== false}
        position={key.position}
        ref={keyRef}
        shadow-bias={SHADOW_DEPTH_BIAS}
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
        shadow-radius={2}
      >
        <orthographicCamera
          attach="shadow-camera"
          bottom={-shadowCameraSize}
          far={100}
          left={-shadowCameraSize}
          near={1}
          ref={shadowCamera}
          right={shadowCameraSize}
          top={shadowCameraSize}
        />
      </directionalLight>

      {fill && <directionalLight position={fill.position} ref={fillRef} />}

      {theme.hemi && (
        <hemisphereLight
          args={[theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity]}
          ref={hemiRef}
        />
      )}

      <ambientLight ref={ambientRef} />
    </>
  )
}
