import {
  createForegroundMask,
  findConnectedComponents,
  type PixelGrid,
} from '../cad/silhouette-tracer'
import type { ReferenceViewName } from './types'

export const splitSheetComponents = (
  grid: PixelGrid,
  threshold = 40,
): { view: ReferenceViewName; pixels: [number, number][] }[] => {
  const mask = createForegroundMask(grid, threshold)
  const components = findConnectedComponents(mask, 16)
  if (components.length < 3) {
    throw new Error(
      `Expected three left-to-right views (front, side, top); found ${components.length} component(s).`,
    )
  }

  const ranked = components
    .map((pixels) => {
      const avgX = pixels.reduce((sum, point) => sum + point[0], 0) / pixels.length
      return { pixels, avgX }
    })
    .sort((left, right) => left.avgX - right.avgX)
    .slice(0, 3)

  const views: ReferenceViewName[] = ['front', 'side', 'top']
  return ranked.map((entry, index) => ({
    view: views[index] ?? 'front',
    pixels: entry.pixels,
  }))
}
