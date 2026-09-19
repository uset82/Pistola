import {
  boxMeshFromSize,
  getScaledDimensions,
  meshBounds,
  primitiveMesh,
  transformMesh,
  useScene,
  type AnyNode,
  type CadBodyNode,
  type ItemNode,
  type TriangleMesh,
} from '@pascal-app/core'
import { getNodeBounds } from '../assistant/agent-tools'

export type StructurePart = {
  id: string
  name: string
  type: string
  mesh: TriangleMesh
  box: { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] }
  triangleCount: number
  volumeHint: number
  specOp?: string
  spec?: Record<string, unknown>
}

const volumeOfBox = (size: [number, number, number]) => Math.abs(size[0] * size[1] * size[2])

const nodeVec = (node: AnyNode, key: 'position' | 'scale' | 'rotation', fallback: [number, number, number]) => {
  const value = key in node ? (node as Record<string, unknown>)[key] : null
  return Array.isArray(value) && value.length === 3
    ? [Number(value[0]), Number(value[1]), Number(value[2])] as [number, number, number]
    : fallback
}

const worldMesh = (node: AnyNode, local: TriangleMesh): TriangleMesh => {
  let mesh = transformMesh(local, nodeVec(node, 'position', [0, 0, 0]), nodeVec(node, 'scale', [1, 1, 1]), nodeVec(node, 'rotation', [0, 0, 0]))
  let parentId = 'parentId' in node ? node.parentId : null
  const nodes = useScene.getState().nodes
  while (parentId) {
    const parent = nodes[parentId as keyof typeof nodes] as AnyNode | undefined
    if (!parent) break
    mesh = transformMesh(
      mesh,
      nodeVec(parent, 'position', [0, 0, 0]),
      nodeVec(parent, 'scale', [1, 1, 1]),
      nodeVec(parent, 'rotation', [0, 0, 0]),
    )
    parentId = 'parentId' in parent ? parent.parentId : null
  }
  return mesh
}

export const collectStructureParts = (): StructurePart[] => {
  const parts: StructurePart[] = []
  for (const node of Object.values(useScene.getState().nodes)) {
    if (!node) continue
    if (node.type === 'item') {
      const item = node as ItemNode
      const bounds = getNodeBounds(item)
      if (!bounds) continue
      const [w, h, d] = getScaledDimensions(item)
      const kind = item.asset?.primitive || item.asset?.id || 'box'
      const local = primitiveMesh(String(kind), [w, h, d])
      const mesh = worldMesh(
        { ...item, scale: [1, 1, 1] } as AnyNode,
        local,
      )
      const measured = meshBounds(mesh.positions)
      parts.push({
        id: item.id,
        name: item.name ?? item.asset?.name ?? item.id,
        type: 'item',
        mesh,
        box: measured.min[0] === Infinity ? { min: bounds.min, max: bounds.max, size: bounds.size } : measured,
        triangleCount: mesh.indices.length / 3,
        volumeHint: volumeOfBox(bounds.size),
      })
      continue
    }
    if (node.type === 'cad-body') {
      const body = node as CadBodyNode
      const bounds = getNodeBounds(body)
      if (!bounds) continue
      const preview = body.preview
      const spec = preview && preview.primitive === 'mesh' && preview.spec && typeof preview.spec === 'object'
        ? (preview.spec as Record<string, unknown>)
        : undefined
      const local: TriangleMesh =
        preview?.primitive === 'mesh' && preview.positions.length > 0
          ? { positions: preview.positions, indices: preview.indices }
          : boxMeshFromSize(bounds.size[0], bounds.size[1], bounds.size[2])
      const mesh =
        preview?.primitive === 'mesh' && preview.positions.length > 0
          ? worldMesh({ ...body, scale: body.scale ?? [1, 1, 1] } as AnyNode, local)
          : transformMesh(local, [bounds.center[0], bounds.min[1], bounds.center[2]])
      const measured = meshBounds(mesh.positions)
      const volume =
        typeof body.metadata === 'object' && body.metadata && 'volume' in body.metadata
          ? Number((body.metadata as { volume?: number }).volume ?? volumeOfBox(measured.size))
          : volumeOfBox(measured.size)
      parts.push({
        id: body.id,
        name: body.name ?? body.id,
        type: 'cad-body',
        mesh,
        box: {
          min: measured.min,
          max: measured.max,
          size: measured.size,
        },
        triangleCount: mesh.indices.length / 3,
        volumeHint: volume,
        specOp: typeof spec?.op === 'string' ? spec.op : undefined,
        spec,
      })
    }
  }
  return parts
}

export const assemblyTolerance = (parts: StructurePart[]) => {
  if (parts.length === 0) return 0.002
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    min[0] = Math.min(min[0], part.box.min[0])
    min[1] = Math.min(min[1], part.box.min[1])
    min[2] = Math.min(min[2], part.box.min[2])
    max[0] = Math.max(max[0], part.box.max[0])
    max[1] = Math.max(max[1], part.box.max[1])
    max[2] = Math.max(max[2], part.box.max[2])
  }
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  return Math.max(0.002, 0.005 * diagonal)
}
