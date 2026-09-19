'use client'

import { type CadBodyNode, type CadInstanceNode, useRegistry, useScene } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, type Group } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  cadBodyHasRenderableMesh,
  cadBodyPbr,
  cadMeshGeometryFromPreview,
  getCadBodyPlaceholderDimensions,
} from '../cad-body/cad-body-preview'

const getSourceDimensions = (body: CadBodyNode | undefined): [number, number, number] => {
  if (!body) return [0.4, 0.4, 0.4]
  return getCadBodyPlaceholderDimensions(body.preview)
}

export const CadInstanceRenderer = ({ node }: { node: CadInstanceNode }) => {
  const ref = useRef<Group>(null!)
  const source = useScene((state) => state.nodes[node.sourceCadBodyId as CadBodyNode['id']])
  const body = source?.type === 'cad-body' ? source : undefined
  const dimensions = getSourceDimensions(body)
  const color = body?.preview.color ?? '#60a5fa'
  const pbr = cadBodyPbr(body ?? {})
  const material = useMemo(
    () =>
      new MeshStandardNodeMaterial({
        color,
        roughness: pbr.roughness,
        metalness: pbr.metalness,
        opacity: pbr.opacity,
        transparent: pbr.transparent,
      }),
    [color, pbr.metalness, pbr.opacity, pbr.roughness, pbr.transparent],
  )
  const geometry = useMemo(() => {
    const mesh = cadMeshGeometryFromPreview(body?.preview)
    if (!mesh) return null
    const next = new BufferGeometry()
    next.setAttribute('position', new BufferAttribute(new Float32Array(mesh.positions), 3))
    if (mesh.indices.length > 0) {
      next.setIndex(mesh.indices)
    }
    if (mesh.normals) {
      next.setAttribute('normal', new BufferAttribute(new Float32Array(mesh.normals), 3))
    } else {
      next.computeVertexNormals()
    }
    return next
  }, [body?.preview])
  const handlers = useNodeEvents(node, 'cad-instance')

  useEffect(() => {
    return () => {
      material.dispose()
      geometry?.dispose()
    }
  }, [geometry, material])

  useRegistry(node.id, 'cad-instance', ref)

  const useSourceMesh = cadBodyHasRenderableMesh(body?.preview)

  return (
    <group
      name="cad-instance"
      position={node.position}
      ref={ref}
      rotation={node.rotation}
      scale={node.scale}
      visible={node.visible}
      {...handlers}
    >
      {useSourceMesh && geometry ? (
        <mesh castShadow geometry={geometry} material={material} receiveShadow />
      ) : (
        <mesh material={material} position-y={dimensions[1] / 2}>
          <boxGeometry args={dimensions} />
        </mesh>
      )}
    </group>
  )
}
