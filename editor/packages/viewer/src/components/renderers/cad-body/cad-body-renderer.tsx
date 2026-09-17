import { getCadBodyTransform, type CadBodyNode, useRegistry } from '@pascal-app/core'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Box3, type Group, type Material, type Mesh, Vector3 } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'

const getBodyColor = (node: CadBodyNode) => {
  if (node.regenStatus === 'error') return '#f87171'
  if (node.regenStatus === 'running' || node.regenStatus === 'queued') return '#facc15'
  if (node.regenStatus === 'pending' || node.regenStatus === 'building') return '#facc15'
  return node.preview.color
}

const isRenderableAssetUrl = (url: string | null | undefined) =>
  Boolean(url && (url.startsWith('/') || url.startsWith('http')) && /\.(glb|gltf)(\?.*)?$/i.test(url))

const hasPlaceholderArtifacts = (node: CadBodyNode) =>
  node.warnings.some((warning) => warning.toLowerCase().includes('placeholder artifact'))

const getPlaceholderDimensions = (node: CadBodyNode): [number, number, number] =>
  node.preview.primitive === 'box'
    ? node.preview.dimensions
    : [node.preview.radius * 2, node.preview.height, node.preview.radius * 2]

const CadBodyAssetMesh = ({ url }: { url: string }) => {
  const gltf = useGLTF(url)
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene])
  const bounds = useMemo(() => new Box3().setFromObject(scene), [scene])
  const centerY = bounds.getCenter(new Vector3()).y

  return <primitive object={scene} position-y={-centerY} />
}

export const CadBodyRenderer = ({ node }: { node: CadBodyNode }) => {
  const ref = useRef<Group>(null!)
  const overlayRef = useRef<Mesh>(null)
  const spinnerRef = useRef<Group>(null)
  const handlers = useNodeEvents(node, 'cad-body')
  const transform = getCadBodyTransform(node)

  useRegistry(node.id, 'cad-body', ref)

  const bodyColor = getBodyColor(node)
  const isError = node.regenStatus === 'error'

  const material = useMemo(
    () =>
      new MeshStandardNodeMaterial({
        color: bodyColor,
        emissive: isError ? '#7f1d1d' : '#000000',
        roughness: 0.45,
        metalness: 0.15,
      }),
    [bodyColor, isError],
  )

  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  const placeholderDimensions = getPlaceholderDimensions(node)
  const previewUrl = node.artifacts.previewUrl || node.previewArtifactRef || null
  const showAssetPreview = !hasPlaceholderArtifacts(node) && isRenderableAssetUrl(previewUrl)
  const isBuilding = node.regenStatus === 'building' || node.regenStatus === 'queued' || node.regenStatus === 'running'

  useFrame(({ clock }) => {
    if (overlayRef.current && (node.regenStatus === 'pending' || node.regenStatus === 'building')) {
      const material = overlayRef.current.material as Material & { opacity?: number }
      if (typeof material.opacity === 'number') {
        material.opacity = 0.12 + (Math.sin(clock.elapsedTime * 4) + 1) * 0.08
      }
    }

    if (spinnerRef.current && isBuilding) {
      spinnerRef.current.rotation.y = clock.elapsedTime * 3.2
    }
  })

  return (
    <group
      position={transform.position}
      ref={ref}
      rotation={transform.rotation}
      scale={transform.scale}
      visible={node.visible}
    >
      {showAssetPreview && previewUrl ? (
        <group {...handlers}>
          <CadBodyAssetMesh url={previewUrl} />
        </group>
      ) : (
        <>
          {node.preview.primitive === 'box' ? (
            <mesh
              castShadow
              material={material}
              position-y={node.preview.dimensions[1] / 2}
              receiveShadow
              {...handlers}
            >
              <boxGeometry
                args={[node.preview.dimensions[0], node.preview.dimensions[1], node.preview.dimensions[2]]}
              />
            </mesh>
          ) : (
            <mesh
              castShadow
              material={material}
              position-y={node.preview.height / 2}
              receiveShadow
              rotation-x={Math.PI / 2}
              {...handlers}
            >
              <cylinderGeometry
                args={[
                  node.preview.radius,
                  node.preview.radius,
                  node.preview.height,
                  node.preview.radialSegments,
                ]}
              />
            </mesh>
          )}
          {!node.artifacts.previewUrl && (
            <mesh position-y={placeholderDimensions[1] / 2} renderOrder={3}>
              <boxGeometry args={placeholderDimensions} />
              <meshBasicMaterial color="#93c5fd" opacity={0.35} transparent wireframe />
            </mesh>
          )}
        </>
      )}

      {(node.regenStatus === 'pending' || node.regenStatus === 'building') && (
        <mesh position-y={placeholderDimensions[1] / 2} ref={overlayRef} renderOrder={4}>
          <boxGeometry args={placeholderDimensions} />
          <meshBasicMaterial color="#fde68a" depthWrite={false} opacity={0.18} transparent />
        </mesh>
      )}

      {isBuilding && (
        <group position-y={placeholderDimensions[1] + 0.18} ref={spinnerRef}>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[Math.max(placeholderDimensions[0], placeholderDimensions[2]) * 0.28, 0.02, 12, 48]} />
            <meshBasicMaterial color="#fde68a" depthWrite={false} transparent opacity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  )
}
