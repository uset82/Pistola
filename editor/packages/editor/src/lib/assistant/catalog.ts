import type { AssetInput } from '@pascal-app/core'
import { CATALOG_ITEMS } from '../../components/ui/item-catalog/catalog-items'

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

export const listAssistantCatalogItems = () =>
  CATALOG_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    attachTo: item.attachTo ?? null,
    tags: item.tags ?? [],
  }))

export const findCatalogItem = (query: string): AssetInput | null => {
  const normalizedQuery = normalize(query)

  const exact =
    CATALOG_ITEMS.find((item) => normalize(item.id) === normalizedQuery) ??
    CATALOG_ITEMS.find((item) => normalize(item.name) === normalizedQuery)

  if (exact) return exact

  const fuzzy = CATALOG_ITEMS.find((item) => {
    const tags = item.tags?.map(normalize) ?? []
    return (
      normalize(item.id).includes(normalizedQuery) ||
      normalize(item.name).includes(normalizedQuery) ||
      tags.some((tag) => tag.includes(normalizedQuery))
    )
  })

  return fuzzy ?? null
}
