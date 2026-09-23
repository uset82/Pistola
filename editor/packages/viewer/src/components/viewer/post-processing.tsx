import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Color, Layers, UnsignedByteType } from 'three'
import { outline } from 'three/addons/tsl/display/OutlineNode.js'
import { ssgi } from 'three/addons/tsl/display/SSGINode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js'
import {
  add,
  colorToDirection,
  diffuseColor,
  directionToColor,
  float,
  mix,
  mrt,
  normalView,
  oscSine,
  output,
  pass,
  sample,
  time,
  uniform,
  vec4,
  velocity,
} from 'three/tsl'
import { RenderPipeline, type WebGPURenderer, PerspectiveCamera } from 'three/webgpu'
import { SCENE_LAYER, ZONE_LAYER } from '../../lib/layers'
import { holdPipelineCapture, releasePipelineCapture, takePipelineCapture } from '../../lib/pipeline-capture'
import useViewer from '../../store/use-viewer'

// SSGI Parameters — laptop-budget values from pascalorg/editor main lighting pass
export const SSGI_PARAMS = {
  enabled: true,
  sliceCount: 2,
  stepCount: 6,
  radius: 1.6,
  expFactor: 1.5,
  thickness: 0.5,
  backfaceLighting: 0.5,
  aoIntensity: 1.7,
  giIntensity: 2,
  useLinearThickness: false,
  useScreenSpaceSampling: true,
  useTemporalFiltering: true,
}

const MAX_PIPELINE_RETRIES = 3
const RETRY_DELAY_MS = 500

const DARK_BG = '#1f2433'
const LIGHT_BG = '#ffffff'

