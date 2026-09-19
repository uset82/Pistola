import { z } from 'zod'
import {
  AssistantPoint2Schema,
  AssistantPoint3Schema,
  AssistantSideSchema,
  AssistantStructureLayerSchema,
} from '../types'
import { defineCapability } from './types'

export const setStructureLayerCapability = defineCapability({
  type: 'set_structure_layer',
  domain: 'structure',
  schema: z.object({
    type: z.literal('set_structure_layer'),
    layer: AssistantStructureLayerSchema,
  }),
  safeImmediate: true,
  describe: 'Switch the active structure sub-layer to zones or elements',
  examples: ['switch to zones layer', 'edit architectural elements'],
  aliases: {
    en: ['zones layer', 'elements layer'],
    es: ['capa de zonas', 'capa de elementos'],
  },
})

export const focusBuildingCapability = defineCapability({
  type: 'focus_building',
  domain: 'structure',
  schema: z.object({
    type: z.literal('focus_building'),
    buildingId: z.string(),
  }),
  safeImmediate: true,
  describe: 'Focus active view and selection on a specific building',
  examples: ['focus building 1', 'select main house'],
  aliases: {
    en: ['focus building', 'select building'],
    es: ['enfocar edificio', 'seleccionar edificio'],
  },
})

export const focusLevelCapability = defineCapability({
  type: 'focus_level',
  domain: 'structure',
  schema: z.object({
    type: z.literal('focus_level'),
    levelId: z.string(),
  }),
  safeImmediate: true,
  describe: 'Focus active view and selection on a specific level',
  examples: ['go to level 1', 'focus ground floor'],
  aliases: {
    en: ['focus level', 'go to floor'],
    es: ['enfocar nivel', 'ir a planta'],
  },
})

export const selectNodesCapability = defineCapability({
  type: 'select_nodes',
  domain: 'structure',
  schema: z.object({
    type: z.literal('select_nodes'),
    nodeIds: z.array(z.string()).default([]),
    zoneId: z.string().nullable().optional(),
  }),
  safeImmediate: true,
  describe: 'Set workspace selection to specific node IDs or a zone',
  examples: ['select wall 3', 'select bedroom zone'],
  aliases: {
    en: ['select nodes', 'highlight targets'],
    es: ['seleccionar nodos', 'resaltar elementos'],
  },
})

export const createLevelCapability = defineCapability({
  type: 'create_level',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_level'),
    buildingId: z.string().optional(),
    level: z.number().int().optional(),
    name: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Create a new vertical level/floor in the building',
  examples: ['add second floor', 'create level 2 named Bedroom Floor'],
  aliases: {
    en: ['create level', 'add floor', 'new level'],
    es: ['crear nivel', 'anadir planta', 'nuevo piso'],
  },
})

export const renameLevelCapability = defineCapability({
  type: 'rename_level',
  domain: 'structure',
  schema: z.object({
    type: z.literal('rename_level'),
    levelId: z.string(),
    name: z.string().min(1),
  }),
  safeImmediate: false,
  describe: 'Rename an existing level',
  examples: ['rename level 0 to Ground Floor'],
  aliases: {
    en: ['rename level', 'rename floor'],
    es: ['renombrar nivel', 'renombrar planta'],
  },
})

export const renameNodeCapability = defineCapability({
  type: 'rename_node',
  domain: 'structure',
  schema: z.object({
    type: z.literal('rename_node'),
    nodeId: z.string(),
    name: z.string().min(1),
  }),
  safeImmediate: false,
  describe: 'Rename any scene node (wall, room, item, zone, reference)',
  examples: ['rename selected room to Kitchen', 'name this sofa Modern Couch'],
  aliases: {
    en: ['rename node', 'rename element'],
    es: ['renombrar nodo', 'renombrar elemento'],
  },
})

export const setNodeVisibilityCapability = defineCapability({
  type: 'set_node_visibility',
  domain: 'structure',
  schema: z.object({
    type: z.literal('set_node_visibility'),
    nodeIds: z.array(z.string()).min(1),
    visible: z.boolean(),
  }),
  safeImmediate: false,
  describe: 'Show or hide specified scene nodes',
  examples: ['hide all windows on level 2', 'show reference plan'],
  aliases: {
    en: ['set visibility', 'hide nodes', 'show nodes'],
    es: ['visibilidad de nodos', 'ocultar nodos', 'mostrar nodos'],
  },
})

