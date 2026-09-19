import { traceProfileFromComponent, type PixelGrid } from '../cad/silhouette-tracer'
import { fillPolygonMask, type RasterFrame } from '../render/soft-raster'
import { splitSheetComponents } from './sheet'
import {
  axisIndex,
  normalizeKnownDimension,
  type KnownDimension,
  type ReferenceFrames,
  type ReferenceGoldMasks,
  type ReferenceTraceResult,
  type ReferenceViewName,
  type ReferenceViewTrace,
} from './types'

const GOLD_SIZE = 128
const CONSISTENCY = 0.05

const viewPlane = (view: ReferenceViewName): ReferenceViewTrace['plane'] => {
  if (view === 'side') return 'ZY'
  if (view === 'top') return 'XZ'
  return 'XY'
}

const bbox = (pixels: [number, number][]) => {
  const xs = pixels.map((point) => point[0])
  const ys = pixels.map((point) => point[1])
  return {
    width: Math.max(1, Math.max(...xs) - Math.min(...xs) + 1),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys) + 1),
  }
}

export const worldFramesFromOverall = (overall: [number, number, number], pad = 0.08): ReferenceFrames => {
  const [width, height, depth] = overall
  const padX = Math.max(0.05, pad * Math.max(width, 0.2))
  const padY = Math.max(0.05, pad * Math.max(height, 0.2))
  const padZ = Math.max(0.05, pad * Math.max(depth, 0.2))
  return {
    front: { minU: -width / 2 - padX, maxU: width / 2 + padX, minV: -padY, maxV: height + padY },
    side: { minU: -depth / 2 - padZ, maxU: depth / 2 + padZ, minV: -padY, maxV: height + padY },
    top: { minU: -width / 2 - padX, maxU: width / 2 + padX, minV: -depth / 2 - padZ, maxV: depth / 2 + padZ },
  }
}

export const goldMasksFromTraces = (
  traces: Record<ReferenceViewName, ReferenceViewTrace>,
  frames: ReferenceFrames,
  size = GOLD_SIZE,
): ReferenceGoldMasks => {
  const fill = (view: ReferenceViewName, frame: RasterFrame) => {
    const mask = new Uint8Array(size * size)
    fillPolygonMask(mask, size, size, traces[view].points, frame)
    return mask
  }
  return {
    front: fill('front', frames.front),
    side: fill('side', frames.side),
    top: fill('top', frames.top),
    size,
  }
}

export const traceReferenceSheet = (
  grid: PixelGrid,
  knownDimension: number | KnownDimension,
  options: { threshold?: number; epsilon?: number } = {},
): ReferenceTraceResult => {
  const known = normalizeKnownDimension(knownDimension)
  const components = splitSheetComponents(grid, options.threshold ?? 40)
  const byView = Object.fromEntries(components.map((component) => [component.view, component.pixels])) as Record<
    ReferenceViewName,
    [number, number][]
  >
  const frontBox = bbox(byView.front)
  const sideBox = bbox(byView.side)
  const topBox = bbox(byView.top)
  const pixelAxes = [frontBox.width, frontBox.height, sideBox.width] as const
  const knownPixels = pixelAxes[axisIndex(known.axis)] ?? frontBox.width
  const metersPerPixel = known.meters / Math.max(knownPixels, 1)
  const epsilon = options.epsilon ?? 1.5

  const views: Record<ReferenceViewName, ReferenceViewTrace> = {
    front: {
      ...traceProfileFromComponent(byView.front, {
        widthM: frontBox.width * metersPerPixel,
        heightM: frontBox.height * metersPerPixel,
        origin: 'bottom-center',
        epsilon,
      }),
      view: 'front',
      plane: viewPlane('front'),
    },
    side: {
      ...traceProfileFromComponent(byView.side, {
        widthM: sideBox.width * metersPerPixel,
        heightM: sideBox.height * metersPerPixel,
        origin: 'bottom-center',
        epsilon,
      }),
      view: 'side',
      plane: viewPlane('side'),
    },
    top: {
      ...traceProfileFromComponent(byView.top, {
        widthM: topBox.width * metersPerPixel,
        heightM: topBox.height * metersPerPixel,
        origin: 'center',
        epsilon,
      }),
      view: 'top',
      plane: viewPlane('top'),
    },
  }

  const overall_m: [number, number, number] = [
    views.front.widthM,
    views.front.heightM,
    views.side.widthM,
  ]

  const pair = (name: string, expected: number, actual: number) => {
    const error = expected <= 0 ? 0 : Math.abs(actual - expected) / expected
    return { pair: name, expected, actual, error, ok: error <= CONSISTENCY }
  }

  const consistency = [
    pair('front.x/top.x', views.front.widthM, views.top.widthM),
    pair('front.y/side.y', views.front.heightM, views.side.heightM),
    pair('side.z/top.z', views.side.widthM, views.top.heightM),
  ]

  return {
    views,
    overall_m,
    metersPerPixel,
    consistency,
    consistent: consistency.every((entry) => entry.ok),
  }
}
