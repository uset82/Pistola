import type { AssetInput } from '@pascal-app/core'
import { CATALOG_ITEMS } from '../../components/ui/item-catalog/catalog-items'

const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

export const PRIMITIVE_TYPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'wedge'] as const

export const PRIMITIVE_CATALOG_ITEMS = PRIMITIVE_TYPES.map((prim) => ({
  id: `primitive-${prim}`,
  name: prim.charAt(0).toUpperCase() + prim.slice(1),
  category: 'primitives',
  attachTo: null as string | null,
  tags: [prim, 'primitive', prim === 'box' ? 'cube' : prim],
}))

export const listAssistantCatalogItems = () => [
  ...PRIMITIVE_CATALOG_ITEMS,
  ...CATALOG_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    attachTo: item.attachTo ?? null,
    tags: item.tags ?? [],
  })),
]

export const findCatalogItem = (query: string): AssetInput | null => {
  const normalizedQuery = normalize(query)

  const exact =
    CATALOG_ITEMS.find((item) => normalize(item.id) === normalizedQuery) ??
    CATALOG_ITEMS.find((item) => normalize(item.name) === normalizedQuery)

  if (exact) return exact

  const SEARCHABLE_PRIMITIVES = ['box', 'cube', ...PRIMITIVE_TYPES] as const
  const matchedPrim = SEARCHABLE_PRIMITIVES.find(
    (p) => normalizedQuery === p || normalizedQuery.startsWith(`${p} `) || normalizedQuery.endsWith(` ${p}`) || normalizedQuery.includes(`primitive ${p}`) || normalizedQuery.includes(`primitive-${p}`)
  )
  if (matchedPrim) {
    const prim = matchedPrim === 'cube' ? 'box' : matchedPrim
    return {
      id: `primitive-${prim}`,
      name: `${prim.charAt(0).toUpperCase() + prim.slice(1)}`,
      category: 'primitives',
      thumbnail: '',
      src: '',
      primitive: prim as 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'wedge',
      dimensions: [1, 1, 1],
      color: '#60a5fa',
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }
  }

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