export const updateZoneColorCapability = defineCapability({
  type: 'update_zone_color',
  domain: 'structure',
  schema: z.object({
    type: z.literal('update_zone_color'),
    nodeId: z.string(),
    color: z.string().min(1),
  }),
  safeImmediate: false,
  describe: 'Update the fill color of a spatial zone/room',
  examples: ['make living room zone light green', 'change zone color to blue'],
  aliases: {
    en: ['zone color', 'change room color'],
    es: ['color de zona', 'cambiar color de habitacion'],
  },
})

export const updatePolygonNodeCapability = defineCapability({
  type: 'update_polygon_node',
  domain: 'structure',
  schema: z.object({
    type: z.literal('update_polygon_node'),
    nodeId: z.string(),
    polygon: z.array(AssistantPoint2Schema).min(3),
  }),
  safeImmediate: false,
  describe: 'Update the 2D boundary polygon of a slab, ceiling, or zone',
  examples: ['adjust room boundary polygon'],
  aliases: {
    en: ['update polygon', 'edit boundary'],
    es: ['actualizar poligono', 'editar contorno'],
  },
})

export const updatePolygonHolesCapability = defineCapability({
  type: 'update_polygon_holes',
  domain: 'structure',
  schema: z.object({
    type: z.literal('update_polygon_holes'),
    nodeId: z.string(),
    holes: z.array(z.array(AssistantPoint2Schema).min(3)),
  }),
  safeImmediate: false,
  describe: 'Update interior void openings/holes in a slab or ceiling',
  examples: ['cut opening in slab for stairs'],
  aliases: {
    en: ['update holes', 'cut slab opening'],
    es: ['actualizar huecos', 'cortar apertura en losa'],
  },
})

export const createWallCapability = defineCapability({
  type: 'create_wall',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_wall'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    start: AssistantPoint2Schema,
    end: AssistantPoint2Schema,
    height: z.number().positive().optional(),
    thickness: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Create a linear architectural wall on the active or specified level',
  examples: ['draw wall from [0, 0] to [5, 0]', 'create 3m wall'],
  aliases: {
    en: ['create wall', 'draw wall', 'build wall'],
    es: ['crear pared', 'dibujar muro', 'levantar pared'],
  },
})

export const createZoneCapability = defineCapability({
  type: 'create_zone',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_zone'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    polygon: z.array(AssistantPoint2Schema).min(3),
    color: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Create a spatial zone/room bounded by a 2D polygon',
  examples: ['create living room zone', 'define bedroom boundary'],
  aliases: {
    en: ['create zone', 'create room', 'define zone'],
    es: ['crear zona', 'crear habitacion', 'definir zona'],
  },
})

export const createSlabCapability = defineCapability({
  type: 'create_slab',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_slab'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    polygon: z.array(AssistantPoint2Schema).min(3),
    holes: z.array(z.array(AssistantPoint2Schema).min(3)).optional(),
    elevation: z.number().nonnegative().optional(),
  }),
  safeImmediate: false,
  describe: 'Create a horizontal floor slab bounded by a polygon',
  examples: ['create floor slab', 'add foundation slab'],
  aliases: {
    en: ['create slab', 'add floor', 'build slab'],
    es: ['crear losa', 'anadir forjado', 'construir losa'],
  },
})

export const createCeilingCapability = defineCapability({
  type: 'create_ceiling',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_ceiling'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    polygon: z.array(AssistantPoint2Schema).min(3),
    holes: z.array(z.array(AssistantPoint2Schema).min(3)).optional(),
    height: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Create a ceiling surface at a given height above the level floor',
  examples: ['create ceiling 2.7m high'],
  aliases: {
    en: ['create ceiling', 'add ceiling'],
    es: ['crear techo', 'anadir falso techo'],
  },
})

export const createRoofCapability = defineCapability({
  type: 'create_roof',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_roof'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    corner1: AssistantPoint2Schema,
    corner2: AssistantPoint2Schema,
    height: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Create a gable or flat roof covering the specified bounding rectangle',
  examples: ['add roof over building', 'create gable roof'],
  aliases: {
    en: ['create roof', 'add roof', 'build roof'],
    es: ['crear tejado', 'anadir cubierta', 'construir techo exterior'],
  },
})

