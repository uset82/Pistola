import type { AssistantAction } from '../assistant/types'
import { referenceGuideUri, type ReferenceRecord, type ReferenceViewName } from './types'

export const guideActionsFromReference = (
  record: ReferenceRecord,
  options: { levelId?: string } = {},
): Array<Extract<AssistantAction, { type: 'create_guide' }>> => {
  const [width, height, depth] = record.trace.overall_m
  const margin = 0.15
  const url = referenceGuideUri(record.id)
  const scaleFor = (meters: number) => Math.max(0.05, meters / 10)
  const positions: Record<ReferenceViewName, [number, number, number]> = {
    front: [0, height / 2, -(depth / 2) - margin],
    side: [-(width / 2) - margin, height / 2, 0],
    top: [0, 0.01, 0],
  }
  const rotations: Record<ReferenceViewName, [number, number, number]> = {
    front: [0, 0, 0],
    side: [0, Math.PI / 2, 0],
    top: [0, 0, 0],
  }
  return (['front', 'side', 'top'] as const).map((view) => ({
    type: 'create_guide' as const,
    name: `reference-${view}`,
    view,
    url,
    position: positions[view],
    rotation: rotations[view],
    scale: scaleFor(view === 'side' ? depth : width),
    opacity: 45,
    levelId: options.levelId,
  }))
}
