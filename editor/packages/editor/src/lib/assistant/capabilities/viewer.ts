import { z } from 'zod'
import { defineCapability } from './types'

export const setCameraModeCapability = defineCapability({
  type: 'set_camera_mode',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_camera_mode'),
    cameraMode: z.enum(['perspective', 'orthographic']),
  }),
  safeImmediate: true,
  describe: 'Set camera projection mode to perspective or orthographic',
  examples: ['switch to 2D orthographic view', 'use perspective camera'],
  aliases: {
    en: ['perspective view', 'orthographic view', 'isometric camera'],
    es: ['vista perspectiva', 'vista ortografica'],
  },
})

export const setThemeCapability = defineCapability({
  type: 'set_theme',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_theme'),
    theme: z.enum(['light', 'dark']),
  }),
  safeImmediate: true,
  describe: 'Switch the workspace theme between light and dark mode',
  examples: ['switch to dark mode', 'enable light theme'],
  aliases: {
    en: ['dark mode', 'light mode', 'switch theme'],
    es: ['modo oscuro', 'modo claro', 'cambiar tema'],
  },
})

export const setLevelViewModeCapability = defineCapability({
  type: 'set_level_view_mode',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_level_view_mode'),
    levelMode: z.enum(['manual', 'stacked', 'exploded', 'solo']),
  }),
  safeImmediate: true,
  describe: 'Configure how building levels are displayed (manual, stacked, exploded, solo)',
  examples: ['explode levels', 'solo this floor', 'stack levels'],
  aliases: {
    en: ['exploded view', 'solo level', 'stacked levels'],
    es: ['vista explosionada', 'aislar nivel', 'apilar niveles'],
  },
})

export const setWallViewModeCapability = defineCapability({
  type: 'set_wall_view_mode',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_wall_view_mode'),
    wallMode: z.enum(['up', 'cutaway', 'down']),
  }),
  safeImmediate: true,
  describe: 'Set the wall display mode (up, cutaway, down)',
  examples: ['cutaway walls', 'show walls full height', 'hide walls down'],
  aliases: {
    en: ['cutaway walls', 'walls up', 'walls down'],
    es: ['paredes seccionadas', 'levantar paredes', 'bajar paredes'],
  },
})

export const setPreviewModeCapability = defineCapability({
  type: 'set_preview_mode',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_preview_mode'),
    enabled: z.boolean(),
  }),
  safeImmediate: true,
  describe: 'Toggle presentation / preview mode on or off',
  examples: ['enable preview mode', 'exit preview'],
  aliases: {
    en: ['preview mode', 'presentation mode'],
    es: ['modo presentacion', 'modo vista previa'],
  },
})

export const setScansVisibilityCapability = defineCapability({
  type: 'set_scans_visibility',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_scans_visibility'),
    enabled: z.boolean(),
  }),
  safeImmediate: true,
  describe: 'Toggle visibility of 3D scanned point clouds or meshes',
  examples: ['show scans', 'hide point clouds'],
  aliases: {
    en: ['show scans', 'hide scans'],
    es: ['mostrar escaneos', 'ocultar escaneos'],
  },
})

export const setGuidesVisibilityCapability = defineCapability({
  type: 'set_guides_visibility',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_guides_visibility'),
    enabled: z.boolean(),
  }),
  safeImmediate: true,
  describe: 'Toggle visibility of visual alignment guides',
  examples: ['show guides', 'hide alignment lines'],
  aliases: {
    en: ['show guides', 'hide guides'],
    es: ['mostrar guias', 'ocultar guias'],
  },
})

export const setGridVisibilityCapability = defineCapability({
  type: 'set_grid_visibility',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_grid_visibility'),
    enabled: z.boolean(),
  }),
  safeImmediate: true,
  describe: 'Toggle floor grid visibility',
  examples: ['turn on grid', 'hide grid'],
  aliases: {
    en: ['show grid', 'hide grid', 'toggle grid'],
    es: ['mostrar rejilla', 'ocultar rejilla'],
  },
})

