import type { CadBodyNode } from '../schema'

type CadBodyTransform = CadBodyNode['transform']

const defaultPosition: CadBodyTransform['position'] = [0, 0, 0]
const defaultRotation: CadBodyTransform['rotation'] = [0, 0, 0]
const defaultScale: CadBodyTransform['scale'] = [1, 1, 1]

const arraysEqual = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

const isDefaultTransform = (transform: CadBodyTransform) =>
  arraysEqual(transform.position, defaultPosition) &&
  arraysEqual(transform.rotation, defaultRotation) &&
  arraysEqual(transform.scale, defaultScale)

const hasLegacyPlacement = (node: CadBodyNode) =>
  !arraysEqual(node.position, defaultPosition) ||
  !arraysEqual(node.rotation, defaultRotation) ||
  !arraysEqual(node.scale, defaultScale)

export const getCadBodyTransform = (node: CadBodyNode): CadBodyTransform => {
  if (isDefaultTransform(node.transform) && hasLegacyPlacement(node)) {
    return {
      position: [...node.position] as CadBodyTransform['position'],
      rotation: [...node.rotation] as CadBodyTransform['rotation'],
      scale: [...node.scale] as CadBodyTransform['scale'],
    }
  }

  return node.transform
}
