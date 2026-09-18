import { CadBriefSchema } from '@pascal-app/core/schema/cad-brief'
import { z } from 'zod'
import { assistantToolValues } from './tool-surface'

export { assistantToolValues } from './tool-surface'

export const assistantPhaseValues = ['site', 'structure', 'furnish', 'cad'] as const
export const assistantWorkspaceValues = ['architecture', 'cad'] as const
export const assistantModeValues = ['select', 'edit', 'delete', 'build'] as const
export const assistantStructureLayerValues = ['zones', 'elements'] as const
export const assistantCadBooleanModeValues = ['union', 'cut', 'intersect'] as const
export const assistantCadWorkplaneValues = ['XY', 'XZ', 'YZ', 'level'] as const
export const assistantCadExtrudeDirectionValues = ['positive', 'negative', 'symmetric'] as const
export const assistantCadRevolveAxisValues = ['X', 'Y', 'Z', 'custom'] as const
export const assistantCadBoxFaceValues = ['top', 'bottom', 'left', 'right', 'front', 'back'] as const
export const assistantCameraModeValues = ['perspective', 'orthographic'] as const
export const assistantThemeValues = ['light', 'dark'] as const
export const assistantLevelViewModeValues = ['manual', 'stacked', 'exploded', 'solo'] as const
export const assistantWallViewModeValues = ['up', 'cutaway', 'down'] as const
export const assistantTransformModeValues = ['move', 'rotate', 'scale'] as const
export const assistantTransformPivotValues = ['bounds-center', 'asset-origin'] as const
export const assistantSceneExportFormatValues = ['json', 'ifc', 'glb'] as const
export const assistantCameraOrbitDirectionValues = ['cw', 'ccw'] as const
export const assistantSideValues = ['front', 'back'] as const
export const assistantPlacementValues = ['explicit', 'center'] as const
export const assistantCatalogCategoryValues = [
  'furniture',
  'appliance',
  'bathroom',
  'kitchen',
  'outdoor',
  'window',
  'door',
] as const
export const assistantActionTypeValues = [
  'reset_workspace_selection',
  'set_workspace',
  'set_phase',
  'set_mode',
  'set_structure_layer',
  'set_camera_mode',
  'set_theme',
  'set_level_view_mode',
  'set_wall_view_mode',
  'set_preview_mode',
  'set_scans_visibility',
  'set_guides_visibility',
  'set_grid_visibility',
  'set_cad_workplane',
  'set_transform_mode',
  'set_transform_pivot',
  'camera_top_view',
  'orbit_camera',
  'set_fullscreen',
  'undo_history',
  'redo_history',
  'export_scene',
  'copy_share_link',
  'take_screenshot',
  'capture_camera_snapshot',
  'view_camera_snapshot',
  'clear_camera_snapshot',
  'close_cad_sketch',
  'delete_cad_sketch_constraint',
  'update_cad_sketch_dimension',
  'activate_tool',
  'focus_building',
  'focus_level',
  'select_nodes',
  'reposition_target',
  'create_level',
  'rename_level',
  'rename_node',
  'set_node_visibility',
  'update_zone_color',
  'update_polygon_node',
  'update_polygon_holes',
  'create_wall',
  'create_zone',
  'create_slab',
  'create_ceiling',
  'create_roof',
  'place_item',
  'place_door',
  'place_window',
  'update_item_properties',
  'update_door_properties',
  'update_window_properties',
  'update_wall_properties',
  'update_slab_properties',
  'update_ceiling_properties',
  'update_roof_properties',
  'update_reference_properties',
  'update_site_properties',
  'move_target',
  'rotate_target',
  'scale_target',
  'duplicate_target',
  'duplicate_reposition_target',
  'delete_target',
  'delete_nodes',
  'clear_level_contents',
  'execute_cad_brief',
  'run_cad_prompt',
  'generate_mac_part',
  'place_cad_body_in_architecture',
  'create_default_cad_sketch',
  'extrude_cad_sketch',
  'revolve_cad_sketch',
  'regenerate_cad_body',
  'retry_cad_body',
  'set_cad_body_operation_suppressed',
  'apply_cad_boolean',
  'apply_cad_fillet',
  'apply_cad_chamfer',
  'add_cad_box_ears',
  'extrude_cad_body_face',
  'shell_cad_body',
  'export_cad_body_step',
  'create_site',
  'create_building',
  'focus_camera_on_nodes',
  'add_cad_sketch_entities',
  'set_cad_sketch_plane',
  'reparent_node',
  'set_node_metadata',
] as const
export const assistantSafeImmediateActionTypes = [
  'reset_workspace_selection',
  'set_workspace',
  'set_phase',
  'set_mode',
  'set_structure_layer',
  'set_camera_mode',
  'set_theme',
  'set_level_view_mode',
  'set_wall_view_mode',
  'set_preview_mode',
  'set_scans_visibility',
  'set_guides_visibility',
  'set_grid_visibility',
  'set_cad_workplane',
  'set_transform_mode',
  'set_transform_pivot',
  'camera_top_view',
  'orbit_camera',
  'set_fullscreen',
  'undo_history',
  'redo_history',
  'export_scene',
  'copy_share_link',
  'take_screenshot',
  'view_camera_snapshot',
  'close_cad_sketch',
  'activate_tool',
  'focus_building',
  'focus_level',
  'select_nodes',
  'reposition_target',
  'focus_camera_on_nodes',
  'set_cad_sketch_plane',
  'set_node_metadata',
] as const

