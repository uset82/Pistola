import type { OpenRouterModelOption } from './openrouter-model-catalog'

export type AssistantModelFilter = 'recommended' | 'free' | 'all'

export type AssistantModelGroup = {
  id: 'pinned' | 'recommended' | 'free' | 'paid'
  label: string
  models: OpenRouterModelOption[]
}

export const FREE_ROUTER_MODEL_ID = 'openrouter/free'

const VENDOR_PREFIX_MAX_LENGTH = 32

/**
 * Split catalog names like "Cohere: North Mini Code (free)" into a short title
 * and the vendor, so list rows stay single-line at panel width.
 */
export const describeModelName = (model: { id: string; name?: string | null }) => {
  if (model.id === FREE_ROUTER_MODEL_ID) {
    return { title: 'Free router', vendor: 'OpenRouter' }
  }

  let title = (model.name ?? '').trim() || model.id.split('/').pop() || model.id
  title = title.replace(/\s*\(free\)\s*$/i, '')

  let vendor: string | null = null
  const separator = title.indexOf(': ')
  if (separator > 0 && separator <= VENDOR_PREFIX_MAX_LENGTH) {
    vendor = title.slice(0, separator)
    title = title.slice(separator + 2)
  }

  return { title, vendor }
}

export const formatContextLength = (length?: number | null) => {
  if (!length || length <= 0) return null
  if (length >= 1_000_000) {
    return `${Number((length / 1_000_000).toFixed(1))}M`
  }
  if (length >= 1_000) return `${Math.round(length / 1_000)}k`
  return String(length)
}

const formatPerMillion = (perToken: string | undefined) => {
  const value = Number(perToken)
  if (!Number.isFinite(value) || value < 0) return null
  const perMillion = value * 1_000_000
  if (perMillion === 0) return '0'
  return perMillion < 1 ? perMillion.toFixed(2) : String(Number(perMillion.toPrecision(3)))
}

/** "free", or input/output dollars per million tokens, e.g. "$3/$15". */
export const formatModelPrice = (model: OpenRouterModelOption) => {
  if (model.isFree) return 'free'
  const prompt = formatPerMillion(model.pricing?.prompt)
  const completion = formatPerMillion(model.pricing?.completion)
  if (prompt === null || completion === null) return 'paid'
  return `$${prompt}/$${completion}`
}

const matchesQuery = (model: OpenRouterModelOption, query: string) => {
  if (!query) return true
  const { title, vendor } = describeModelName(model)
  return [model.id, model.name, title, vendor, model.description]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(query))
}

export const groupAssistantModels = ({
  models,
  filter,
  query,
  pinnedIds,
}: {
  models: OpenRouterModelOption[]
  filter: AssistantModelFilter
  query: string
  pinnedIds: string[]
}): AssistantModelGroup[] => {
  const normalizedQuery = query.trim().toLowerCase()
  const byId = new Map(models.map((model) => [model.id, model]))
  const pinnedSet = new Set(pinnedIds)

  const pinned = pinnedIds
    .map((id) => byId.get(id))
    .filter((model): model is OpenRouterModelOption => Boolean(model))
    .filter((model) => matchesQuery(model, normalizedQuery))
  const rest = models.filter(
    (model) => !pinnedSet.has(model.id) && matchesQuery(model, normalizedQuery),
  )

  const groups: AssistantModelGroup[] = [{ id: 'pinned', label: 'Pinned', models: pinned }]
  if (filter === 'recommended') {
    groups.push({
      id: 'recommended',
      label: 'Recommended',
      models: rest.filter((model) => model.isRecommended),
    })
  } else if (filter === 'free') {
    groups.push({ id: 'free', label: 'Free', models: rest.filter((model) => model.isFree) })
  } else {
    groups.push({ id: 'free', label: 'Free', models: rest.filter((model) => model.isFree) })
    groups.push({ id: 'paid', label: 'Paid', models: rest.filter((model) => !model.isFree) })
  }

  return groups.filter((group) => group.models.length > 0)
}
