import { CadBriefSchema } from '@pascal-app/core/schema/cad-brief'
import { z } from 'zod'
import {
  AssistantCadBooleanModeSchema,
  AssistantCadBoxFaceSchema,
  AssistantCadExtrudeDirectionSchema,
  AssistantCadRevolveAxisSchema,
  AssistantCadWorkplaneSchema,
  AssistantPoint3Schema,
} from '../types'
import { defineCapability } from './types'

export const setCadWorkplaneCapability = defineCapability({
  type: 'set_cad_workplane',
  domain: 'cad',
  schema: z.object({
    type: z.literal('set_cad_workplane'),
    workplane: AssistantCadWorkplaneSchema,
  }),
  safeImmediate: true,
  describe: 'Set the active CAD drawing workplane (XY, XZ, YZ, or level)',
  examples: ['work on XZ plane', 'set CAD plane to XY'],
  aliases: {
    en: ['set workplane', 'switch CAD plane'],
    es: ['plano de trabajo', 'cambiar plano CAD'],
  },
})

export const closeCadSketchCapability = defineCapability({
  type: 'close_cad_sketch',
  domain: 'cad',
  schema: z.object({
    type: z.literal('close_cad_sketch'),
    sketchId: z.string().optional(),
  }),
  safeImmediate: true,
  describe: 'Finish editing and close the active 2D CAD sketch',
  examples: ['close active sketch', 'finish sketch'],
  aliases: {
    en: ['close sketch', 'finish sketch'],
    es: ['cerrar boceto', 'finalizar boceto'],
  },
})

export const deleteCadSketchConstraintCapability = defineCapability({
  type: 'delete_cad_sketch_constraint',
  domain: 'cad',
  schema: z.object({
    type: z.literal('delete_cad_sketch_constraint'),
    sketchId: z.string().optional(),
    constraintId: z.string().min(1),
  }),
  safeImmediate: false,
  describe: 'Remove a geometric constraint from a 2D CAD sketch',
  examples: ['remove horizontal constraint', 'delete constraint c_1'],
  aliases: {
    en: ['delete constraint', 'remove sketch constraint'],
    es: ['eliminar restriccion', 'borrar restriccion de boceto'],
  },
})

export const updateCadSketchDimensionCapability = defineCapability({
  type: 'update_cad_sketch_dimension',
  domain: 'cad',
  schema: z.object({
    type: z.literal('update_cad_sketch_dimension'),
    sketchId: z.string().optional(),
    dimensionId: z.string().min(1),
    value: z.number().positive(),
  }),
  safeImmediate: false,
  describe: 'Change a dimension value on a 2D CAD sketch entity',
  examples: ['change dimension to 50mm', 'update length to 2.5m'],
  aliases: {
    en: ['update dimension', 'change sketch dimension'],
    es: ['actualizar dimension', 'cambiar cota de boceto'],
  },
})

export const executeCadBriefCapability = defineCapability({
  type: 'execute_cad_brief',
  domain: 'cad',
  schema: z.object({
    type: z.literal('execute_cad_brief'),
    brief: CadBriefSchema,
  }),
  safeImmediate: false,
  describe: 'Execute a structured CAD brief containing sketches and operation graphs',
  examples: ['execute CAD parametric brief'],
  aliases: {
    en: ['execute brief', 'run cad plan'],
    es: ['ejecutar brief CAD'],
  },
})

export const runCadPromptCapability = defineCapability({
  type: 'run_cad_prompt',
  domain: 'cad',
  schema: z.object({
    type: z.literal('run_cad_prompt'),
    prompt: z.string().min(1),
  }),
  safeImmediate: false,
  describe: 'Run a natural language prompt against the CAD reasoning pipeline',
  examples: ['generate a mounting bracket with 4 screw holes'],
  aliases: {
    en: ['cad prompt', 'generate CAD part'],
    es: ['prompt CAD', 'generar pieza CAD'],
  },
})

