import type { AssistantAction } from '../assistant/types'
import type { ReferenceTraceResult } from './types'

export const hullActionFromTrace = (trace: ReferenceTraceResult): Extract<AssistantAction, { type: 'build_cad_solid' }> => ({
  type: 'build_cad_solid',
  name: 'reference-hull',
  partId: 'hull',
  role: 'hull',
  spec: {
    op: 'intersect_profiles',
    profileXY: trace.views.front.points,
    profileZY: trace.views.side.points,
    profileXZ: trace.views.top.points,
  },
  position: [0, 0, 0],
})
