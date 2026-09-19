import { useScene } from '@pascal-app/core'
import type { AssistantAction } from '../assistant/types'
import type { ExampleParams, ResolvedExampleParams } from './types'

export const resolveParams = (defaults: ExampleParams, params: ExampleParams = {}): ResolvedExampleParams => ({
  width: params.width ?? defaults.width ?? 1,
  height: params.height ?? defaults.height ?? 1,
  depth: params.depth ?? defaults.depth ?? 1,
  color: params.color ?? defaults.color,
  count: params.count ?? defaults.count,
  spacing: params.spacing ?? defaults.spacing,
  levelId: params.levelId ?? defaults.levelId,
  at: params.at ?? defaults.at ?? [0, 0, 0],
})

export const currentLevelId = () =>
  Object.values(useScene.getState().nodes).find((node) => node?.type === 'level')?.id

export const addVec = (
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export const place = (
  name: string,
  assetId: string,
  position: [number, number, number],
  scale: [number, number, number],
  extra: Partial<AssistantAction> & { color?: string; refId?: string; parentId?: string } = {},
): AssistantAction =>
  ({
    type: 'place_item',
    name,
    assetId,
    placement: 'explicit',
    position,
    scale,
    color: extra.color,
    refId: extra.refId,
    parentId: extra.parentId,
    levelId: 'LEVEL',
    allowOverlap: true,
  }) as AssistantAction

export const chunkActions = (actions: AssistantAction[], size = 25) => {
  const batches: AssistantAction[][] = []
  for (let i = 0; i < actions.length; i += size) batches.push(actions.slice(i, i + size))
  return batches
}

export const stampActions = (actions: AssistantAction[], params: ResolvedExampleParams): AssistantAction[] => {
  const levelId = params.levelId ?? currentLevelId() ?? 'LEVEL'
  return actions.map((action) => {
    const next = { ...action } as AssistantAction & {
      levelId?: string
      position?: [number, number, number]
      parentId?: string
    }
    if (next.levelId === 'LEVEL') next.levelId = levelId
    if (next.position && !next.parentId && action.type !== 'build_cad_solid') {
      next.position = addVec(next.position, params.at)
    }
    if (action.type === 'build_cad_solid' && next.position) {
      next.position = addVec(next.position, params.at)
    }
    return next
  })
}
