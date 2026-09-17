import { Html } from '@react-three/drei'
import { type CadSketchEntity, type CadSketchNode, useRegistry } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, Vector2, type Group } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'

const circleSegments = 32

const planeRotationByType: Record<CadSketchNode['plane'], [number, number, number]> = {
  XY: [0, 0, 0],
  XZ: [-Math.PI / 2, 0, 0],
  YZ: [0, Math.PI / 2, 0],
  level: [-Math.PI / 2, 0, 0],
  face: [0, 0, 0],
}

const point = (x: number, y: number) => new Vector2(x, y)

const rectanglePoints = (entity: Extract<CadSketchEntity, { kind: 'rectangle' }>) => {
  const halfW = entity.width / 2
  const halfH = entity.height / 2

  return [
    point(entity.center[0] - halfW, entity.center[1] - halfH),
    point(entity.center[0] + halfW, entity.center[1] - halfH),
    point(entity.center[0] + halfW, entity.center[1] + halfH),
    point(entity.center[0] - halfW, entity.center[1] + halfH),
    point(entity.center[0] - halfW, entity.center[1] - halfH),
  ]
}

const circlePoints = (
  center: [number, number],
  radius: number,
  startAngle = 0,
  endAngle = Math.PI * 2,
) => {
  const step = (endAngle - startAngle) / circleSegments
  const points: Vector2[] = []

  for (let index = 0; index <= circleSegments; index++) {
    const angle = startAngle + step * index
    points.push(point(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius))
  }

  return points
}

const entityPoints = (entity: CadSketchEntity) => {
  switch (entity.kind) {
    case 'line':
      return [point(entity.start[0], entity.start[1]), point(entity.end[0], entity.end[1])]
    case 'rectangle':
      return rectanglePoints(entity)
    case 'circle':
      return circlePoints(entity.center, entity.radius)
    case 'arc':
      return circlePoints(entity.center, entity.radius, entity.startAngle, entity.endAngle)
    case 'polyline':
      return entity.points.map(([x, y]) => point(x, y))
  }
}

const entityCenter = (entity: CadSketchEntity): [number, number] => {
  switch (entity.kind) {
    case 'line':
      return [(entity.start[0] + entity.end[0]) / 2, (entity.start[1] + entity.end[1]) / 2]
    case 'rectangle':
    case 'circle':
    case 'arc':
      return entity.center
    case 'polyline': {
      const pointCount = entity.points.length || 1
      const totals = entity.points.reduce(
        (acc, current) => [acc[0] + current[0], acc[1] + current[1]] as [number, number],
        [0, 0] as [number, number],
      )
      return [totals[0] / pointCount, totals[1] / pointCount]
    }
  }
}

const findEntity = (entities: CadSketchEntity[], entityId: string) =>
  entities.find((entity) => entity.id === entityId)

const formatDimensionValue = (value: number) => `${value.toFixed(2)} m`

const dimensionAnchor = (
  entities: CadSketchEntity[],
  dimension: CadSketchNode['dimensions'][number],
): [number, number] | null => {
  const entity = findEntity(entities, dimension.entityId)
  if (!entity) return null
  return entityCenter(entity)
}

const constraintAnchor = (
  entities: CadSketchEntity[],
  constraint: CadSketchNode['constraints'][number],
): [number, number] | null => {
  const entityId = constraint.entityIds[0]
  if (!entityId) return null
  const entity = findEntity(entities, entityId)
  if (!entity) return null
  return entityCenter(entity)
}

const buildLineGeometry = (entities: CadSketchEntity[]) => {
  const positions: number[] = []

  for (const entity of entities) {
    const points = entityPoints(entity)
    for (let index = 0; index < points.length - 1; index++) {
      const current = points[index]
      const next = points[index + 1]
      if (!(current && next)) continue
      positions.push(current.x, current.y, 0, next.x, next.y, 0)
    }

    if (entity.kind === 'polyline' && entity.closed && points.length > 2) {
      const first = points[0]
      const last = points[points.length - 1]
      if (first && last) {
        positions.push(last.x, last.y, 0, first.x, first.y, 0)
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

const getSketchBounds = (entities: CadSketchEntity[]) => {
  const points = entities.flatMap(entityPoints)
  if (points.length === 0) {
    return { center: [0, 0] as [number, number], size: [2, 2] as [number, number] }
  }

  const xs = points.map((value) => value.x)
  const ys = points.map((value) => value.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2] as [number, number],
    size: [Math.max(maxX - minX, 0.5), Math.max(maxY - minY, 0.5)] as [number, number],
  }
}

export const CadSketchRenderer = ({ node }: { node: CadSketchNode }) => {
  const ref = useRef<Group>(null!)
  const handlers = useNodeEvents(node, 'cad-sketch')

  useRegistry(node.id, 'cad-sketch', ref)

  const lineGeometry = useMemo(() => buildLineGeometry(node.entities), [node.entities])
  const bounds = useMemo(() => getSketchBounds(node.entities), [node.entities])
  const planeRotation = planeRotationByType[node.plane]
  const color =
    node.editStatus === 'invalid' ? '#f87171' : node.editStatus === 'idle' ? '#94a3b8' : '#38bdf8'
  const opacity = node.editStatus === 'idle' ? 0.4 : 1
  const lineMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color,
        opacity,
        transparent: opacity < 1,
      }),
    [color, opacity],
  )
  const pickMaterial = useMemo(
    () =>
      new MeshBasicNodeMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  )

  return (
    <group position={node.position} ref={ref} rotation={node.rotation} visible={node.visible}>
      <group rotation={planeRotation}>
        <lineSegments geometry={lineGeometry} material={lineMaterial} />
        {node.editStatus === 'editing' &&
          node.dimensions.map((dimension) => {
          const anchor = dimensionAnchor(node.entities, dimension)
          if (!anchor) return null

          return (
            <Html key={dimension.id} position={[anchor[0], anchor[1], 0.02]} transform>
              <div className="rounded-full border border-cyan-400/30 bg-black/70 px-2 py-1 font-medium text-[10px] text-cyan-100 shadow-lg backdrop-blur-sm">
                {dimension.label || dimension.kind}: {formatDimensionValue(dimension.value)}
              </div>
            </Html>
          )
        })}
        <mesh position={[bounds.center[0], bounds.center[1], -0.001]} {...handlers}>
          <planeGeometry args={bounds.size} />
          <primitive object={pickMaterial} attach="material" />
        </mesh>
      </group>
    </group>
  )
}
