import type { AssistantAction } from '../assistant/types'
import type { BlueprintV2 } from '../blueprint'

export type ExampleKind = 'technique' | 'subassembly' | 'recipe' | 'library'

export type ExampleParams = {
  width?: number
  height?: number
  depth?: number
  color?: string
  at?: [number, number, number]
  count?: number
  spacing?: number
  levelId?: string
}

export type ResolvedExampleParams = ExampleParams & {
  at: [number, number, number]
  width: number
  height: number
  depth: number
}

export type AgentExample = {
  id: string
  title: string
  kind: ExampleKind
  keywords: string[]
  technique?: string
  partIds: string[]
  defaults: ExampleParams
  actions: (params: ResolvedExampleParams) => AssistantAction[]
  blueprint: (params: ResolvedExampleParams) => Partial<BlueprintV2> & { title?: string; parts: BlueprintV2['parts'] }
}

export type ExampleHit = {
  id: string
  title: string
  kind: ExampleKind
  keywords: string[]
  technique?: string
  score: number
}

export type InstantiatedExample = {
  id: string
  title: string
  kind: ExampleKind
  partIds: string[]
  params: ResolvedExampleParams
  blueprint: ReturnType<AgentExample['blueprint']>
  actions: AssistantAction[]
  batches: AssistantAction[][]
  scores: null
  renders: []
}