export const createGuideCapability = defineCapability({
  type: 'create_guide',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_guide'),
    name: z.string().optional(),
    url: z.string().min(1),
    view: z.enum(['front', 'side', 'top']),
    position: AssistantPoint3Schema.optional(),
    rotation: AssistantPoint3Schema.optional(),
    scale: z.number().positive().optional(),
    opacity: z.number().min(0).max(100).optional(),
    levelId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Place a vertical (front/side) or floor (top) reference guide plane behind the build',
  examples: ['show front reference behind the hull', 'create side guide plane'],
  aliases: {
    en: ['create guide', 'reference plane', 'guide image'],
    es: ['crear guia', 'plano de referencia'],
  },
})

export const placeDoorCapability = defineCapability({
  type: 'place_door',
  domain: 'structure',
  schema: z.object({
    type: z.literal('place_door'),
    wallId: z.string(),
    name: z.string().optional(),
    localX: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    side: AssistantSideSchema.optional(),
  }),
  safeImmediate: false,
  describe: 'Insert a door opening into an existing wall',
  examples: ['place door on wall 2', 'add 0.9m door in hallway'],
  aliases: {
    en: ['place door', 'add door', 'insert door'],
    es: ['colocar puerta', 'anadir puerta', 'poner puerta'],
  },
})

export const placeWindowCapability = defineCapability({
  type: 'place_window',
  domain: 'structure',
  schema: z.object({
    type: z.literal('place_window'),
    wallId: z.string(),
    name: z.string().optional(),
    localX: z.number().optional(),
    localY: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    side: AssistantSideSchema.optional(),
  }),
  safeImmediate: false,
  describe: 'Insert a window opening into an existing wall',
  examples: ['place window on longest wall', 'add 1.2m window in living room'],
  aliases: {
    en: ['place window', 'add window', 'insert window'],
    es: ['colocar ventana', 'anadir ventana', 'poner ventana'],
  },
})

export const updateDoorPropertiesCapability = defineCapability({
  type: 'update_door_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_door_properties'),
      nodeId: z.string(),
      position: AssistantPoint3Schema.optional(),
      rotation: AssistantPoint3Schema.optional(),
      side: AssistantSideSchema.optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      frameThickness: z.number().positive().optional(),
      frameDepth: z.number().positive().optional(),
      threshold: z.boolean().optional(),
      thresholdHeight: z.number().nonnegative().optional(),
      hingesSide: z.enum(['left', 'right']).optional(),
      swingDirection: z.enum(['inward', 'outward']).optional(),
      segments: z
        .array(
          z.object({
            type: z.enum(['panel', 'glass', 'empty']),
            heightRatio: z.number().positive(),
            columnRatios: z.array(z.number().positive()).min(1),
            dividerThickness: z.number().nonnegative(),
            panelDepth: z.number(),
            panelInset: z.number().nonnegative(),
          }),
        )
        .min(1)
        .optional(),
      handle: z.boolean().optional(),
      handleHeight: z.number().nonnegative().optional(),
      handleSide: z.enum(['left', 'right']).optional(),
      contentPadding: z.tuple([z.number().nonnegative(), z.number().nonnegative()]).optional(),
      doorCloser: z.boolean().optional(),
      panicBar: z.boolean().optional(),
      panicBarHeight: z.number().nonnegative().optional(),
    })
    .refine(
      (value) =>
        value.position ||
        value.rotation ||
        value.side ||
        typeof value.width === 'number' ||
        typeof value.height === 'number' ||
        typeof value.frameThickness === 'number' ||
        typeof value.frameDepth === 'number' ||
        typeof value.threshold === 'boolean' ||
        typeof value.thresholdHeight === 'number' ||
        value.hingesSide ||
        value.swingDirection ||
        value.segments ||
        typeof value.handle === 'boolean' ||
        typeof value.handleHeight === 'number' ||
        value.handleSide ||
        value.contentPadding ||
        typeof value.doorCloser === 'boolean' ||
        typeof value.panicBar === 'boolean' ||
        typeof value.panicBarHeight === 'number',
      {
        message: 'update_door_properties requires at least one property update.',
        path: ['position'],
      },
    ),
  safeImmediate: false,
  describe: 'Update door dimensions, frame, handle, or swing configuration',
  examples: ['make door 1m wide', 'change door swing direction'],
  aliases: {
    en: ['update door', 'modify door dimensions'],
    es: ['actualizar puerta', 'modificar dimensiones de puerta'],
  },
})

