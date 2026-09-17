import type { TaskPlanAgentDomain, TaskPlanStep } from './assistant-task-plan'

// ---------------------------------------------------------------------------
// Agent domain definitions
// ---------------------------------------------------------------------------

const STRUCTURE_ACTIONS = new Set([
  'create_wall', 'create_zone', 'create_slab', 'create_ceiling',
  'create_roof', 'create_level', 'rename_level', 'set_phase',
  'set_structure_layer', 'focus_level', 'focus_building',
])

const FURNISH_ACTIONS = new Set([
  'place_item', 'place_door', 'place_window',
  'update_item_properties', 'update_door_properties', 'update_window_properties',
  'activate_tool',
])

const CAD_ACTIONS = new Set([
  'run_cad_prompt', 'extrude_cad_sketch', 'revolve_cad_sketch',
  'apply_cad_boolean', 'apply_cad_fillet', 'apply_cad_chamfer',
  'add_cad_box_ears', 'extrude_cad_body_face', 'shell_cad_body',
  'create_default_cad_sketch', 'close_cad_sketch', 'retry_cad_body',
  'regenerate_cad_body', 'set_cad_body_operation_suppressed',
  'set_cad_workplane', 'export_cad_body_step',
])

const LAYOUT_ACTIONS = new Set([
  'move_target', 'rotate_target', 'scale_target',
  'reposition_target', 'duplicate_target', 'duplicate_reposition_target',
  'select_nodes', 'set_transform_mode', 'set_transform_pivot',
])

export type RequestComplexity = 'simple' | 'moderate' | 'complex'

export type AgentTask = {
  agent: TaskPlanAgentDomain
  subPrompt: string
  priority: number
}

// ---------------------------------------------------------------------------
// Agent domain labels for UI
// ---------------------------------------------------------------------------

export const AGENT_LABELS: Record<TaskPlanAgentDomain, { emoji: string; label: string }> = {
  structure: { emoji: '🏗️', label: 'Structure' },
  furnish: { emoji: '🪑', label: 'Furnish' },
  cad: { emoji: '⚙️', label: 'CAD' },
  layout: { emoji: '📐', label: 'Layout' },
  general: { emoji: '🤖', label: 'General' },
}

// ---------------------------------------------------------------------------
// Complexity classification
// ---------------------------------------------------------------------------

const COMPLEX_KEYWORDS = [
  // English
  /\b(house|home|apartment|building|office|cafe|restaurant|shop|store)\b/,
  /\b(furnished|furniture|decorate|decorated)\b/,
  /\b(bedroom|kitchen|bathroom|living room|dining)\b/,
  /\b(with doors|with windows|with roof|with furniture)\b/,
  /\b(complete|full|entire|everything)\b/,
  // Spanish
  /\b(casa|casita|apartamento|edificio|oficina|cafe|restaurante|tienda)\b/,
  /\b(amueblado|muebles|decorado|decorada)\b/,
  /\b(habitacion|habitación|cocina|bano|baño|sala|comedor|dormitorio)\b/,
  /\b(con puertas|con ventanas|con techo|con muebles)\b/,
  /\b(completo|completa|todo|toda)\b/,
]

const MODERATE_KEYWORDS = [
  /\b(room|create room|add room|make room)\b/,
  /\b(wall|walls|add walls)\b/,
  /\b(furnish|place|add furniture)\b/,
  /\b(habitación|cuarto|paredes|agrega)\b/,
]

export const classifyRequestComplexity = (
  prompt: string,
  _context?: Record<string, unknown>,
): RequestComplexity => {
  const normalized = prompt.toLowerCase().trim()

  // Count how many complex keywords match
  let complexMatches = 0
  for (const pattern of COMPLEX_KEYWORDS) {
    if (pattern.test(normalized)) complexMatches++
  }

  // Two or more complex keywords → complex
  if (complexMatches >= 2) return 'complex'

  // One complex keyword + length suggests detail
  if (complexMatches === 1 && normalized.length > 60) return 'complex'

  // Check moderate keywords
  let moderateMatches = 0
  for (const pattern of MODERATE_KEYWORDS) {
    if (pattern.test(normalized)) moderateMatches++
  }

  if (moderateMatches >= 2 || complexMatches === 1) return 'moderate'

  return 'simple'
}