export const assistantDestructiveActionTypes = [
  'delete_target',
  'delete_nodes',
  'clear_level_contents',
  'shell_cad_body',
] as const

export const AssistantPhaseSchema = z.preprocess(
  (val) => {
    if (val === 'zones' || val === 'elements') return 'structure'
    return val
  },
  z.enum(assistantPhaseValues)
)
export const AssistantWorkspaceSchema = z.enum(assistantWorkspaceValues)
export const AssistantModeSchema = z.enum(assistantModeValues)
export const AssistantStructureLayerSchema = z.enum(assistantStructureLayerValues)
export const AssistantCadBooleanModeSchema = z.enum(assistantCadBooleanModeValues)
export const AssistantCadWorkplaneSchema = z.enum(assistantCadWorkplaneValues)
export const AssistantCadExtrudeDirectionSchema = z.enum(assistantCadExtrudeDirectionValues)
export const AssistantCadRevolveAxisSchema = z.enum(assistantCadRevolveAxisValues)
export const AssistantCadBoxFaceSchema = z.enum(assistantCadBoxFaceValues)
export const AssistantCameraModeSchema = z.enum(assistantCameraModeValues)
export const AssistantThemeSchema = z.enum(assistantThemeValues)
export const AssistantLevelViewModeSchema = z.enum(assistantLevelViewModeValues)
export const AssistantWallViewModeSchema = z.enum(assistantWallViewModeValues)
export const AssistantTransformModeSchema = z.enum(assistantTransformModeValues)
export const AssistantTransformPivotSchema = z.enum(assistantTransformPivotValues)
export const AssistantSceneExportFormatSchema = z.enum(assistantSceneExportFormatValues)
export const AssistantCameraOrbitDirectionSchema = z.enum(assistantCameraOrbitDirectionValues)
export const AssistantCatalogCategorySchema = z.enum(assistantCatalogCategoryValues)
export const AssistantToolSchema = z.enum(assistantToolValues)
export const AssistantPoint2Schema = z.tuple([z.number(), z.number()])
export const AssistantPoint3Schema = z.tuple([z.number(), z.number(), z.number()])
export const AssistantSideSchema = z.enum(assistantSideValues)
export const AssistantPlacementSchema = z.enum(assistantPlacementValues)
export const AssistantForwardRefIdSchema = z.string().regex(/^\$ref_[A-Za-z0-9_-]+$/)

const AssistantActionUnionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reset_workspace_selection'),
  }),
  z.object({
    type: z.literal('set_workspace'),
    workspace: AssistantWorkspaceSchema,
  }),
  z.object({
    type: z.literal('set_phase'),
    phase: AssistantPhaseSchema,
  }),
  z.object({
    type: z.literal('set_mode'),
    mode: AssistantModeSchema,
  }),
  z.object({
    type: z.literal('set_structure_layer'),
    layer: AssistantStructureLayerSchema,
  }),
  z.object({
    type: z.literal('set_camera_mode'),
    cameraMode: AssistantCameraModeSchema,
  }),
  z.object({
    type: z.literal('set_theme'),
    theme: AssistantThemeSchema,
  }),
  z.object({
    type: z.literal('set_level_view_mode'),
    levelMode: AssistantLevelViewModeSchema,
  }),
  z.object({
    type: z.literal('set_wall_view_mode'),
    wallMode: AssistantWallViewModeSchema,
  }),
  z.object({
    type: z.literal('set_preview_mode'),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal('set_scans_visibility'),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal('set_guides_visibility'),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal('set_grid_visibility'),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal('set_cad_workplane'),
    workplane: AssistantCadWorkplaneSchema,
  }),
  z.object({
    type: z.literal('set_transform_mode'),
    transformMode: AssistantTransformModeSchema,
  }),
  z.object({
    type: z.literal('set_transform_pivot'),
    pivot: AssistantTransformPivotSchema,
  }),
  z.object({
    type: z.literal('camera_top_view'),
  }),
  z.object({
    type: z.literal('orbit_camera'),
    direction: AssistantCameraOrbitDirectionSchema,
  }),
  z.object({
    type: z.literal('set_fullscreen'),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal('undo_history'),
  }),
  z.object({
    type: z.literal('redo_history'),
  }),
  z.object({
    type: z.literal('export_scene'),
    format: AssistantSceneExportFormatSchema,
  }),
  z.object({
    type: z.literal('copy_share_link'),
  }),
  z.object({
    type: z.literal('take_screenshot'),
  }),
  z.object({
    type: z.literal('capture_camera_snapshot'),
    nodeId: z.string(),
  }),
  z.object({
    type: z.literal('view_camera_snapshot'),
    nodeId: z.string(),
  }),
  z.object({
    type: z.literal('clear_camera_snapshot'),
    nodeId: z.string(),
  }),
  z.object({
    type: z.literal('close_cad_sketch'),
    sketchId: z.string().optional(),
  }),
  z.object({
    type: z.literal('delete_cad_sketch_constraint'),
    sketchId: z.string().optional(),
    constraintId: z.string().min(1),
  }),
  z.object({
    type: z.literal('update_cad_sketch_dimension'),
    sketchId: z.string().optional(),
    dimensionId: z.string().min(1),
    value: z.number().positive(),
  }),
  z.object({
    type: z.literal('activate_tool'),
    tool: AssistantToolSchema,
    catalogCategory: AssistantCatalogCategorySchema.optional().nullable(),
    cadBooleanMode: AssistantCadBooleanModeSchema.optional(),
  }),
  z.object({
    type: z.literal('focus_building'),
    buildingId: z.string(),
  }),
  z.object({
    type: z.literal('focus_level'),
    levelId: z.string(),
  }),
  z.object({
    type: z.literal('select_nodes'),
    nodeIds: z.array(z.string()).default([]),
    zoneId: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('reposition_target'),
    nodeId: z.string().optional(),
  }),
  z.object({
    type: z.literal('create_level'),
    buildingId: z.string().optional(),
    level: z.number().int().optional(),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('rename_level'),
    levelId: z.string(),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal('rename_node'),
    nodeId: z.string(),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal('set_node_visibility'),
    nodeIds: z.array(z.string()).min(1),
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal('update_zone_color'),
    nodeId: z.string(),
    color: z.string().min(1),
  }),
  z.object({
    type: z.literal('update_polygon_node'),
    nodeId: z.string(),
    polygon: z.array(AssistantPoint2Schema).min(3),
  }),
  z.object({
    type: z.literal('update_polygon_holes'),
    nodeId: z.string(),
    holes: z.array(z.array(AssistantPoint2Schema).min(3)),
  }),
  z.object({
    type: z.literal('create_wall'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    start: AssistantPoint2Schema,
    end: AssistantPoint2Schema,
    height: z.number().positive().optional(),
    thickness: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('create_zone'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    polygon: z.array(AssistantPoint2Schema).min(3),
    color: z.string().optional(),
  }),
  z.object({
    type: z.literal('create_slab'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    polygon: z.array(AssistantPoint2Schema).min(3),
    holes: z.array(z.array(AssistantPoint2Schema).min(3)).optional(),
    elevation: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('create_ceiling'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    polygon: z.array(AssistantPoint2Schema).min(3),
    holes: z.array(z.array(AssistantPoint2Schema).min(3)).optional(),
    height: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('create_roof'),
    levelId: z.string().optional(),
    name: z.string().optional(),
    corner1: AssistantPoint2Schema,
    corner2: AssistantPoint2Schema,
    height: z.number().positive().optional(),
  }),
  z.object({
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
  z.object({
    type: z.literal('place_door'),
    wallId: z.string(),
    name: z.string().optional(),
    localX: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    side: AssistantSideSchema.optional(),
  }),
  z.object({
    type: z.literal('place_window'),
    wallId: z.string(),
    name: z.string().optional(),
    localX: z.number().optional(),
    localY: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    side: AssistantSideSchema.optional(),
  }),
  z
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
  z
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
  z
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
  z
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
  z
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
  z
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
  z
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
  z
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
  z
    .object({
      type: z.literal('update_site_properties'),
      nodeId: z.string(),
      polygon: z.array(AssistantPoint2Schema).min(3).optional(),
    })
    .refine((value) => value.polygon, {
      message: 'update_site_properties requires at least one property update.',
      path: ['polygon'],
    }),
  z
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
  z
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
  z.object({
    type: z.literal('scale_target'),
    nodeId: z.string().optional(),
    scale: AssistantPoint3Schema,
  }),
  z.object({
    type: z.literal('duplicate_target'),
    nodeId: z.string().optional(),
  }),
  z.object({
    type: z.literal('duplicate_reposition_target'),
    nodeId: z.string().optional(),
  }),
  z.object({
    type: z.literal('delete_target'),
    nodeId: z.string().optional(),
  }),
  z.object({
    type: z.literal('delete_nodes'),
    nodeIds: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal('clear_level_contents'),
    levelId: z.string().optional(),
  }),
  z.object({
    type: z.literal('execute_cad_brief'),
    brief: CadBriefSchema,
  }),
  z.object({
    type: z.literal('run_cad_prompt'),
    prompt: z.string().min(1),
  }),
  z.object({
    type: z.literal('generate_mac_part'),
    prompt: z.string().min(1),
  }),
  z.object({
    type: z.literal('place_cad_body_in_architecture'),
    bodyId: z.string().optional(),
    levelId: z.string().optional(),
  }),
  z.object({
    type: z.literal('create_default_cad_sketch'),
    position: AssistantPoint3Schema.optional(),
  }),
  z.object({
    type: z.literal('extrude_cad_sketch'),
    sketchId: z.string().optional(),
    depth: z.number().positive().optional(),
    direction: AssistantCadExtrudeDirectionSchema.default('positive'),
  }),
  z.object({
    type: z.literal('revolve_cad_sketch'),
    sketchId: z.string().optional(),
    angle: z.number().positive().optional(),
    axis: AssistantCadRevolveAxisSchema.default('Z'),
    customAxis: AssistantPoint3Schema.optional(),
  }),
  z.object({
    type: z.literal('regenerate_cad_body'),
    bodyId: z.string().optional(),
    depth: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('retry_cad_body'),
    bodyId: z.string().optional(),
  }),
  z.object({
    type: z.literal('set_cad_body_operation_suppressed'),
    bodyId: z.string().optional(),
    operationId: z.string(),
    suppressed: z.boolean(),
  }),
  z.object({
    type: z.literal('apply_cad_boolean'),
    operation: AssistantCadBooleanModeSchema.default('union'),
    targetBodyId: z.string().optional(),
    toolBodyId: z.string().optional(),
  }),
  z.object({
    type: z.literal('apply_cad_fillet'),
    bodyId: z.string().optional(),
    edgeRefs: z.array(z.string()).optional(),
    radius: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('apply_cad_chamfer'),
    bodyId: z.string().optional(),
    edgeRefs: z.array(z.string()).optional(),
    distance: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('add_cad_box_ears'),
    bodyId: z.string().optional(),
  }),
  z.object({
    type: z.literal('extrude_cad_body_face'),
    bodyId: z.string().optional(),
    face: AssistantCadBoxFaceSchema.default('top'),
    distance: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('shell_cad_body'),
    bodyId: z.string().optional(),
    thickness: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('export_cad_body_step'),
    bodyId: z.string().optional(),
  }),
  z.object({
    type: z.literal('create_site'),
    name: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('create_building'),
    siteId: z.string().optional(),
    name: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('focus_camera_on_nodes'),
    nodeIds: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal('add_cad_sketch_entities'),
    sketchId: z.string().optional(),
    entities: z.array(z.record(z.string(), z.unknown())).min(1),
  }),
  z.object({
    type: z.literal('set_cad_sketch_plane'),
    sketchId: z.string().optional(),
    plane: AssistantCadWorkplaneSchema,
  }),
  z.object({
    type: z.literal('reparent_node'),
    nodeId: z.string(),
    newParentId: z.string(),
  }),
  z.object({
    type: z.literal('set_node_metadata'),
    nodeId: z.string(),
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
])

export const AssistantActionSchema = z.intersection(
  AssistantActionUnionSchema,
  z.object({
    refId: AssistantForwardRefIdSchema.optional(),
  }),
)

export const AssistantTurnModeSchema = z.enum(['chat', 'clarify', 'plan', 'task-plan'])

export const AssistantTargetCandidateSourceSchema = z.enum([
  'selected',
  'explicit-id',
  'named-target',
  'last-created',
  'recent-reference',
  'image-annotation',
  'image-region',
])

export const AssistantImageBoundsSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
})

export const AssistantImageAnnotationHintSchema = z.object({
  kind: z.enum(['circle', 'arrow', 'cross', 'highlight', 'label', 'region']),
  label: z.string().min(1).optional(),
  direction: z.enum(['left', 'right', 'up', 'down']).optional(),
  region: AssistantImageBoundsSchema.optional(),
})

export const AssistantImageTargetHintSchema = z.object({
  text: z.string().min(1),
  targetTypes: z.array(z.string().min(1)).default([]),
})

export const AssistantImageBuildHintSchema = z.object({
  text: z.string().min(1),
})

export const AssistantImageInterpretationSchema = z.object({
  kind: z.enum(['workspace', 'reference', 'floorplan', 'room-reference', 'sketch', 'unknown']),
  ocrText: z.array(z.string()).default([]),
  annotationHints: z.array(AssistantImageAnnotationHintSchema).default([]),
  targetHints: z.array(AssistantImageTargetHintSchema).default([]),
  buildHints: z.array(AssistantImageBuildHintSchema).default([]),
  confidence: z.number().min(0).max(1).default(0),
})

export const AssistantTargetCandidateSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().nullable().optional(),
  source: AssistantTargetCandidateSourceSchema,
  confidence: z.number().min(0).max(1).default(0),
})

export const AssistantContinuationSchema = z.object({
  kind: z.literal('local-sequence'),
  intentId: z.string().min(1),
  originPrompt: z.string().min(1),
  summary: z.string().min(1),
  stepIndex: z.number().int().positive(),
  totalSteps: z.number().int().positive(),
  remainingActions: z.array(AssistantActionSchema).default([]),
  resolvedRefs: z.record(z.string(), z.string()).default({}),
  autoContinue: z.boolean().default(true),
})

export const AssistantTaskPlanStepSchema = z.object({
  description: z.string().min(1),
  actions: z.array(AssistantActionSchema).max(25).default([]),
  agent: z.enum(['structure', 'furnish', 'cad', 'layout', 'general']).default('general'),
})

export const assistantProviderValues = ['codex', 'openai', 'openrouter', 'fallback'] as const
export const AssistantProviderSchema = z.enum(assistantProviderValues)
export const AssistantProviderMetaSchema = z.object({
  provider: AssistantProviderSchema,
  model: z.string().min(1),
  codexThreadId: z.string().min(1).optional(),
})

export const AssistantTurnResultSchema = z.object({
  reply: z.string(),
  mode: AssistantTurnModeSchema,
  assumptions: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
  actions: z.array(AssistantActionSchema).max(25).default([]),
  requiresReview: z.boolean().default(false),
  destructiveActionCount: z.number().int().nonnegative().default(0),
  continuation: AssistantContinuationSchema.nullable().optional(),
  steps: z.array(AssistantTaskPlanStepSchema).optional(),
  targetingExplanation: z.string().optional(),
  targetCandidates: z.array(AssistantTargetCandidateSchema).default([]).optional(),
  imageInterpretation: AssistantImageInterpretationSchema.optional(),
  providerMeta: AssistantProviderMetaSchema.optional(),
})

export type AssistantPhase = z.infer<typeof AssistantPhaseSchema>
export type AssistantMode = z.infer<typeof AssistantModeSchema>
export type AssistantStructureLayer = z.infer<typeof AssistantStructureLayerSchema>
export type AssistantCadBooleanMode = z.infer<typeof AssistantCadBooleanModeSchema>
export type AssistantCadWorkplane = z.infer<typeof AssistantCadWorkplaneSchema>
export type AssistantCadExtrudeDirection = z.infer<typeof AssistantCadExtrudeDirectionSchema>
export type AssistantCadRevolveAxis = z.infer<typeof AssistantCadRevolveAxisSchema>
export type AssistantCadBoxFace = z.infer<typeof AssistantCadBoxFaceSchema>
export type AssistantCameraMode = z.infer<typeof AssistantCameraModeSchema>
export type AssistantTheme = z.infer<typeof AssistantThemeSchema>
export type AssistantLevelViewMode = z.infer<typeof AssistantLevelViewModeSchema>
export type AssistantWallViewMode = z.infer<typeof AssistantWallViewModeSchema>
export type AssistantTransformMode = z.infer<typeof AssistantTransformModeSchema>
export type AssistantTransformPivot = z.infer<typeof AssistantTransformPivotSchema>
export type AssistantSceneExportFormat = z.infer<typeof AssistantSceneExportFormatSchema>
export type AssistantCameraOrbitDirection = z.infer<typeof AssistantCameraOrbitDirectionSchema>
export type AssistantCatalogCategory = z.infer<typeof AssistantCatalogCategorySchema>
export type AssistantTool = z.infer<typeof AssistantToolSchema>
export type AssistantAction = z.infer<typeof AssistantActionSchema>
export type AssistantTurnMode = z.infer<typeof AssistantTurnModeSchema>
export type AssistantTargetCandidateSource = z.infer<typeof AssistantTargetCandidateSourceSchema>
export type AssistantImageBounds = z.infer<typeof AssistantImageBoundsSchema>
export type AssistantImageAnnotationHint = z.infer<typeof AssistantImageAnnotationHintSchema>
export type AssistantImageTargetHint = z.infer<typeof AssistantImageTargetHintSchema>
export type AssistantImageBuildHint = z.infer<typeof AssistantImageBuildHintSchema>
export type AssistantImageInterpretation = z.infer<typeof AssistantImageInterpretationSchema>
export type AssistantTargetCandidate = z.infer<typeof AssistantTargetCandidateSchema>
export type AssistantContinuation = z.infer<typeof AssistantContinuationSchema>
export type AssistantProvider = z.infer<typeof AssistantProviderSchema>
export type AssistantProviderMeta = z.infer<typeof AssistantProviderMetaSchema>
export type AssistantTurnResult = z.infer<typeof AssistantTurnResultSchema>

const safeImmediateActionTypeSet = new Set<string>(assistantSafeImmediateActionTypes)
const destructiveActionTypeSet = new Set<string>(assistantDestructiveActionTypes)

export const isSafeImmediateAssistantActionType = (type: AssistantAction['type']) =>
  safeImmediateActionTypeSet.has(type)

export const isDestructiveAssistantActionType = (type: AssistantAction['type']) =>
  destructiveActionTypeSet.has(type)