export const generateMacPartCapability = defineCapability({
  type: 'generate_mac_part',
  domain: 'cad',
  schema: z.object({
    type: z.literal('generate_mac_part'),
    prompt: z.string().min(1),
  }),
  safeImmediate: false,
  describe: 'Invoke Multi-Agent-CAD (MAC) generation for complex mechanical solid geometry',
  examples: ['generate spur gear with 24 teeth', 'create printable camera mount'],
  aliases: {
    en: ['generate MAC part', 'MAC CAD'],
    es: ['generar pieza MAC', 'modelo MAC'],
  },
})

export const buildCadSolidCapability = defineCapability({
  type: 'build_cad_solid',
  domain: 'cad',
  schema: z.object({
    type: z.literal('build_cad_solid'),
    name: z.string().optional(),
    spec: z.record(z.string(), z.unknown()),
    position: AssistantPoint3Schema.optional(),
    rotation: AssistantPoint3Schema.optional(),
    color: z.string().optional(),
    roughness: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
    parentId: z.string().optional(),
    partId: z.string().optional(),
    role: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Build a real local CAD solid from a declarative spec (primitives, loft, hull, extrude, revolve, booleans)',
  examples: ['build a holed bracket', 'intersect two silhouettes into a hull'],
  aliases: {
    en: ['build CAD solid', 'local solid'],
    es: ['construir solido CAD', 'solido local'],
  },
})

export const updateCadSolidCapability = defineCapability({
  type: 'update_cad_solid',
  domain: 'cad',
  schema: z.object({
    type: z.literal('update_cad_solid'),
    bodyId: z.string().min(1),
    spec: z.record(z.string(), z.unknown()).optional(),
    position: AssistantPoint3Schema.optional(),
    rotation: AssistantPoint3Schema.optional(),
    color: z.string().optional(),
    roughness: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
  safeImmediate: false,
  describe: 'Update an existing CAD solid in place without changing its id',
  examples: ['move the hull 0.1m up', 'replace the shade spec'],
  aliases: {
    en: ['update CAD solid', 'edit solid'],
    es: ['actualizar solido CAD', 'editar solido'],
  },
})

export const createDefaultCadSketchCapability = defineCapability({
  type: 'create_default_cad_sketch',
  domain: 'cad',
  schema: z.object({
    type: z.literal('create_default_cad_sketch'),
    position: AssistantPoint3Schema.optional(),
  }),
  safeImmediate: false,
  describe: 'Create a new default 2D CAD sketch centered on the workplane',
  examples: ['start new sketch', 'create sketch at origin'],
  aliases: {
    en: ['new sketch', 'create sketch'],
    es: ['nuevo boceto', 'crear boceto'],
  },
})

export const extrudeCadSketchCapability = defineCapability({
  type: 'extrude_cad_sketch',
  domain: 'cad',
  schema: z.object({
    type: z.literal('extrude_cad_sketch'),
    sketchId: z.string().optional(),
    depth: z.number().positive().optional(),
    direction: AssistantCadExtrudeDirectionSchema.default('positive'),
  }),
  safeImmediate: false,
  describe: 'Extrude a closed 2D sketch profile into a 3D solid body',
  examples: ['extrude sketch 10mm', 'extrude 0.5m symmetric'],
  aliases: {
    en: ['extrude sketch', 'extrude profile'],
    es: ['extruir boceto', 'extruir perfil'],
  },
})

export const revolveCadSketchCapability = defineCapability({
  type: 'revolve_cad_sketch',
  domain: 'cad',
  schema: z.object({
    type: z.literal('revolve_cad_sketch'),
    sketchId: z.string().optional(),
    angle: z.number().positive().optional(),
    axis: AssistantCadRevolveAxisSchema.default('Z'),
    customAxis: AssistantPoint3Schema.optional(),
  }),
  safeImmediate: false,
  describe: 'Revolve a 2D sketch profile around an axis to create a solid of revolution',
  examples: ['revolve sketch 360 degrees around Z', 'lathe profile'],
  aliases: {
    en: ['revolve sketch', 'revolve profile'],
    es: ['revolucionar boceto', 'revolucionar perfil'],
  },
})

export const regenerateCadBodyCapability = defineCapability({
  type: 'regenerate_cad_body',
  domain: 'cad',
  schema: z.object({
    type: z.literal('regenerate_cad_body'),
    bodyId: z.string().optional(),
    depth: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Recompute the solid B-rep geometry of an existing CAD body',
  examples: ['regenerate selected CAD body', 'rebuild solid'],
  aliases: {
    en: ['regenerate body', 'rebuild CAD body'],
    es: ['regenerar cuerpo', 'reconstruir cuerpo CAD'],
  },
})

export const retryCadBodyCapability = defineCapability({
  type: 'retry_cad_body',
  domain: 'cad',
  schema: z.object({
    type: z.literal('retry_cad_body'),
    bodyId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Retry a failed CAD body operation graph execution',
  examples: ['retry failed CAD body generation'],
  aliases: {
    en: ['retry body', 'retry generation'],
    es: ['reintentar cuerpo', 'reintentar generacion'],
  },
})

export const setCadBodyOperationSuppressedCapability = defineCapability({
  type: 'set_cad_body_operation_suppressed',
  domain: 'cad',
  schema: z.object({
    type: z.literal('set_cad_body_operation_suppressed'),
    bodyId: z.string().optional(),
    operationId: z.string(),
    suppressed: z.boolean(),
  }),
  safeImmediate: false,
  describe: 'Suppress or unsuppress an operation in a CAD body feature tree',
  examples: ['suppress fillet operation op_2', 'unsuppress cut'],
  aliases: {
    en: ['suppress operation', 'unsuppress feature'],
    es: ['suprimir operacion', 'reactivar operacion'],
  },
})

export const applyCadBooleanCapability = defineCapability({
  type: 'apply_cad_boolean',
  domain: 'cad',
  schema: z.object({
    type: z.literal('apply_cad_boolean'),
    operation: AssistantCadBooleanModeSchema.default('union'),
    targetBodyId: z.string().optional(),
    toolBodyId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Apply a boolean union, cut/difference, or intersect between two CAD solid bodies',
  examples: ['union two selected bodies', 'cut cylinder from box'],
  aliases: {
    en: ['boolean union', 'boolean cut', 'boolean intersect'],
    es: ['union booleana', 'corte booleano', 'interseccion booleana'],
  },
})

export const applyCadFilletCapability = defineCapability({
  type: 'apply_cad_fillet',
  domain: 'cad',
  schema: z.object({
    type: z.literal('apply_cad_fillet'),
    bodyId: z.string().optional(),
    edgeRefs: z.array(z.string()).optional(),
    radius: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Round sharp edges of a CAD body with a constant radius fillet',
  examples: ['fillet edges by 5mm', 'round top edges with 0.1m fillet'],
  aliases: {
    en: ['fillet edges', 'round edges'],
    es: ['redondear aristas', 'acordorar bordes'],
  },
})

export const applyCadChamferCapability = defineCapability({
  type: 'apply_cad_chamfer',
  domain: 'cad',
  schema: z.object({
    type: z.literal('apply_cad_chamfer'),
    bodyId: z.string().optional(),
    edgeRefs: z.array(z.string()).optional(),
    distance: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Bevel sharp edges of a CAD body with a chamfer cut',
  examples: ['chamfer edges by 3mm', 'bevel edges'],
  aliases: {
    en: ['chamfer edges', 'bevel edges'],
    es: ['achaflanar aristas', 'biselar bordes'],
  },
})

export const addCadBoxEarsCapability = defineCapability({
  type: 'add_cad_box_ears',
  domain: 'cad',
  schema: z.object({
    type: z.literal('add_cad_box_ears'),
    bodyId: z.string().optional(),
  }),
  safeImmediate: false,
  describe: 'Attach bilateral decorative or functional cylindrical/box ear bosses to a CAD body',
  examples: ['add ears to box', 'attach ear lugs'],
  aliases: {
    en: ['add ears', 'attach lugs'],
    es: ['poner orejas', 'anadir orejas al cuerpo'],
  },
})

export const extrudeCadBodyFaceCapability = defineCapability({
  type: 'extrude_cad_body_face',
  domain: 'cad',
  schema: z.object({
    type: z.literal('extrude_cad_body_face'),
    bodyId: z.string().optional(),
    face: AssistantCadBoxFaceSchema.default('top'),
    distance: z.number().positive().optional(),
  }),
  safeImmediate: false,
  describe: 'Extend a planar face of a CAD solid body outward or inward',
  examples: ['extrude top face by 0.2m', 'pull front face outward'],
  aliases: {
    en: ['extrude face', 'pull face'],
    es: ['extruir cara', 'empujar cara'],
  },
})

export const shellCadBodyCapability = defineCapability({
  type: 'shell_cad_body',
  domain: 'cad',
  schema: z.object({
    type: z.literal('shell_cad_body'),
    bodyId: z.string().optional(),
    thickness: z.number().positive().optional(),
  }),
  destructive: true,
  describe: 'Hollow out a solid CAD body leaving a thin shell wall of specified thickness',
  examples: ['hollow out body with 2mm shell', 'shell CAD box'],
  aliases: {
    en: ['shell body', 'hollow body'],
    es: ['vaciar cuerpo', 'crear carcasa'],
  },
})

export const exportCadBodyStepCapability = defineCapability({
  type: 'export_cad_body_step',
  domain: 'cad',
  schema: z.object({
    type: z.literal('export_cad_body_step'),
    bodyId: z.string().optional(),
  }),
  safeImmediate: true,
  describe: 'Export the solid CAD body to a standard STEP (ISO 10303) CAD exchange file',
  examples: ['export body as STEP', 'download STEP file'],
  aliases: {
    en: ['export STEP', 'save STEP'],
    es: ['exportar STEP', 'guardar archivo STEP'],
  },
})

// Phase 1 Gap Closures:
export const addCadSketchEntitiesCapability = defineCapability({
  type: 'add_cad_sketch_entities',
  domain: 'cad',
  schema: z.object({
    type: z.literal('add_cad_sketch_entities'),
    sketchId: z.string().optional(),
    entities: z.array(z.record(z.string(), z.unknown())).min(1),
  }),
  safeImmediate: false,
  describe: 'Add 2D sketch entities (lines, rectangles, circles, arcs) directly into a CAD sketch',
  examples: ['draw circle in active sketch', 'add 4 lines to sketch'],
  aliases: {
    en: ['add sketch entities', 'draw in sketch'],
    es: ['anadir entidades al boceto', 'dibujar en boceto'],
  },
})

export const setCadSketchPlaneCapability = defineCapability({
  type: 'set_cad_sketch_plane',
  domain: 'cad',
  schema: z.object({
    type: z.literal('set_cad_sketch_plane'),
    sketchId: z.string().optional(),
    plane: AssistantCadWorkplaneSchema,
  }),
  safeImmediate: true,
  describe: 'Change the projection plane orientation for a CAD sketch',
  examples: ['set sketch workplane to XY', 'change sketch plane to XZ'],
  aliases: {
    en: ['set sketch plane', 'change sketch workplane'],
    es: ['cambiar plano de boceto', 'asignar plano de trabajo al boceto'],
  },
})

export const cadCapabilities = [
  setCadWorkplaneCapability,
  closeCadSketchCapability,
  deleteCadSketchConstraintCapability,
  updateCadSketchDimensionCapability,
  executeCadBriefCapability,
  runCadPromptCapability,
  generateMacPartCapability,
  buildCadSolidCapability,
  updateCadSolidCapability,
  createDefaultCadSketchCapability,
  extrudeCadSketchCapability,
  revolveCadSketchCapability,
  regenerateCadBodyCapability,
  retryCadBodyCapability,
  setCadBodyOperationSuppressedCapability,
  applyCadBooleanCapability,
  applyCadFilletCapability,
  applyCadChamferCapability,
  addCadBoxEarsCapability,
  extrudeCadBodyFaceCapability,
  shellCadBodyCapability,
  exportCadBodyStepCapability,
  addCadSketchEntitiesCapability,
  setCadSketchPlaneCapability,
]
