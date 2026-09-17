import { type ScanNode, useRegistry } from '@pascal-app/core'
import { Suspense, useMemo, useRef } from 'react'
import { Box3, Vector3, type Group, type Material, type Mesh } from 'three'
import { useAssetUrl } from '../../../hooks/use-asset-url'
import { useGLTFKTX2 } from '../../../hooks/use-gltf-ktx2'
import { useNodeEvents } from '../../../hooks/use-node-events'
import useViewer from '../../../store/use-viewer'

export const ScanRenderer = ({ node }: { node: ScanNode }) => {
  const showScans = useViewer((s) => s.showScans)
  const ref = useRef<Group>(null!)
  const handlers = useNodeEvents(node, 'scan')
  useRegistry(node.id, 'scan', ref)

  const resolvedUrl = useAssetUrl(node.url)

  return (
    <group
      position={node.position}
      ref={ref}
      rotation={node.rotation}
      scale={[node.scale, node.scale, node.scale]}
      visible={showScans}
    >
      {resolvedUrl && (
        <Suspense>
          <ScanModel handlers={handlers} opacity={node.opacity} url={resolvedUrl} />
        </Suspense>
      )}
    </group>
  )
}

const ScanModel = ({
  url,
  opacity,
  handlers,
}: {
  url: string
  opacity: number
  handlers: ReturnType<typeof useNodeEvents>
}) => {
  const gltf = useGLTFKTX2(url) as any
  const scene = gltf.scene

  const bounds = useMemo(() => {
    const normalizedOpacity = opacity / 100
    const isTransparent = normalizedOpacity < 1
    const box = new Box3()
    const size = new Vector3()
    const center = new Vector3()

    const updateMaterial = (material: Material) => {
      if (isTransparent) {
        material.transparent = true
        material.opacity = normalizedOpacity
        material.depthWrite = false
      } else {
        material.transparent = false
        material.opacity = 1
        material.depthWrite = true
      }
      material.needsUpdate = true
    }

    scene.traverse((child: any) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh

        // Disable raycasting
        mesh.raycast = () => {}
        mesh.frustumCulled = false

        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => {
            updateMaterial(material)
          })
        } else {
          updateMaterial(mesh.material)
        }
      }
    })

    box.setFromObject(scene)
    box.getSize(size)
    box.getCenter(center)

    scene.traverse((child: any) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        mesh.geometry.boundingBox = null
        mesh.geometry.boundingSphere = null
      }
    })

    return {
      center: center.toArray() as [number, number, number],
      size: [
        Math.max(size.x, 0.1),
        Math.max(size.y, 0.1),
        Math.max(size.z, 0.1),
      ] as [number, number, number],
    }
  }, [scene, opacity])

  return (
    <>
      <primitive object={scene} />
      <mesh position={bounds.center} {...handlers}>
        <boxGeometry args={bounds.size} boundingBox={null} boundingSphere={null} />
        <meshBasicMaterial depthWrite={false} opacity={0} transparent />
      </mesh>
    </>
  )
}
