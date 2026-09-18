import { z } from 'zod'
import { defineCapability } from './types'

export const resetWorkspaceSelectionCapability = defineCapability({
  type: 'reset_workspace_selection',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('reset_workspace_selection'),
  }),
  safeImmediate: true,
  describe: 'Clear all active node, zone, or element selections across the workspace',
  examples: ['deselect all', 'clear selection'],
  aliases: {
    en: ['deselect all', 'clear selection', 'reset selection'],
    es: ['deseleccionar todo', 'limpiar seleccion'],
  },
})

export const setPhaseCapability = defineCapability({
  type: 'set_phase',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('set_phase'),
    phase: z.enum(['site', 'structure', 'furnish', 'cad']),
  }),
  safeImmediate: true,
  describe: 'Switch the editor phase to site, structure, furnish, or cad',
  examples: ['switch to structure', 'go to furnish mode'],
  aliases: {
    en: ['switch to phase', 'go to structure', 'open cad phase'],
    es: ['cambiar a fase', 'ir a estructura', 'abrir fase cad'],
  },
})

export const setModeCapability = defineCapability({
  type: 'set_mode',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('set_mode'),
    mode: z.enum(['select', 'edit', 'delete', 'build']),
  }),
  safeImmediate: true,
  describe: 'Switch editor interaction mode (select, edit, delete, build)',
  examples: ['switch to select mode', 'enable edit mode'],
  aliases: {
    en: ['select mode', 'edit mode', 'delete mode', 'build mode'],
    es: ['modo seleccion', 'modo edicion', 'modo eliminar', 'modo construccion'],
  },
})

export const reparentNodeCapability = defineCapability({
  type: 'reparent_node',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('reparent_node'),
    nodeId: z.string(),
    newParentId: z.string(),
  }),
  safeImmediate: false,
  describe: 'Move a node to a different parent container in the scene hierarchy',
  examples: ['move this item into room A', 'reparent to building 1'],
  aliases: {
    en: ['reparent node', 'move into parent', 'attach to parent'],
    es: ['reparentar nodo', 'mover a contenedor', 'adjuntar a padre'],
  },
})

export const setNodeMetadataCapability = defineCapability({
  type: 'set_node_metadata',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('set_node_metadata'),
    nodeId: z.string(),
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  safeImmediate: true,
  describe: 'Set a custom metadata key-value pair on a scene node',
  examples: ['tag this sofa as priority', 'mark level as approved'],
  aliases: {
    en: ['set metadata', 'tag node', 'add custom attribute'],
    es: ['establecer metadatos', 'etiquetar nodo', 'anadir atributo'],
  },
})

export const setWorkspaceCapability = defineCapability({
  type: 'set_workspace',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('set_workspace'),
    workspace: z.enum(['architecture', 'cad']),
  }),
  safeImmediate: true,
  describe: 'Switch between the architecture world and the CAD world before phase tools',
  examples: ['switch to CAD', 'open architecture', 'go to the part workspace'],
  aliases: {
    en: ['switch workspace', 'open cad world', 'open architecture world'],
    es: ['cambiar espacio', 'abrir mundo cad', 'abrir arquitectura'],
  },
})

export const placeCadBodyInArchitectureCapability = defineCapability({
  type: 'place_cad_body_in_architecture',
  domain: 'workspace',
  schema: z.object({
    type: z.literal('place_cad_body_in_architecture'),
    bodyId: z.string().optional(),
    levelId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Place a CAD body definition into the architecture world as a level instance',
  examples: ['put this bracket on the kitchen wall', 'place the CAD part in the building'],
  aliases: {
    en: ['place cad part', 'put part in building', 'insert cad body'],
    es: ['colocar pieza cad', 'poner pieza en el edificio'],
  },
})

export const workspaceCapabilities = [
  resetWorkspaceSelectionCapability,
  setWorkspaceCapability,
  setPhaseCapability,
  setModeCapability,
  reparentNodeCapability,
  setNodeMetadataCapability,
  placeCadBodyInArchitectureCapability,
]
