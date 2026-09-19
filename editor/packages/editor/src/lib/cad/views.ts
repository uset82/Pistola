export const PISTOLA_FRAME = {
  up: '+Y',
  front: '+Z',
  right: '+X',
  units: 'meters',
  origin: 'bottom-center',
} as const

export type OrthoViewName = 'front' | 'side' | 'top' | 'iso'

export type OrthoView = {
  name: 'FRONT' | 'SIDE' | 'TOP' | 'ISO'
  camera: { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] }
  screen: { u: '+X' | '+Y' | '+Z' | 'iso'; v: '+X' | '+Y' | '+Z' | 'iso' }
  plane: 'XY' | 'ZY' | 'XZ' | null
}

export const ORTHO_VIEWS: Record<OrthoViewName, OrthoView> = {
  front: {
    name: 'FRONT',
    camera: { position: [0, 1, 8], target: [0, 1, 0], up: [0, 1, 0] },
    screen: { u: '+X', v: '+Y' },
    plane: 'XY',
  },
  side: {
    name: 'SIDE',
    camera: { position: [8, 1, 0], target: [0, 1, 0], up: [0, 1, 0] },
    screen: { u: '+Z', v: '+Y' },
    plane: 'ZY',
  },
  top: {
    name: 'TOP',
    camera: { position: [0, 8, 0], target: [0, 0, 0], up: [0, 0, 1] },
    screen: { u: '+X', v: '+Z' },
    plane: 'XZ',
  },
  iso: {
    name: 'ISO',
    camera: { position: [6, 5, 6], target: [0, 0.5, 0], up: [0, 1, 0] },
    screen: { u: 'iso', v: 'iso' },
    plane: null,
  },
}

export const projectPointToView = (
  point: [number, number, number],
  view: OrthoViewName,
): [number, number] => {
  if (view === 'front') return [point[0], point[1]]
  if (view === 'side') return [point[2], point[1]]
  if (view === 'top') return [point[0], point[2]]
  const iso = ORTHO_VIEWS.iso.camera.position
  const length = Math.hypot(iso[0], iso[1], iso[2]) || 1
  const dir: [number, number, number] = [iso[0] / length, iso[1] / length, iso[2] / length]
  const right: [number, number, number] = [dir[2], 0, -dir[0]]
  const rightLen = Math.hypot(right[0], right[2]) || 1
  right[0] /= rightLen
  right[2] /= rightLen
  const up: [number, number, number] = [
    right[1] * dir[2] - right[2] * dir[1],
    right[2] * dir[0] - right[0] * dir[2],
    right[0] * dir[1] - right[1] * dir[0],
  ]
  return [
    point[0] * right[0] + point[1] * right[1] + point[2] * right[2],
    point[0] * up[0] + point[1] * up[1] + point[2] * up[2],
  ]
}

export const projectBoxToView = (
  min: [number, number, number],
  max: [number, number, number],
  view: OrthoViewName,
) => {
  const corners: Array<[number, number, number]> = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [min[0], max[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [min[0], max[1], max[2]],
    [max[0], max[1], max[2]],
  ]
  const projected = corners.map((corner) => projectPointToView(corner, view))
  const u = projected.map((point) => point[0])
  const v = projected.map((point) => point[1])
  return {
    min: [Math.min(...u), Math.min(...v)] as [number, number],
    max: [Math.max(...u), Math.max(...v)] as [number, number],
    size: [Math.max(...u) - Math.min(...u), Math.max(...v) - Math.min(...v)] as [number, number],
  }
}