export const updateWindowPropertiesCapability = defineCapability({
  type: 'update_window_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_window_properties'),
      nodeId: z.string(),
      position: AssistantPoint3Schema.optional(),
      rotation: AssistantPoint3Schema.optional(),
      side: AssistantSideSchema.optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      frameThickness: z.number().positive().optional(),
      frameDepth: z.number().positive().optional(),
      columnRatios: z.array(z.number().positive()).min(1).optional(),
      rowRatios: z.array(z.number().positive()).min(1).optional(),
      columnDividerThickness: z.number().nonnegative().optional(),
      rowDividerThickness: z.number().nonnegative().optional(),
      sill: z.boolean().optional(),
      sillDepth: z.number().nonnegative().optional(),
      sillThickness: z.number().nonnegative().optional(),
    })
    .refine(
      (value) =>
        value.position ||
        value.rotation ||
        value.side ||
        typeof value.width === 'number' ||
        typeof value.height === 'number' ||
        typeof value.frameThickness === 'number' ||
        typeof value.frameDepth === 'number' ||
        value.columnRatios ||
        value.rowRatios ||
        typeof value.columnDividerThickness === 'number' ||
        typeof value.rowDividerThickness === 'number' ||
        typeof value.sill === 'boolean' ||
        typeof value.sillDepth === 'number' ||
        typeof value.sillThickness === 'number',
      {
        message: 'update_window_properties requires at least one property update.',
        path: ['position'],
      },
    ),
  safeImmediate: false,
  describe: 'Update window dimensions, mullions, dividers, or sill',
  examples: ['make windows taller', 'set window width to 1.5m'],
  aliases: {
    en: ['update window', 'make windows taller'],
    es: ['actualizar ventana', 'hacer ventanas mas altas'],
  },
})

export const updateWallPropertiesCapability = defineCapability({
  type: 'update_wall_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_wall_properties'),
      nodeId: z.string(),
      height: z.number().positive().optional(),
      thickness: z.number().positive().optional(),
    })
    .refine((value) => typeof value.height === 'number' || typeof value.thickness === 'number', {
      message: 'update_wall_properties requires at least one property update.',
      path: ['height'],
    }),
  safeImmediate: false,
  describe: 'Update thickness or height of an existing wall',
  examples: ['make wall 0.3m thick', 'set wall height to 3.2m'],
  aliases: {
    en: ['update wall', 'adjust wall height'],
    es: ['actualizar pared', 'ajustar altura de pared'],
  },
})

export const updateSlabPropertiesCapability = defineCapability({
  type: 'update_slab_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_slab_properties'),
      nodeId: z.string(),
      elevation: z.number().optional(),
      holes: z.array(z.array(AssistantPoint2Schema).min(3)).optional(),
    })
    .refine((value) => typeof value.elevation === 'number' || value.holes, {
      message: 'update_slab_properties requires at least one property update.',
      path: ['elevation'],
    }),
  safeImmediate: false,
  describe: 'Update floor slab elevation or openings',
  examples: ['raise slab elevation by 0.1m'],
  aliases: {
    en: ['update slab', 'adjust slab elevation'],
    es: ['actualizar losa', 'ajustar elevacion de forjado'],
  },
})

export const updateCeilingPropertiesCapability = defineCapability({
  type: 'update_ceiling_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_ceiling_properties'),
      nodeId: z.string(),
      height: z.number().nonnegative().optional(),
      holes: z.array(z.array(AssistantPoint2Schema).min(3)).optional(),
    })
    .refine((value) => typeof value.height === 'number' || value.holes, {
      message: 'update_ceiling_properties requires at least one property update.',
      path: ['height'],
    }),
  safeImmediate: false,
  describe: 'Update ceiling height clearance or openings',
  examples: ['lower ceiling to 2.5m'],
  aliases: {
    en: ['update ceiling', 'adjust ceiling height'],
    es: ['actualizar techo', 'ajustar altura de techo'],
  },
})

