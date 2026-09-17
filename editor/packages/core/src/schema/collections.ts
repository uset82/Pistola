import { generateId } from './base'
import type { AnyNodeId } from './types'

export type CollectionId = `collection_${string}`
export const collectionNodeTypes = [
  'item',
  'wall',
  'slab',
  'ceiling',
  'roof',
  'zone',
  'scan',
  'guide',
  'window',
  'door',
  'cad-sketch',
  'cad-body',
] as const
export type CollectionNodeType = (typeof collectionNodeTypes)[number]

export type Collection = {
  id: CollectionId
  name: string
  color?: string
  nodeIds: AnyNodeId[]
  controlNodeId?: AnyNodeId
}

export const generateCollectionId = (): CollectionId => generateId('collection')