const PostProcessingPasses = () => {
  const { gl: renderer, scene, camera } = useThree()
  const renderPipelineRef = useRef<RenderPipeline | null>(null)
  const hasPipelineErrorRef = useRef(false)
  const retryCountRef = useRef(0)
  const [isInitialized, setIsInitialized] = useState(false)

  // Background color uniform — updated every frame via lerp, read by the TSL pipeline.
  // Initialised from the current theme so there's no flash on first render.
  const initBg = useViewer.getState().theme === 'dark' ? DARK_BG : LIGHT_BG
  const bgUniform = useRef(uniform(new Color(initBg)))
  const bgCurrent = useRef(new Color(initBg))
  const bgTarget = useRef(new Color())

  const zoneLayers = useMemo(() => {
    const l = new Layers()
    l.enable(ZONE_LAYER)
    l.disable(SCENE_LAYER)
    return l
  }, [])

  // Subscribe to projectId so the pipeline rebuilds on project switch
  const projectId = useViewer((s) => s.projectId)

  // Bump this to force a pipeline rebuild (used by retry logic)
  const [pipelineVersion, setPipelineVersion] = useState(0)

  const requestPipelineRebuild = useCallback(() => {
    setPipelineVersion((v) => v + 1)
  }, [])

  // Renderer initialization

  useEffect(() => {
    let mounted = true

    const initRenderer = async () => {
      try {
        if (renderer && (renderer as any).init) {
          await (renderer as any).init()
        }

        if (mounted) {
          setIsInitialized(true)
        }
      } catch (error) {
        console.error('[viewer] Failed to initialize renderer for post-processing.', error)
        if (mounted) {
          setIsInitialized(false)
        }
      }
    }

    initRenderer()

    return () => {
      mounted = false
    }
  }, [renderer])

  // Reset retry count when project changes
  useEffect(() => {
    retryCountRef.current = 0
  }, [])

  // Build / rebuild the post-processing pipeline
  useEffect(() => {
    if (!(renderer && scene && camera && isInitialized)) {
      return
    }

    hasPipelineErrorRef.current = false

    // Clear outliner arrays synchronously to prevent stale Object3D refs
    // from the previous project leaking into the new pipeline's outline passes.
    const outliner = useViewer.getState().outliner
    outliner.selectedObjects.length = 0
    outliner.hoveredObjects.length = 0

    try {
      // Scene pass with MRT for SSGI
      const scenePass = pass(scene, camera)
      scenePass.setMRT(
        mrt({
          output,
          diffuseColor,
          normal: directionToColor(normalView),
          velocity,
        }),
      )

      // Get texture outputs
      const scenePassColor = scenePass.getTextureNode('output')
      const scenePassDiffuse = scenePass.getTextureNode('diffuseColor')
      const scenePassDepth = scenePass.getTextureNode('depth')
      const scenePassNormal = scenePass.getTextureNode('normal')
      const scenePassVelocity = scenePass.getTextureNode('velocity')

      // Optimize texture bandwidth
      const diffuseTexture = scenePass.getTexture('diffuseColor')
      diffuseTexture.type = UnsignedByteType

      const normalTexture = scenePass.getTexture('normal')
      normalTexture.type = UnsignedByteType

      // Extract normal from color-encoded texture
      const sceneNormal = sample((uv) => {
        return colorToDirection(scenePassNormal.sample(uv))
      })

      const zonePass = pass(scene, camera)
      zonePass.setLayers(zoneLayers)
      // SSGI Pass (cast to PerspectiveCamera for SSGI)
      const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera as any)

      giPass.sliceCount.value = SSGI_PARAMS.sliceCount
      giPass.stepCount.value = SSGI_PARAMS.stepCount
      giPass.radius.value = SSGI_PARAMS.radius
      giPass.expFactor.value = SSGI_PARAMS.expFactor
      giPass.thickness.value = SSGI_PARAMS.thickness
      giPass.backfaceLighting.value = SSGI_PARAMS.backfaceLighting
      giPass.aoIntensity.value = SSGI_PARAMS.aoIntensity
      giPass.giIntensity.value = SSGI_PARAMS.giIntensity
      giPass.useLinearThickness.value = SSGI_PARAMS.useLinearThickness
      giPass.useScreenSpaceSampling.value = SSGI_PARAMS.useScreenSpaceSampling
      giPass.useTemporalFiltering = SSGI_PARAMS.useTemporalFiltering

      const giTexture = (giPass as any).getTextureNode()

      // DenoiseNode only denoises RGB — alpha is passed through unchanged.
      // SSGI packs AO into alpha, so we remap it into RGB before denoising.
      // convertToTexture() inside denoise() will call rtt() on this vec4 node automatically.
      const aoAsRgb = vec4(giTexture.a, giTexture.a, giTexture.a, float(1))
      const denoisePass = denoise(aoAsRgb, scenePassDepth, sceneNormal, camera)
      denoisePass.index.value = 0
      denoisePass.radius.value = 4

      const gi = giPass.rgb
      const ao = (denoisePass as any).r
      // const gi = giPass.rgb;
      // const ao = giPass.a;

      // Background detection via alpha: renderer clears with alpha=0 (setClearAlpha(0) in useFrame),
      // so background pixels have scenePassColor.a=0 while geometry pixels have output.a=1.
      // WebGPU only applies clearColorValue to MRT attachment 0 (output), so scenePassColor.a
      // is the reliable geometry mask — no normals, no flicker.
      const hasGeometry = scenePassColor.a
      const contentAlpha = hasGeometry.max(zonePass.a)

      // Composite: scene * AO + diffuse * GI
      const compositePass = vec4(
        add(scenePassColor.rgb.mul(ao), add(zonePass.rgb, scenePassDiffuse.rgb.mul(gi))),
        contentAlpha,
      )

      function generateSelectedOutlinePass() {
        const edgeStrength = uniform(3)
        const edgeGlow = uniform(0)
        const edgeThickness = uniform(1)
        const visibleEdgeColor = uniform(new Color(0xff_ff_ff))
        const hiddenEdgeColor = uniform(new Color(0xf3_ff_47))

        const outlinePass = outline(scene, camera, {
          selectedObjects: useViewer.getState().outliner.selectedObjects,
          edgeGlow,
          edgeThickness,
        })
        const { visibleEdge, hiddenEdge } = outlinePass

        const outlineColor = visibleEdge
          .mul(visibleEdgeColor)
          .add(hiddenEdge.mul(hiddenEdgeColor))
          .mul(edgeStrength)

        return outlineColor
      }

      function generateHoverOutlinePass() {
        const edgeStrength = uniform(5)
        const edgeGlow = uniform(0.5)
        const edgeThickness = uniform(1.5)
        const pulsePeriod = uniform(3)
        const visibleEdgeColor = uniform(new Color(0x00_aa_ff))
        const hiddenEdgeColor = uniform(new Color(0xf3_ff_47))

        const outlinePass = outline(scene, camera, {
          selectedObjects: useViewer.getState().outliner.hoveredObjects,
          edgeGlow,
          edgeThickness,
        })
        const { visibleEdge, hiddenEdge } = outlinePass

        const period = time.div(pulsePeriod).mul(2)
        const osc = oscSine(period).mul(0.5).add(0.5) // osc [ 0.5, 1.0 ]

        const outlineColor = visibleEdge
          .mul(visibleEdgeColor)
          .add(hiddenEdge.mul(hiddenEdgeColor))
          .mul(edgeStrength)
        const outlinePulse = pulsePeriod.greaterThan(0).select(outlineColor.mul(osc), outlineColor)

        return outlinePulse
      }

      const selectedOutlinePass = generateSelectedOutlinePass()
      const hoverOutlinePass = generateHoverOutlinePass()

      // Combine composite with outlines BEFORE applying TRAA
      const compositeWithOutlines = SSGI_PARAMS.enabled
        ? vec4(add(compositePass.rgb, selectedOutlinePass.add(hoverOutlinePass)), compositePass.a)
        : vec4(add(scenePassColor.rgb, selectedOutlinePass.add(hoverOutlinePass)), scenePassColor.a)

      // TRAA (Temporal Reprojection Anti-Aliasing) - applied AFTER combining everything
      const traaOutput = traa(compositeWithOutlines, scenePassDepth, scenePassVelocity, camera)

      // For zone-over-background pixels, scenePassDepth=1.0 (no scene geometry) causes TRAA
      // to output black. Use hasGeometry to blend: geometry pixels use traaRgb, all others
      // (zones over background, pure background) use compositePass.rgb directly.
      const traaRgb = (traaOutput as any).rgb
      const colorSource = mix(compositePass.rgb, traaRgb, hasGeometry)
      const finalOutput = vec4(mix(bgUniform.current, colorSource, contentAlpha), float(1))

      const renderPipeline = new RenderPipeline(renderer as unknown as WebGPURenderer)
      renderPipeline.outputNode = finalOutput
      renderPipelineRef.current = renderPipeline
    } catch (error) {
      hasPipelineErrorRef.current = true
      console.error(
        '[viewer] Failed to set up post-processing pipeline. Rendering without post FX.',
        error,
      )
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null
    }

    return () => {
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null
    }
  }, [renderer, scene, camera, isInitialized, zoneLayers])

  useFrame((_, delta) => {
    // Animate background colour toward the current theme target (same lerp as AnimatedBackground)
    bgTarget.current.set(useViewer.getState().theme === 'dark' ? DARK_BG : LIGHT_BG)
    bgCurrent.current.lerp(bgTarget.current, Math.min(delta, 0.1) * 4)
    bgUniform.current.value.copy(bgCurrent.current)

    if (hasPipelineErrorRef.current || !renderPipelineRef.current) {
      return
    }

    try {
      const perspective = camera as PerspectiveCamera
      const capture = takePipelineCapture()
      if (capture && perspective.isPerspectiveCamera) {
        const saved = {
          position: perspective.position.clone(),
          quaternion: perspective.quaternion.clone(),
          fov: perspective.fov,
          near: perspective.near,
          far: perspective.far,
          zoom: perspective.zoom,
          mask: perspective.layers.mask,
        }
        perspective.position.set(capture.pose.position[0], capture.pose.position[1], capture.pose.position[2])
        perspective.quaternion.set(
          capture.pose.quaternion[0],
          capture.pose.quaternion[1],
          capture.pose.quaternion[2],
          capture.pose.quaternion[3],
        )
        perspective.fov = capture.pose.fov
        perspective.near = capture.pose.near
        perspective.far = capture.pose.far
        perspective.zoom = 1
        perspective.layers.mask = (1 << SCENE_LAYER) | (1 << ZONE_LAYER)
        perspective.updateProjectionMatrix()
        perspective.updateMatrixWorld()
        holdPipelineCapture()
        const dom = renderer.domElement
        // WebGPU only exposes the presented frame. Wait one beat, then read the canvas.
        window.setTimeout(() => {
          try {
            const width = dom.width
            const height = dom.height
            const snapshot = document.createElement('canvas')
            snapshot.width = width
            snapshot.height = height
            const snapshotContext = snapshot.getContext('2d', { willReadFrequently: true })
            if (!snapshotContext) throw new Error('Could not copy the capture frame.')
            const url = dom.toDataURL('image/png')
            const image = new Image()
            image.onload = () => {
              snapshotContext.drawImage(image, 0, 0, width, height)
              capture.resolve({
                width,
                height,
                pixels: snapshotContext.getImageData(0, 0, width, height).data,
              })
            }
            image.onerror = () => capture.reject(new Error('Could not read the capture frame.'))
            image.src = url
          } catch (error) {
            capture.reject(error instanceof Error ? error : new Error(String(error)))
          } finally {
            perspective.position.copy(saved.position)
            perspective.quaternion.copy(saved.quaternion)
            perspective.fov = saved.fov
            perspective.near = saved.near
            perspective.far = saved.far
            perspective.zoom = saved.zoom
            perspective.layers.mask = saved.mask
            perspective.updateProjectionMatrix()
            perspective.updateMatrixWorld()
            releasePipelineCapture()
          }
        }, 120)
      }

      // Clear alpha=0 so background pixels in the output MRT attachment (index 0) get a=0,
      // making scenePassColor.a a reliable geometry mask (geometry pixels write a=1 via output node).
      ;(renderer as any).setClearAlpha(0)
      renderPipelineRef.current.render()
    } catch (error) {
      hasPipelineErrorRef.current = true
      console.error('[viewer] Post-processing render pass failed.', error)
      if (renderPipelineRef.current) {
        renderPipelineRef.current.dispose()
      }
      renderPipelineRef.current = null

      if (retryCountRef.current < MAX_PIPELINE_RETRIES) {
        // Auto-retry: schedule a pipeline rebuild if we haven't exceeded the retry limit
        retryCountRef.current++
        console.warn(
          `[viewer] Scheduling post-processing rebuild (attempt ${retryCountRef.current}/${MAX_PIPELINE_RETRIES})`,
        )
        setTimeout(requestPipelineRebuild, RETRY_DELAY_MS)
      } else {
        console.error(
          '[viewer] Post-processing retries exhausted. Rendering without post FX for this session.',
        )
      }
    }
  }, 1)

  return null
}

export default PostProcessingPasses
