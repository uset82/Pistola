export const FRAME = {
  up: '+Y',
  front: '+Z',
  right: '+X',
  units: 'meters',
  origin: 'bottom-center',
}

export const boxFromSize = (position, scale) => {
  const [x, y, z] = position
  const [w, h, d] = scale
  return {
    min: [x - w / 2, y, z - d / 2],
    max: [x + w / 2, y + h, z + d / 2],
    size: [w, h, d],
    center: [x, y + h / 2, z],
  }
}

export const unionBox = (boxes) => {
  if (boxes.length === 0) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const box of boxes) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], box.min[i])
      max[i] = Math.max(max[i], box.max[i])
    }
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  }
}

export const boxesOverlap = (a, b, tol = 0.002) =>
  a.min[0] <= b.max[0] + tol &&
  a.max[0] >= b.min[0] - tol &&
  a.min[1] <= b.max[1] + tol &&
  a.max[1] >= b.min[1] - tol &&
  a.min[2] <= b.max[2] + tol &&
  a.max[2] >= b.min[2] - tol

const project = (box, view) => {
  if (view === 'front') return { u0: box.min[0], u1: box.max[0], v0: box.min[1], v1: box.max[1] }
  if (view === 'side') return { u0: box.min[2], u1: box.max[2], v0: box.min[1], v1: box.max[1] }
  return { u0: box.min[0], u1: box.max[0], v0: box.min[2], v1: box.max[2] }
}

export const rasterizeBoxes = (boxes, view, resolution = 64) => {
  const world = unionBox(boxes)
  const cells = new Set()
  if (!world) return { cells, resolution, view, bounds: null }
  const pad = 0.02
  const extent =
    view === 'top'
      ? [world.min[0] - pad, world.max[0] + pad, world.min[2] - pad, world.max[2] + pad]
      : view === 'side'
        ? [world.min[2] - pad, world.max[2] + pad, world.min[1] - pad, world.max[1] + pad]
        : [world.min[0] - pad, world.max[0] + pad, world.min[1] - pad, world.max[1] + pad]
  const [uMin, uMax, vMin, vMax] = extent
  const uSpan = Math.max(uMax - uMin, 1e-6)
  const vSpan = Math.max(vMax - vMin, 1e-6)
  for (const box of boxes) {
    const { u0, u1, v0, v1 } = project(box, view)
    const i0 = Math.max(0, Math.floor(((u0 - uMin) / uSpan) * resolution))
    const i1 = Math.min(resolution - 1, Math.floor(((u1 - uMin) / uSpan) * resolution))
    const j0 = Math.max(0, Math.floor(((v0 - vMin) / vSpan) * resolution))
    const j1 = Math.min(resolution - 1, Math.floor(((v1 - vMin) / vSpan) * resolution))
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) cells.add(`${i}:${j}`)
    }
  }
  return { cells, resolution, view, bounds: extent }
}

export const maskIoU = (a, b) => {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const key of a) if (b.has(key)) inter += 1
  const union = a.size + b.size - inter
  return union === 0 ? 1 : inter / union
}

export const orthographicIoU = (goldBoxes, sceneBoxes, resolution = 64) => {
  const views = ['front', 'side', 'top']
  const perView = {}
  let sum = 0
  for (const view of views) {
    const gold = rasterizeBoxes(goldBoxes, view, resolution)
    const scene = rasterizeBoxes(sceneBoxes, view, resolution)
    const iou = maskIoU(gold.cells, scene.cells)
    perView[view] = iou
    sum += iou
  }
  return { mean: sum / views.length, views: perView }
}

export const contactGraph = (parts, tol = 0.002) => {
  const edges = []
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      if (boxesOverlap(parts[i].box, parts[j].box, tol)) {
        edges.push([parts[i].id, parts[j].id])
      }
    }
  }
  return edges
}

export const analyzeSupport = (parts, floorY = 0, tol = 0.002) => {
  const grounded = new Set()
  for (const part of parts) {
    if (part.box.min[1] <= floorY + tol) grounded.add(part.id)
  }
  const neighbors = new Map(parts.map((part) => [part.id, []]))
  for (const [a, b] of contactGraph(parts, tol)) {
    neighbors.get(a).push(b)
    neighbors.get(b).push(a)
  }
  const supported = new Set(grounded)
  const queue = [...grounded]
  while (queue.length > 0) {
    const id = queue.shift()
    for (const next of neighbors.get(id) ?? []) {
      if (!supported.has(next)) {
        supported.add(next)
        queue.push(next)
      }
    }
  }
  const floating = parts.filter((part) => !supported.has(part.id)).map((part) => part.id)
  const belowFloor = parts.filter((part) => part.box.max[1] < floorY - tol).map((part) => part.id)
  return { grounded: [...grounded], floating, belowFloor, ungrounded: floating }
}

export const dimensionError = (actual, expected) => {
  if (!actual || !expected) return null
  const errors = expected.map((value, index) => {
    if (!value) return 0
    return Math.abs(actual[index] - value) / value
  })
  return {
    perAxis: errors,
    mean: errors.reduce((sum, value) => sum + value, 0) / errors.length,
  }
}

const normalizeName = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const partCoverage = (required, sceneParts) => {
  const names = sceneParts.map((part) => normalizeName(part.name ?? part.role ?? part.id))
  const found = []
  const missing = []
  for (const part of required) {
    const needle = normalizeName(part)
    const hit = names.some((name) => name.includes(needle) || needle.includes(name))
    if (hit) found.push(part)
    else missing.push(part)
  }
  return {
    required: required.length,
    found: found.length,
    missing,
    ratio: required.length === 0 ? 1 : found.length / required.length,
  }
}

export const applyParentTransform = (localPos, localScale, parent) => {
  if (!parent) return { position: localPos, scale: localScale }
  const [px, py, pz] = parent.position
  const [psx, psy, psz] = parent.scale
  return {
    position: [px + localPos[0] * psx, py + localPos[1] * psy, pz + localPos[2] * psz],
    scale: [localScale[0] * psx, localScale[1] * psy, localScale[2] * psz],
  }
}
