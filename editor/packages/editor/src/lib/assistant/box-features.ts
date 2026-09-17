import type { CadBodyNode } from '@pascal-app/core'
import { getCadBodyTransform } from '@pascal-app/core/lib/cad-body-transform'
import { Euler, Quaternion, Vector3 } from 'three'

export type AssistantCadBoxFace = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'

export type BoxBodySummary = {
  id: string
  parentId: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  width: number
  height: number
  depth: number
  color: string
}

export type CadAttachmentBodySpec = {
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  dimensions: [number, number, number]
  color: string
}

const round3 = (value: number) => Number(value.toFixed(3))

export const getBoxBodySummary = (body: CadBodyNode): BoxBodySummary | null => {
  if (body.preview.primitive !== 'box' || !body.parentId) return null

  const transform = getCadBodyTransform(body)
  const width = body.preview.dimensions[0] * transform.scale[0]
  const height = body.preview.dimensions[1] * transform.scale[1]
  const depth = body.preview.dimensions[2] * transform.scale[2]

  return {
    id: body.id,
    parentId: body.parentId,
    name: body.name || body.id,
    position: [...transform.position] as [number, number, number],
    rotation: [...transform.rotation] as [number, number, number],
    width,
    height,
    depth,
    color: body.preview.color,
  }
}

const getBaseQuaternion = (body: BoxBodySummary) =>
  new Quaternion().setFromEuler(new Euler(body.rotation[0], body.rotation[1], body.rotation[2], 'XYZ'))

const toWorldPosition = (body: BoxBodySummary, local: [number, number, number]) => {
  const baseQuaternion = getBaseQuaternion(body)
  const world = new Vector3(local[0], local[1], local[2]).applyQuaternion(baseQuaternion)
  return [
    round3(body.position[0] + world.x),
    round3(body.position[1] + world.y),
    round3(body.position[2] + world.z),
  ] as [number, number, number]
}

const toWorldRotation = (body: BoxBodySummary, extraRotation: Euler) => {
  const quaternion = getBaseQuaternion(body).multiply(new Quaternion().setFromEuler(extraRotation))
  const euler = new Euler().setFromQuaternion(quaternion, 'XYZ')
  return [round3(euler.x), round3(euler.y), round3(euler.z)] as [number, number, number]
}

export const buildEarAttachmentSpecs = (
  body: BoxBodySummary,
): [CadAttachmentBodySpec, CadAttachmentBodySpec] => {
  const earWidth = round3(Math.max(body.width * 0.22, 0.08))
  const earHeight = round3(Math.max(body.height * 0.38, 0.08))
  const earDepth = round3(Math.max(body.depth * 0.16, 0.08))
  const localYOffset = body.height
  const localXOffset = body.width / 2 - earWidth / 2

  return [
    {
      name: `${body.name} Ear Left`,
      position: toWorldPosition(body, [-localXOffset, localYOffset, 0]),
      rotation: [...body.rotation] as [number, number, number],
      dimensions: [earWidth, earHeight, earDepth],
      color: body.color,
    },
    {
      name: `${body.name} Ear Right`,
      position: toWorldPosition(body, [localXOffset, localYOffset, 0]),
      rotation: [...body.rotation] as [number, number, number],
      dimensions: [earWidth, earHeight, earDepth],
      color: body.color,
    },
  ]
}

