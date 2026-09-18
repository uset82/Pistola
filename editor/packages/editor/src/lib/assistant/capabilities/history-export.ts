import { z } from 'zod'
import { AssistantSceneExportFormatSchema } from '../types'
import { defineCapability } from './types'

export const setFullscreenCapability = defineCapability({
  type: 'set_fullscreen',
  domain: 'history/export',
  schema: z.object({
    type: z.literal('set_fullscreen'),
    enabled: z.boolean(),
  }),
  safeImmediate: true,
  describe: 'Toggle full screen mode for the editor canvas',
  examples: ['enter fullscreen', 'exit fullscreen'],
  aliases: {
    en: ['fullscreen', 'toggle fullscreen'],
    es: ['pantalla completa', 'alternar pantalla completa'],
  },
})

export const undoHistoryCapability = defineCapability({
  type: 'undo_history',
  domain: 'history/export',
  schema: z.object({
    type: z.literal('undo_history'),
  }),
  safeImmediate: true,
  describe: 'Undo the previous user action in the editor history stack',
  examples: ['undo', 'undo last action'],
  aliases: {
    en: ['undo', 'revert last action'],
    es: ['deshacer', 'revertir ultima accion'],
  },
})

export const redoHistoryCapability = defineCapability({
  type: 'redo_history',
  domain: 'history/export',
  schema: z.object({
    type: z.literal('redo_history'),
  }),
  safeImmediate: true,
  describe: 'Redo the previously undone action in the editor history stack',
  examples: ['redo', 'redo action'],
  aliases: {
    en: ['redo', 'repeat undone action'],
    es: ['rehacer', 'repetir accion deshecha'],
  },
})

export const exportSceneCapability = defineCapability({
  type: 'export_scene',
  domain: 'history/export',
  schema: z.object({
    type: z.literal('export_scene'),
    format: AssistantSceneExportFormatSchema,
  }),
  safeImmediate: true,
  describe: 'Export the complete 3D scene in JSON, IFC, or GLB format',
  examples: ['export as IFC', 'download scene as GLB', 'export json'],
  aliases: {
    en: ['export scene', 'export IFC', 'export GLB'],
    es: ['exportar escena', 'exportar IFC', 'exportar GLB'],
  },
})

export const copyShareLinkCapability = defineCapability({
  type: 'copy_share_link',
  domain: 'history/export',
  schema: z.object({
    type: z.literal('copy_share_link'),
  }),
  safeImmediate: true,
  describe: 'Copy the shareable link for this project to the clipboard',
  examples: ['copy share link', 'get project link'],
  aliases: {
    en: ['copy link', 'share link'],
    es: ['copiar enlace', 'compartir enlace'],
  },
})

export const takeScreenshotCapability = defineCapability({
  type: 'take_screenshot',
  domain: 'history/export',
  schema: z.object({
    type: z.literal('take_screenshot'),
  }),
  safeImmediate: true,
  describe: 'Capture and download a high-resolution viewport screenshot',
  examples: ['take screenshot', 'save picture of the scene'],
  aliases: {
    en: ['screenshot', 'capture viewport image'],
    es: ['captura de pantalla', 'guardar imagen de la escena'],
  },
})

export const historyExportCapabilities = [
  setFullscreenCapability,
  undoHistoryCapability,
  redoHistoryCapability,
  exportSceneCapability,
  copyShareLinkCapability,
  takeScreenshotCapability,
]
