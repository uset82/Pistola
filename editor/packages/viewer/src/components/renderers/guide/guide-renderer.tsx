import { type GuideNode, useRegistry } from '@pascal-app/core'
import { useLoader } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import { DoubleSide, type Group, type Texture, TextureLoader } from 'three'
import { float, texture } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { useAssetUrl } from '../../../hooks/use-asset-url'
import { useNodeEvents } from '../../../hooks/use-node-events'
import useViewer from '../../../store/use-viewer'

export const GuideRenderer = ({ node }: { node: GuideNode }) => {
  const showGuides = useViewer((s) => s.showGuides)
  const ref = useRef<Group>(null!)
  const handlers = useNodeEvents(node, 'guide')
  useRegistry(node.id, 'guide', ref)

  const resolvedUrl = useAssetUrl(node.url)

  return (
    <group
      position={node.position}
      ref={ref}
      rotation={[0, node.rotation[1], 0]}
      visible={showGuides}
    >
      {resolvedUrl && (
        <Suspense>
          <GuidePlane handlers={handlers} opacity={node.opacity} scale={node.scale} url={resolvedUrl} />
        </Suspense>
      )}
    </group>
  )
}

const GuidePlane = ({
  url,
  scale,
  opacity,
  handlers,
}: {
  url: string
  scale: number
  opacity: number
  handlers: ReturnType<typeof useNodeEvents>
}) => {
  const tex = useLoader(TextureLoader, url) as Texture

  const { width, height, material } = useMemo(() => {
    const img = tex.image as HTMLImageElement | ImageBitmap
    const w = img.width || 1
    const h = img.height || 1
    const aspect = w / h

    // Default: 10 meters wide, height from aspect ratio
    const planeWidth = 10 * scale
    const planeHeight = (10 / aspect) * scale

    const normalizedOpacity = opacity / 100

    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      colorNode: texture(tex),
      opacityNode: float(normalizedOpacity),
      side: DoubleSide,
      depthWrite: false,
    })

    return { width: planeWidth, height: planeHeight, material: mat }
  }, [tex, scale, opacity])

  return (
    <mesh
      frustumCulled={false}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      {...handlers}
    >
      <planeGeometry args={[width, height]} boundingBox={null} boundingSphere={null} />
    </mesh>
  )
}
