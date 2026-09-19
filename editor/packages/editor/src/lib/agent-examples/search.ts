import { AGENT_EXAMPLES, exampleById } from './catalog'
import { chunkActions, resolveParams, stampActions } from './helpers'
import type { ExampleHit, ExampleKind, ExampleParams, InstantiatedExample } from './types'

export const searchExamples = (query = '', kind?: ExampleKind): ExampleHit[] => {
  const tokens = query.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean)
  return AGENT_EXAMPLES
    .filter((entry) => !kind || entry.kind === kind)
    .map((entry) => {
      let score = tokens.length === 0 ? 1 : 0
      for (const token of tokens) {
        if (entry.id === token || entry.id === `technique-${token}` || entry.id === `recipe-${token}`) score += 10
        if (entry.id.includes(token)) score += 4
        if (entry.title.toLowerCase().includes(token)) score += 3
        if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(token))) score += 2
        if (entry.technique?.toLowerCase() === token) score += 5
      }
      return {
        id: entry.id,
        title: entry.title,
        kind: entry.kind,
        keywords: entry.keywords,
        technique: entry.technique,
        score,
      }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

export const getExample = (input: { id: string; params?: ExampleParams; at?: [number, number, number] }): InstantiatedExample => {
  const example = exampleById(input.id)
  if (!example) throw new Error(`Unknown example "${input.id}".`)
  const params = resolveParams(example.defaults, { ...input.params, at: input.at ?? input.params?.at })
  const raw = example.actions(params)
  const actions = example.kind === 'recipe' ? stampActions(raw, { ...params, at: [0, 0, 0] }) : stampActions(raw, params)
  return {
    id: example.id,
    title: example.title,
    kind: example.kind,
    partIds: example.partIds,
    params,
    blueprint: example.blueprint(params),
    actions,
    batches: chunkActions(actions),
    scores: null,
    renders: [],
  }
}
