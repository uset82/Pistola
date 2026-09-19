export type AgentSlashCommand =
  | { kind: 'manual' }
  | { kind: 'inspect'; query?: Record<string, unknown> }
  | { kind: 'validate'; actions: unknown[] }
  | { kind: 'run'; actions: unknown[] }
  | { kind: 'recipe'; name: string; params: Record<string, unknown> }
  | { kind: 'cad'; spec: Record<string, unknown> }

const extractJson = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? text).trim()
  if (!raw) return undefined
  return JSON.parse(raw)
}

export const parseAssistantAgentCommand = (prompt: string): AgentSlashCommand | null => {
  const trimmed = prompt.trim()
  const match = trimmed.match(/^\/(run|validate|inspect|recipe|cad|manual)\b([\s\S]*)$/i)
  if (!match?.[1]) return null

  const verb = match[1].toLowerCase()
  const rest = match[2]?.trim() ?? ''

  if (verb === 'manual') return { kind: 'manual' }
  if (verb === 'inspect') {
    if (!rest) return { kind: 'inspect' }
    const query = extractJson(rest)
    return { kind: 'inspect', query: query && typeof query === 'object' ? (query as Record<string, unknown>) : undefined }
  }
  if (verb === 'recipe') {
    const nameMatch = rest.match(/^([A-Za-z0-9_-]+)\s*([\s\S]*)$/)
    const name = nameMatch?.[1]
    if (!name) throw new Error('Usage: /recipe <name> {json}')
    const params = nameMatch?.[2]?.trim() ? (extractJson(nameMatch[2]) as Record<string, unknown>) : {}
    return { kind: 'recipe', name, params: params && typeof params === 'object' ? params : {} }
  }
  if (verb === 'cad') {
    const spec = extractJson(rest)
    if (!spec || typeof spec !== 'object') throw new Error('Usage: /cad {spec}')
    return { kind: 'cad', spec: spec as Record<string, unknown> }
  }

  const actions = extractJson(rest)
  if (!Array.isArray(actions)) throw new Error(`Usage: /${verb} [actions] or a JSON code block`)
  if (verb === 'validate') return { kind: 'validate', actions }
  return { kind: 'run', actions }
}
