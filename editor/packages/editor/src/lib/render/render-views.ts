import { checkStructure, collectStructureParts, type StructurePart } from '../structure'
import { pngDataUrl } from './png'
import { PART_HUES, drawGrid, maskIou, rasterizeParts, type RasterView } from './soft-raster'

export const RENDER_PANEL = 128
export const RENDER_GAP = 8
export const LEGEND_H = 28

export type CritiqueFix = { partId: string; change: string }

export type RenderCritique = {
  recognizable: boolean
  proportions: { planned?: [number, number, number]; measured: [number, number, number]; error?: number }
  everyPartVisible: { missing: string[] }
  worstView: { view: string; partId?: string }
  symmetry: { leftRightError: number }
  floatingOrSunk: string[]
  missingSignature: string | null
  palette: string[]
}

export type RenderViewsResult = {
  mime: 'image/png'
  dataUrl: string
  width: number
  height: number
  views: Array<{ name: string; mask: number[] }>
  critique: RenderCritique
  iou?: number
  structure: ReturnType<typeof checkStructure>
}

const hex = (rgb: readonly [number, number, number]) =>
  `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`

const blit = (
  dest: Uint8ClampedArray,
  destW: number,
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  ox: number,
  oy: number,
) => {
  for (let y = 0; y < srcH; y += 1) {
    dest.set(src.subarray(y * srcW * 4, (y + 1) * srcW * 4), ((oy + y) * destW + ox) * 4)
  }
}

const label = (dest: Uint8ClampedArray, destW: number, ox: number, oy: number, text: string) => {
  for (let i = 0; i < text.length; i += 1) {
    const x = ox + i * 4
    for (let y = 0; y < 6; y += 1) {
      const index = ((oy + y) * destW + x) * 4
      dest[index] = 15
      dest[index + 1] = 23
      dest[index + 2] = 42
      dest[index + 3] = 255
    }
  }
}

const unionSize = (parts: StructurePart[]): [number, number, number] => {
  if (parts.length === 0) return [0, 0, 0]
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i] ?? Infinity, part.box.min[i] ?? Infinity)
      max[i] = Math.max(max[i] ?? -Infinity, part.box.max[i] ?? -Infinity)
    }
  }
  return [
    (max[0] ?? 0) - (min[0] ?? 0),
    (max[1] ?? 0) - (min[1] ?? 0),
    (max[2] ?? 0) - (min[2] ?? 0),
  ]
}

const visibleParts = (view: RasterView, parts: StructurePart[]) => {
  const seen = new Set<number>()
  for (const id of view.ids) if (id >= 0) seen.add(id)
  return parts.filter((_, index) => seen.has(index))
}

export const critiqueRender = (
  parts: StructurePart[],
  views: RasterView[],
  planned?: [number, number, number],
): RenderCritique => {
  const structure = checkStructure()
  const measured = unionSize(parts)
  const error = planned
    ? Math.max(...planned.map((value, index) => (value > 0 ? Math.abs((measured[index] ?? 0) - value) / value : 0)))
    : undefined
  const missing = parts.filter((part, index) => views.every((view) => !view.ids.includes(index))).map((part) => part.name)
  const coverage = views.map((view) => ({
    view: view.name,
    count: visibleParts(view, parts).length,
    partId: parts[view.ids.find((id) => id >= 0) ?? -1]?.name,
  }))
  const worst = [...coverage].sort((a, b) => a.count - b.count)[0]
  const front = views.find((view) => view.name === 'front')
  let leftRightError = 0
  if (front) {
    let left = 0
    let right = 0
    for (let y = 0; y < front.height; y += 1) {
      for (let x = 0; x < front.width; x += 1) {
        if (!front.mask[y * front.width + x]) continue
        if (x < front.width / 2) left += 1
        else right += 1
      }
    }
    const denom = Math.max(left + right, 1)
    leftRightError = Math.abs(left - right) / denom
  }
  return {
    recognizable: parts.length > 0 && views.some((view) => view.mask.some(Boolean)),
    proportions: { planned, measured, error },
    everyPartVisible: { missing },
    worstView: { view: worst?.view ?? 'front', partId: worst?.partId },
    symmetry: { leftRightError },
    floatingOrSunk: structure.issues
      .filter((issue) => issue.code === 'FLOATING_PART' || issue.code === 'BELOW_FLOOR')
      .map((issue) => issue.partId),
    missingSignature: missing[0] ?? null,
    palette: parts.map((_, index) => hex(PART_HUES[index % PART_HUES.length] ?? PART_HUES[0])),
  }
}

export const renderViews = (input?: { planned?: [number, number, number]; goldMasks?: Record<string, Uint8Array> }) => {
  const parts = collectStructureParts()
  const names = ['front', 'side', 'top', 'iso'] as const
  const views = names.map((name) => {
    const raster = rasterizeParts(parts, name, RENDER_PANEL)
    drawGrid(raster)
    return raster
  })
  const width = RENDER_GAP * 3 + RENDER_PANEL * 2
  const height = RENDER_GAP * 3 + RENDER_PANEL * 2 + LEGEND_H
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
  const positions: Array<[number, number]> = [
    [RENDER_GAP, RENDER_GAP],
    [RENDER_GAP * 2 + RENDER_PANEL, RENDER_GAP],
    [RENDER_GAP, RENDER_GAP * 2 + RENDER_PANEL],
    [RENDER_GAP * 2 + RENDER_PANEL, RENDER_GAP * 2 + RENDER_PANEL],
  ]
  views.forEach((view, index) => {
    const [x, y] = positions[index] ?? [0, 0]
    blit(rgba, width, view.rgba, view.width, view.height, x, y)
    label(rgba, width, x + 4, y + 4, view.name.toUpperCase())
  })
  const measured = unionSize(parts)
  label(rgba, width, RENDER_GAP, height - 18, `W${measured[0].toFixed(2)} H${measured[1].toFixed(2)} D${measured[2].toFixed(2)}`)
  const critique = critiqueRender(parts, views, input?.planned)
  let iou: number | undefined
  if (input?.goldMasks) {
    const scores = views
      .map((view) => {
        const gold = input.goldMasks?.[view.name]
        return gold ? maskIou(view.mask, gold) : null
      })
      .filter((value): value is number => value != null)
    if (scores.length) iou = scores.reduce((sum, value) => sum + value, 0) / scores.length
  }
  return {
    mime: 'image/png' as const,
    dataUrl: pngDataUrl(width, height, rgba),
    width,
    height,
    views: views.map((view) => ({ name: view.name, mask: Array.from(view.mask) })),
    critique,
    iou,
    structure: checkStructure(),
  } satisfies RenderViewsResult
}