export const updateRoofPropertiesCapability = defineCapability({
  type: 'update_roof_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_roof_properties'),
      nodeId: z.string(),
      position: AssistantPoint3Schema.optional(),
      rotation: z.number().optional(),
      length: z.number().positive().optional(),
      height: z.number().positive().optional(),
      leftWidth: z.number().positive().optional(),
      rightWidth: z.number().positive().optional(),
    })
    .refine(
      (value) =>
        value.position ||
        typeof value.rotation === 'number' ||
        typeof value.length === 'number' ||
        typeof value.height === 'number' ||
        typeof value.leftWidth === 'number' ||
        typeof value.rightWidth === 'number',
      {
        message: 'update_roof_properties requires at least one property update.',
        path: ['position'],
      },
    ),
  safeImmediate: false,
  describe: 'Update roof dimensions, pitch height, and overhangs',
  examples: ['adjust roof pitch height to 2m'],
  aliases: {
    en: ['update roof', 'adjust roof dimensions'],
    es: ['actualizar tejado', 'ajustar dimensiones de cubierta'],
  },
})

export const updateReferencePropertiesCapability = defineCapability({
  type: 'update_reference_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_reference_properties'),
      nodeId: z.string(),
      position: AssistantPoint3Schema.optional(),
      rotation: AssistantPoint3Schema.optional(),
      scale: z.number().positive().optional(),
      opacity: z.number().min(0).max(100).optional(),
    })
    .refine(
      (value) =>
        value.position ||
        value.rotation ||
        typeof value.scale === 'number' ||
        typeof value.opacity === 'number',
      {
        message: 'update_reference_properties requires at least one property update.',
        path: ['position'],
      },
    ),
  safeImmediate: false,
  describe: 'Update 2D reference plan overlay scale, position, and opacity',
  examples: ['set reference opacity to 50%', 'scale reference by 1.5'],
  aliases: {
    en: ['update reference', 'adjust plan opacity'],
    es: ['actualizar referencia', 'ajustar opacidad de plano'],
  },
})

export const updateSitePropertiesCapability = defineCapability({
  type: 'update_site_properties',
  domain: 'structure',
  schema: z
    .object({
      type: z.literal('update_site_properties'),
      nodeId: z.string(),
      polygon: z.array(AssistantPoint2Schema).min(3).optional(),
    })
    .refine((value) => value.polygon, {
      message: 'update_site_properties requires at least one property update.',
      path: ['polygon'],
    }),
  safeImmediate: false,
  describe: 'Update site property line boundary polygon',
  examples: ['adjust property boundary line'],
  aliases: {
    en: ['update site', 'adjust property line'],
    es: ['actualizar sitio', 'ajustar limites de propiedad'],
  },
})

// New Phase 1 Gap Closures:
export const createSiteCapability = defineCapability({
  type: 'create_site',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_site'),
    name: z.string().min(1).optional(),
  }),
  safeImmediate: false,
  describe: 'Create a new root site container for the project',
  examples: ['create site named Project Alpha', 'new site'],
  aliases: {
    en: ['create site', 'new site', 'add site'],
    es: ['crear sitio', 'nuevo sitio', 'anadir sitio'],
  },
})

export const createBuildingCapability = defineCapability({
  type: 'create_building',
  domain: 'structure',
  schema: z.object({
    type: z.literal('create_building'),
    siteId: z.string().optional(),
    name: z.string().min(1).optional(),
  }),
  safeImmediate: false,
  describe: 'Create a new building container under the active site',
  examples: ['create building named Main House', 'add secondary building'],
  aliases: {
    en: ['create building', 'new building', 'add building'],
    es: ['crear edificio', 'nuevo edificio', 'anadir edificio'],
  },
})

export const structureCapabilities = [
  setStructureLayerCapability,
  focusBuildingCapability,
  focusLevelCapability,
  selectNodesCapability,
  createLevelCapability,
  renameLevelCapability,
  renameNodeCapability,
  setNodeVisibilityCapability,
  updateZoneColorCapability,
  updatePolygonNodeCapability,
  updatePolygonHolesCapability,
  createWallCapability,
  createZoneCapability,
  createSlabCapability,
  createCeilingCapability,
  createRoofCapability,
  createGuideCapability,
  placeDoorCapability,
  placeWindowCapability,
  updateDoorPropertiesCapability,
  updateWindowPropertiesCapability,
  updateWallPropertiesCapability,
  updateSlabPropertiesCapability,
  updateCeilingPropertiesCapability,
  updateRoofPropertiesCapability,
  updateReferencePropertiesCapability,
  updateSitePropertiesCapability,
  createSiteCapability,
  createBuildingCapability,
]
