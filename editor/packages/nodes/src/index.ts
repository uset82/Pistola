import type { Plugin } from '@pascal-app/core'

/**
 * Built-in kinds that the local viewer already renders. Full geometry builders
 * from pascalorg/editor's @pascal-app/nodes package require a deeper core sync;
 * this plugin satisfies the public loadPlugin bootstrap contract and keeps CAD
 * kinds (cad-body, cad-sketch, …) available alongside architecture nodes.
 */
const KINDS = [
  'site',
  'building',
  'level',
  'wall',
  'slab',
  'ceiling',
  'door',
  'window',
  'zone',
  'roof',
  'roof-segment',
  'item',
  'guide',
  'scan',
  'cad-space',
  'cad-sketch',
  'cad-body',
  'cad-instance',
] as const

export const builtinPlugin: Plugin = {
  id: 'pascal:core',
  apiVersion: 1,
  nodes: KINDS.map((kind) => ({ kind, label: kind })),
}

export default builtinPlugin