export const buildFaceExtrusionSpec = (
  body: BoxBodySummary,
  face: AssistantCadBoxFace = 'top',
  distance?: number,
): CadAttachmentBodySpec => {
  const extrusionDistance = round3(
    distance ?? Math.max(Math.min(body.width, body.height, body.depth) * 0.24, 0.08),
  )
  const faceWidth = round3(Math.max(body.width * 0.35, 0.08))
  const faceHeight = round3(Math.max(body.height * 0.35, 0.08))
  const faceDepth = round3(Math.max(body.depth * 0.35, 0.08))

  switch (face) {
    case 'bottom':
      return {
        name: `${body.name} Bottom Tab`,
        position: toWorldPosition(body, [0, 0, 0]),
        rotation: toWorldRotation(body, new Euler(Math.PI, 0, 0, 'XYZ')),
        dimensions: [faceWidth, extrusionDistance, faceDepth],
        color: body.color,
      }
    case 'left':
      return {
        name: `${body.name} Left Tab`,
        position: toWorldPosition(body, [-body.width / 2, body.height * 0.5, 0]),
        rotation: toWorldRotation(body, new Euler(0, 0, Math.PI / 2, 'XYZ')),
        dimensions: [faceDepth, extrusionDistance, faceHeight],
        color: body.color,
      }
    case 'right':
      return {
        name: `${body.name} Right Tab`,
        position: toWorldPosition(body, [body.width / 2, body.height * 0.5, 0]),
        rotation: toWorldRotation(body, new Euler(0, 0, -Math.PI / 2, 'XYZ')),
        dimensions: [faceDepth, extrusionDistance, faceHeight],
        color: body.color,
      }
    case 'front':
      return {
        name: `${body.name} Front Tab`,
        position: toWorldPosition(body, [0, body.height * 0.5, body.depth / 2]),
        rotation: toWorldRotation(body, new Euler(-Math.PI / 2, 0, 0, 'XYZ')),
        dimensions: [faceWidth, extrusionDistance, faceHeight],
        color: body.color,
      }
    case 'back':
      return {
        name: `${body.name} Back Tab`,
        position: toWorldPosition(body, [0, body.height * 0.5, -body.depth / 2]),
        rotation: toWorldRotation(body, new Euler(Math.PI / 2, 0, 0, 'XYZ')),
        dimensions: [faceWidth, extrusionDistance, faceHeight],
        color: body.color,
      }
    default:
      return {
        name: `${body.name} Top Tab`,
        position: toWorldPosition(body, [0, body.height, 0]),
        rotation: [...body.rotation] as [number, number, number],
        dimensions: [faceWidth, extrusionDistance, faceDepth],
        color: body.color,
      }
  }
}

export const buildShellPanelSpecs = (
  body: BoxBodySummary,
  thickness?: number,
): CadAttachmentBodySpec[] => {
  const shellThickness = round3(
    thickness ?? Math.max(Math.min(body.width, body.height, body.depth) * 0.06, 0.03),
  )

  return [
    {
      name: `${body.name} Shell Top`,
      position: toWorldPosition(body, [0, body.height, 0]),
      rotation: [...body.rotation] as [number, number, number],
      dimensions: [body.width, shellThickness, body.depth],
      color: body.color,
    },
    {
      name: `${body.name} Shell Bottom`,
      position: toWorldPosition(body, [0, 0, 0]),
      rotation: toWorldRotation(body, new Euler(Math.PI, 0, 0, 'XYZ')),
      dimensions: [body.width, shellThickness, body.depth],
      color: body.color,
    },
    {
      name: `${body.name} Shell Front`,
      position: toWorldPosition(body, [0, body.height * 0.5, body.depth / 2]),
      rotation: toWorldRotation(body, new Euler(-Math.PI / 2, 0, 0, 'XYZ')),
      dimensions: [body.width, shellThickness, body.height],
      color: body.color,
    },
    {
      name: `${body.name} Shell Back`,
      position: toWorldPosition(body, [0, body.height * 0.5, -body.depth / 2]),
      rotation: toWorldRotation(body, new Euler(Math.PI / 2, 0, 0, 'XYZ')),
      dimensions: [body.width, shellThickness, body.height],
      color: body.color,
    },
    {
      name: `${body.name} Shell Left`,
      position: toWorldPosition(body, [-body.width / 2, body.height * 0.5, 0]),
      rotation: toWorldRotation(body, new Euler(0, 0, Math.PI / 2, 'XYZ')),
      dimensions: [body.depth, shellThickness, body.height],
      color: body.color,
    },
    {
      name: `${body.name} Shell Right`,
      position: toWorldPosition(body, [body.width / 2, body.height * 0.5, 0]),
      rotation: toWorldRotation(body, new Euler(0, 0, -Math.PI / 2, 'XYZ')),
      dimensions: [body.depth, shellThickness, body.height],
      color: body.color,
    },
  ]
}