export const cameraTopViewCapability = defineCapability({
  type: 'camera_top_view',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('camera_top_view'),
  }),
  safeImmediate: true,
  describe: 'Orient the camera directly above the scene facing downwards',
  examples: ['top down view', 'look from above'],
  aliases: {
    en: ['top view', 'plan view', 'look from top'],
    es: ['vista superior', 'vista en planta', 'mirar desde arriba'],
  },
})

export const orbitCameraCapability = defineCapability({
  type: 'orbit_camera',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('orbit_camera'),
    direction: z.enum(['cw', 'ccw']).optional(),
    degrees: z.number().positive().max(360).optional(),
  }),
  safeImmediate: true,
  describe: 'Rotate the camera around the scene center or selected target',
  examples: ['rotate camera 90 degrees', 'orbit clockwise'],
  aliases: {
    en: ['orbit camera', 'rotate view', 'turn camera around'],
    es: ['orbitar camara', 'rotar vista', 'girar camara'],
  },
})

export const captureCameraSnapshotCapability = defineCapability({
  type: 'capture_camera_snapshot',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('capture_camera_snapshot'),
    nodeId: z.string().optional(),
  }),
  safeImmediate: true,
  describe: 'Save the current camera angle and position to a target node',
  examples: ['save camera angle', 'bookmark current view'],
  aliases: {
    en: ['save camera view', 'capture snapshot'],
    es: ['guardar vista de camara', 'capturar instantanea'],
  },
})

export const viewCameraSnapshotCapability = defineCapability({
  type: 'view_camera_snapshot',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('view_camera_snapshot'),
    nodeId: z.string().optional(),
  }),
  safeImmediate: true,
  describe: 'Restore the camera to a saved snapshot position',
  examples: ['go to saved view', 'load camera snapshot'],
  aliases: {
    en: ['restore camera view', 'view snapshot'],
    es: ['restaurar vista de camara', 'ver instantanea'],
  },
})

export const clearCameraSnapshotCapability = defineCapability({
  type: 'clear_camera_snapshot',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('clear_camera_snapshot'),
    nodeId: z.string().optional(),
  }),
  safeImmediate: true,
  describe: 'Delete a saved camera snapshot from a target node',
  examples: ['remove camera bookmark', 'clear snapshot'],
  aliases: {
    en: ['clear camera view', 'delete snapshot'],
    es: ['borrar vista de camara', 'limpiar instantanea'],
  },
})

export const focusCameraOnNodesCapability = defineCapability({
  type: 'focus_camera_on_nodes',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('focus_camera_on_nodes'),
    nodeIds: z.array(z.string()).min(1),
  }),
  safeImmediate: true,
  describe: 'Frame and focus the camera on specified scene nodes',
  examples: ['focus camera on sofa', 'zoom in on selected wall'],
  aliases: {
    en: ['focus camera on', 'frame selection', 'zoom to nodes'],
    es: ['enfocar camara en', 'centrar seleccion', 'hacer zoom a nodos'],
  },
})

export const setViewCapability = defineCapability({
  type: 'set_view',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_view'),
    view: z.enum(['top', 'bottom', 'front', 'back', 'left', 'right', 'left-45', 'right-45', 'iso']),
  }),
  safeImmediate: true,
  describe: 'Move the live camera to a named view of the current parts',
  examples: ['front view', 'show the isometric view'],
})

export const setCameraCapability = defineCapability({
  type: 'set_camera',
  domain: 'viewer',
  schema: z.object({
    type: z.literal('set_camera'),
    position: z.tuple([z.number(), z.number(), z.number()]),
    target: z.tuple([z.number(), z.number(), z.number()]),
  }),
  safeImmediate: true,
  describe: 'Move the live camera to an exact position and target',
  examples: ['set the camera to this position'],
})

export const viewerCapabilities = [
  setCameraModeCapability,
  setThemeCapability,
  setLevelViewModeCapability,
  setWallViewModeCapability,
  setPreviewModeCapability,
  setScansVisibilityCapability,
  setGuidesVisibilityCapability,
  setGridVisibilityCapability,
  cameraTopViewCapability,
  orbitCameraCapability,
  setViewCapability,
  setCameraCapability,
  captureCameraSnapshotCapability,
  viewCameraSnapshotCapability,
  clearCameraSnapshotCapability,
  focusCameraOnNodesCapability,
]
