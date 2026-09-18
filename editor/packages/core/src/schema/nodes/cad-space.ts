import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { CadBodyNode } from './cad-body'
import { CadSketchNode } from './cad-sketch'

export const CadSpaceNode = BaseNode.extend({
  id: objectId('cspace'),
  type: nodeType('cad-space'),
  children: z.array(z.union([CadSketchNode.shape.id, CadBodyNode.shape.id])).default([]),
}).describe(
  dedent`
  CAD space node - infinite CAD world root
  - children: CAD sketch and body definitions
  - not a site boundary and not a building level
  `,
)

export type CadSpaceNode = z.infer<typeof CadSpaceNode>
