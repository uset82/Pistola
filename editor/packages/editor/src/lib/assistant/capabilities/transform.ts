import { z } from 'zod'
import {
  AssistantPoint3Schema,
  AssistantTransformModeSchema,
  AssistantTransformPivotSchema,
} from '../types'
import { defineCapability } from './types'

export const setTransformModeCapability = defineCapability({
  type: 'set_transform_mode',
  domain: 'transform',
  schema: z.object({
    type: z.literal('set_transform_mode'),
    transformMode: AssistantTransformModeSchema,
  }),
  safeImmediate: true,
  describe: 'Activate move, rotate, or scale gizmo transform mode',
  examples: ['switch to move tool', 'enable rotate gizmo'],
  aliases: {
    en: ['move tool', 'rotate tool', 'scale tool'],
    es: ['herramienta mover', 'herramienta rotar', 'herramienta escalar'],
  },
})

export const setTransformPivotCapability = defineCapability({
  type: 'set_transform_pivot',
  domain: 'transform',
  schema: z.object({
    type: z.literal('set_transform_pivot'),
    pivot: AssistantTransformPivotSchema,
  }),
  safeImmediate: true,
  describe: 'Toggle transform pivot between bounds-center and asset-origin',
  examples: ['use center pivot', 'transform from origin'],
  aliases: {
    en: ['pivot center', 'pivot origin'],
    es: ['pivote central', 'pivote origen'],
  },
})

export const repositionTargetCapability = defineCapability({
  type: 'reposition_target',
  domain: 'transform',
  schema: z.object({
    type: z.literal('reposition_target'),
    nodeId: z.string().optional(),
  }),
  safeImmediate: true,
  describe: 'Enter interactive repositioning mode for the selected target',
  examples: ['reposition this sofa', 'move selected object interactively'],
  aliases: {
    en: ['reposition', 'interactive move'],
    es: ['reposicionar', 'mover interactivamente'],
  },
})

export const moveTargetCapability = defineCapability({
  type: 'move_target',
  domain: 'transform',
  schema: z
    .object({
      type: z.literal('move_target'),
      nodeId: z.string().optional(),
      position: AssistantPoint3Schema.optional(),
      delta: AssistantPoint3Schema.optional(),
    })
    .refine((value) => value.position || value.delta, {
      message: 'move_target requires position or delta.',
      path: ['position'],
    }),
  safeImmediate: false,
  describe: 'Move target node to an absolute position or by an offset delta',
  examples: ['move sofa left 1 meter', 'set position to [0, 0, 2]'],
  aliases: {
    en: ['move target', 'shift position', 'offset node'],
    es: ['mover objetivo', 'desplazar nodo', 'cambiar posicion'],
  },
})

export const rotateTargetCapability = defineCapability({
  type: 'rotate_target',
  domain: 'transform',
  schema: z
    .object({
      type: z.literal('rotate_target'),
      nodeId: z.string().optional(),
      rotation: AssistantPoint3Schema.optional(),
      rotationY: z.number().optional(),
    })
    .refine((value) => value.rotation || typeof value.rotationY === 'number', {
      message: 'rotate_target requires rotation or rotationY.',
      path: ['rotation'],
    }),
  safeImmediate: false,
  describe: 'Rotate target node around Y axis or 3D Euler angles',
  examples: ['rotate table 45 degrees', 'turn sofa to face desk'],
  aliases: {
    en: ['rotate target', 'turn object', 'change orientation'],
    es: ['rotar objetivo', 'girar objeto', 'cambiar orientacion'],
  },
})

export const scaleTargetCapability = defineCapability({
  type: 'scale_target',
  domain: 'transform',
  schema: z.object({
    type: z.literal('scale_target'),
    nodeId: z.string().optional(),
    scale: AssistantPoint3Schema,
  }),
  safeImmediate: false,
  describe: 'Scale target node by 3D factor vector [x, y, z]',
  examples: ['scale by [1.5, 1.5, 1.5]', 'double the size'],
  aliases: {
    en: ['scale target', 'resize object'],
    es: ['escalar objetivo', 'redimensionar objeto'],
  },
})

export const duplicateTargetCapability = defineCapability({
  type: 'duplicate_target',
  domain: 'transform',
  schema: z.object({
    type: z.literal('duplicate_target'),
    nodeId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Create an exact duplicate of the target node in place',
  examples: ['duplicate sofa', 'copy selected element'],
  aliases: {
    en: ['duplicate', 'copy node in place'],
    es: ['duplicar', 'copiar elemento'],
  },
})

export const duplicateRepositionTargetCapability = defineCapability({
  type: 'duplicate_reposition_target',
  domain: 'transform',
  schema: z.object({
    type: z.literal('duplicate_reposition_target'),
    nodeId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Duplicate target and immediately enter placement drag mode',
  examples: ['duplicate and place next to it'],
  aliases: {
    en: ['duplicate and move', 'clone with placement'],
    es: ['duplicar y colocar', 'clonar con posicion'],
  },
})

export const deleteTargetCapability = defineCapability({
  type: 'delete_target',
  domain: 'transform',
  schema: z.object({
    type: z.literal('delete_target'),
    nodeId: z.string().optional(),
  }),
  destructive: true,
  describe: 'Delete the selected or target node from the scene',
  examples: ['delete this wall', 'remove selected sofa'],
  aliases: {
    en: ['delete target', 'remove element'],
    es: ['eliminar objetivo', 'borrar elemento'],
  },
})

export const deleteNodesCapability = defineCapability({
  type: 'delete_nodes',
  domain: 'transform',
  schema: z.object({
    type: z.literal('delete_nodes'),
    nodeIds: z.array(z.string()).min(1),
  }),
  destructive: true,
  describe: 'Batch delete multiple specified scene nodes',
  examples: ['delete selected items', 'remove highlighted walls'],
  aliases: {
    en: ['delete nodes', 'batch delete'],
    es: ['eliminar nodos', 'borrado multiple'],
  },
})

export const clearLevelContentsCapability = defineCapability({
  type: 'clear_level_contents',
  domain: 'transform',
  schema: z.object({
    type: z.literal('clear_level_contents'),
    levelId: z.string().optional(),
  }),
  destructive: true,
  describe: 'Remove all architectural elements, zones, and furniture on the level',
  examples: ['clean current level', 'clear all contents on floor 1'],
  aliases: {
    en: ['clear level', 'clean level contents', 'reset floor'],
    es: ['limpiar nivel', 'borrar contenido de planta'],
  },
})

export const transformCapabilities = [
  setTransformModeCapability,
  setTransformPivotCapability,
  repositionTargetCapability,
  moveTargetCapability,
  rotateTargetCapability,
  scaleTargetCapability,
  duplicateTargetCapability,
  duplicateRepositionTargetCapability,
  deleteTargetCapability,
  deleteNodesCapability,
  clearLevelContentsCapability,
]
