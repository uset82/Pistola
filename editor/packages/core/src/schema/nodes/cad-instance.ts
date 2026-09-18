import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const CadInstanceNode = BaseNode.extend({
  id: objectId('cinst'),
  type: nodeType('cad-instance'),
  sourceCadBodyId: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  scale: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
}).describe(
  dedent`
  CAD instance node - an architecture placement of a CAD body definition
  - sourceCadBodyId: the cad-body that owns the geometry
  - position/rotation/scale: placement on a building level
  `,
)

export type CadInstanceNode = z.infer<typeof CadInstanceNode>
