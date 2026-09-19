export const ITEM_SLAB_LIFT_SKIP_TYPES = ['item', 'cad-body', 'cad-instance'] as const

export const shouldLiftItemToSlab = (parent?: { type: string } | null) => {
  if (!parent) return true
  return !ITEM_SLAB_LIFT_SKIP_TYPES.includes(parent.type as (typeof ITEM_SLAB_LIFT_SKIP_TYPES)[number])
}
