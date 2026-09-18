import { z } from 'zod'
import {
  AssistantCadBooleanModeSchema,
  AssistantCatalogCategorySchema,
  AssistantPlacementSchema,
  AssistantPoint3Schema,
  AssistantSideSchema,
  AssistantToolSchema,
} from '../types'
import { defineCapability } from './types'

export const activateToolCapability = defineCapability({
  type: 'activate_tool',
  domain: 'furnish',
  schema: z.object({
    type: z.literal('activate_tool'),
    tool: AssistantToolSchema,
    catalogCategory: AssistantCatalogCategorySchema.optional().nullable(),
    cadBooleanMode: AssistantCadBooleanModeSchema.optional(),
  }),
  safeImmediate: true,
  describe: 'Activate an interactive drawing or placement tool in the editor',
  examples: ['select the item tool', 'switch to wall drawing tool'],
  aliases: {
    en: ['activate tool', 'select tool', 'use tool'],
    es: ['activar herramienta', 'seleccionar herramienta', 'usar herramienta'],
  },
})

export const placeItemCapability = defineCapability({
  type: 'place_item',
  domain: 'furnish',
  schema: z.object({
    type: z.literal('place_item'),
    assetId: z.string().min(1),
    name: z.string().optional(),
    levelId: z.string().optional(),
    targetNodeId: z.string().optional(),
    parentId: z.string().optional(),
    placement: AssistantPlacementSchema.default('explicit'),
    position: AssistantPoint3Schema.optional(),
    rotation: AssistantPoint3Schema.optional(),
    scale: AssistantPoint3Schema.optional(),
    side: AssistantSideSchema.optional(),
  }),
  safeImmediate: false,
  describe: 'Place a catalog item or asset in the scene with position, rotation, and parenting',
  examples: ['place sofa in the living room', 'add dining chair at [2, 0, 1]'],
  aliases: {
    en: ['place item', 'add furniture', 'insert asset'],
    es: ['colocar objeto', 'anadir mueble', 'poner item'],
  },
})

export const updateItemPropertiesCapability = defineCapability({
  type: 'update_item_properties',
  domain: 'furnish',
  schema: z
    .object({
      type: z.literal('update_item_properties'),
      nodeId: z.string(),
      position: AssistantPoint3Schema.optional(),
      rotation: AssistantPoint3Schema.optional(),
      scale: AssistantPoint3Schema.optional(),
    })
    .refine((value) => value.position || value.rotation || value.scale, {
      message: 'update_item_properties requires at least one property update.',
      path: ['position'],
    }),
  safeImmediate: false,
  describe: 'Update the position, rotation, or scale of an existing item in the scene',
  examples: ['scale the table by 1.2', 'rotate the chair 45 degrees'],
  aliases: {
    en: ['update item', 'adjust furniture properties'],
    es: ['actualizar mueble', 'ajustar propiedades de item'],
  },
})

export const furnishCapabilities = [
  activateToolCapability,
  placeItemCapability,
  updateItemPropertiesCapability,
]