// ---------------------------------------------------------------------------
// Decompose prompt into agent sub-tasks
// ---------------------------------------------------------------------------

const STRUCTURE_PATTERNS = [
  /\b(room|rooms|wall|walls|slab|floor|ceiling|roof|level|zone|house|home|building|office|cafe|restaurant|shop)\b/i,
  /\b(habitación|cuarto|pared|paredes|piso|techo|nivel|zona|casa|edificio|oficina|cafe|restaurante|tienda)\b/i,
]

const FURNISH_PATTERNS = [
  /\b(furnish|furniture|sofa|table|chair|bed|tv|lamp|rug|door|window|cabinet|shelf|seating|seat)\b/i,
  /\b(mueble|muebles|sofa|mesa|silla|cama|television|lampara|alfombra|puerta|ventana|asiento|asientos)\b/i,
]

const CAD_PATTERNS = [
  /\b(cad|extrude|revolve|boolean|fillet|chamfer|sketch|3d print|parametric)\b/i,
  /\b(extruir|revolucionar|booleano|filete|chaflán|boceto)\b/i,
]

const LAYOUT_PATTERNS = [
  /\b(move|rotate|scale|position|reposition|arrange|align|center)\b/i,
  /\b(mover|rotar|escalar|posicionar|alinear|centrar)\b/i,
]

export const decomposeIntoAgentTasks = (
  prompt: string,
  _context?: Record<string, unknown>,
): AgentTask[] => {
  const normalized = prompt.toLowerCase().trim()
  const tasks: AgentTask[] = []

  const hasStructure = STRUCTURE_PATTERNS.some((p) => p.test(normalized))
  const hasFurnish = FURNISH_PATTERNS.some((p) => p.test(normalized))
  const hasCad = CAD_PATTERNS.some((p) => p.test(normalized))
  const hasLayout = LAYOUT_PATTERNS.some((p) => p.test(normalized))

  if (hasStructure) {
    tasks.push({ agent: 'structure', subPrompt: prompt, priority: 1 })
  }

  if (hasLayout) {
    tasks.push({ agent: 'layout', subPrompt: prompt, priority: 2 })
  }

  if (hasFurnish) {
    tasks.push({ agent: 'furnish', subPrompt: prompt, priority: 3 })
  }

  if (hasCad) {
    tasks.push({ agent: 'cad', subPrompt: prompt, priority: 4 })
  }

  // If nothing matched, assign to general
  if (tasks.length === 0) {
    tasks.push({ agent: 'general', subPrompt: prompt, priority: 5 })
  }

  return tasks.sort((a, b) => a.priority - b.priority)
}

// ---------------------------------------------------------------------------
// Tag a step with the dominant agent based on its actions
// ---------------------------------------------------------------------------

export const tagStepWithAgent = (step: Pick<TaskPlanStep, 'actions'>): TaskPlanAgentDomain => {
  const counts: Record<TaskPlanAgentDomain, number> = {
    structure: 0,
    furnish: 0,
    cad: 0,
    layout: 0,
    general: 0,
  }

  for (const action of step.actions) {
    if (STRUCTURE_ACTIONS.has(action.type)) {
      counts.structure++
    } else if (FURNISH_ACTIONS.has(action.type)) {
      counts.furnish++
    } else if (CAD_ACTIONS.has(action.type)) {
      counts.cad++
    } else if (LAYOUT_ACTIONS.has(action.type)) {
      counts.layout++
    } else {
      counts.general++
    }
  }

  let best: TaskPlanAgentDomain = 'general'
  let bestCount = 0
  for (const [domain, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count
      best = domain as TaskPlanAgentDomain
    }
  }

  return best
}
