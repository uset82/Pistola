import type { AssistantAction } from '../../../packages/editor/src/lib/assistant/types'
import type { AssistantPlanRequest } from './assistant-ai-provider'

export type AssistantFailureSource =
  | 'planner'
  | 'multimodal extraction'
  | 'decomposition'
  | 'action surface'
  | 'cad brief'
  | 'executor'
  | 'continuation'
  | 'asset/catalog'
  | 'timeout'
  | 'unsupported'

export type AssistantChatSmarterFailureSource =
  | 'planner weakness'
  | 'stale target resolution'
  | 'selection drift'
  | 'action surface gap'
  | 'executor failure'
  | 'continuation failure'
  | 'unsupported prompt'
  | 'composer-assist gap'

export type AssistantCommandVisionFailureSource =
  | 'command routing'
  | 'planner drift'
  | 'schema validation'
  | 'image interpretation'
  | 'target grounding'
  | 'destructive review'
  | 'executor'
  | 'timeout'

export type AssistantAcceptanceFixture = {
  id: string
  prompt: string
  owner: 'assistant-planner' | 'assistant-planner-remote' | 'cad-brief' | 'executor'
  context?: AssistantPlanRequest['context']
  image?: AssistantPlanRequest['image']
  imageDataUrl?: string
  buildable?: boolean
  baselineFailureSource?: AssistantFailureSource
  expectedTurn: {
    mode: 'plan' | 'clarify' | 'chat'
    replyPattern: RegExp
    actions: AssistantAction[]
    requiresReview: boolean
    destructiveActionCount: number
    hasContinuation?: boolean
  }
}

export type AssistantSessionResetFixture = {
  id: string
  currentChatMode: 'ask' | 'create' | 'refine'
  preserveChatMode?: boolean
  baselineFailureSource: AssistantChatSmarterFailureSource
  expectedChatMode: 'ask' | 'create' | 'refine'
}

export type AssistantComposerAssistFixture = {
  id: string
  baselineFailureSource: AssistantChatSmarterFailureSource
  context: {
    input: string
    phase: string
    tool: string | null
    selectedSummary: string
    hasSelection: boolean
    levelId: string | null
    chatMode: 'ask' | 'create' | 'refine'
    catalogCategories: string[]
    recentSuccessfulPrompts: string[]
  }
  expectedLeadingSuggestionId: string
}

export type AssistantCommandVisionFixture = {
  id: string
  prompt: string
  baselineFailureSource: AssistantCommandVisionFailureSource
  context?: AssistantPlanRequest['context']
  image: NonNullable<AssistantPlanRequest['image']>
}

export const assistantAcceptanceFixtures: AssistantAcceptanceFixture[] = [
  {
    id: 'build_box_missing_dimensions',
    prompt: 'build a box',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
      },
    },
    buildable: true,
    baselineFailureSource: 'cad brief',
    expectedTurn: {
      mode: 'clarify',
      replyPattern: /box dimensions/i,
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'build_box_dimensioned',
    prompt: 'build a box 1m x 2m x 0.5m',
    owner: 'cad-brief',
    context: {
      selection: {
        levelId: 'level_0',
      },
    },
    buildable: true,
    baselineFailureSource: 'cad brief',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /cad/i,
      actions: [{
        type: 'execute_cad_brief',
        brief: {
          intent: 'build a box 1m x 2m x 0.5m',
          sketchPlans: [{
            plane: 'level',
            entities: [{ type: 'rectangle', points: [[-0.5, -1], [0.5, 1]], params: {} }],
            dimensions: [{ kind: 'distance', value: 1, label: 'width' }, { kind: 'distance', value: 2, label: 'depth' }],
            constraints: [],
          }],
          operationGraph: [{
            id: 'op_box_extrude_1',
            op: 'extrude',
            params: { sketchIndex: 0, distance: 0.5, direction: [0, 1, 0], symmetric: false },
            dependsOn: [],
          }],
          assumptions: [
            'Interpreted the prompt as a rectangular box with a 1 m by 2 m footprint.',
            'Extruded the footprint 0.5 m upward on the level workplane.',
          ],
          ambiguities: [],
        },
      }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'switch_to_structure_wall_tool',
    prompt: 'switch to structure and open the wall tool',
    owner: 'assistant-planner',
    context: {},
    buildable: true,
    baselineFailureSource: 'planner',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /wall tool/i,
      actions: [
        { type: 'set_phase', phase: 'structure' },
        { type: 'activate_tool', tool: 'wall' },
      ],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'create_level_scaffold',
    prompt: 'add a new level 1 to this building',
    owner: 'assistant-planner',
    context: {
      selection: {
        buildingId: 'building_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'decomposition',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /level scaffold|new editable level/i,
      actions: [{ type: 'create_level', buildingId: 'building_0', level: 1, name: 'Level 1' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'create_rectangular_room_with_roof',
    prompt: 'create a 4m x 4m room on level 0 with walls, slab, and roof',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'decomposition',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /rectangular editable room/i,
      actions: [
        { type: 'create_zone', levelId: 'level_0', name: 'Room', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], color: '#eab308' },
        { type: 'create_wall', levelId: 'level_0', start: [0, 0], end: [4, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [4, 0], end: [4, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [4, 4], end: [0, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 4], end: [0, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_slab', levelId: 'level_0', name: 'Room Slab', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
        { type: 'create_ceiling', levelId: 'level_0', name: 'Room Ceiling', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], height: 2.7 },
        { type: 'create_roof', levelId: 'level_0', name: 'Room Roof', corner1: [0, 0], corner2: [4, 4], height: 1.4 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'build_two_bedroom_house_shell',
    prompt: 'make a small two-bedroom house with kitchen and living room',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'decomposition',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /house shell/i,
      actions: [
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Living Room',
          polygon: [[0, 0], [4.4, 0], [4.4, 4], [0, 4]],
          color: '#eab308',
        },
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Kitchen',
          polygon: [[4.4, 0], [8, 0], [8, 4], [4.4, 4]],
          color: '#f97316',
        },
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Bedroom 1',
          polygon: [[0, 4], [4, 4], [4, 7.2], [0, 7.2]],
          color: '#38bdf8',
        },
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Bedroom 2',
          polygon: [[4, 4], [8, 4], [8, 7.2], [4, 7.2]],
          color: '#22c55e',
        },
        { type: 'create_wall', levelId: 'level_0', start: [0, 0], end: [8, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [8, 0], end: [8, 7.2], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [8, 7.2], end: [0, 7.2], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 7.2], end: [0, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [4.4, 0], end: [4.4, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 4], end: [8, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [4, 4], end: [4, 7.2], height: 2.7, thickness: 0.15 },
        { type: 'create_slab', levelId: 'level_0', name: 'Main Slab', polygon: [[0, 0], [8, 0], [8, 7.2], [0, 7.2]] },
        { type: 'create_ceiling', levelId: 'level_0', name: 'Main Ceiling', polygon: [[0, 0], [8, 0], [8, 7.2], [0, 7.2]], height: 2.7 },
        { type: 'create_roof', levelId: 'level_0', name: 'Main Roof', corner1: [0, 0], corner2: [8, 7.2], height: 1.6 },
        { type: 'place_door', wallId: '$ref_wall_0', localX: 1.2, width: 1, height: 2.2 },
        { type: 'place_window', wallId: '$ref_wall_1', localX: 2.2, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_wall_2', localX: 1.8, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_wall_2', localX: 6.2, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_wall_3', localX: 2.4, localY: 1.45, width: 1.6, height: 1.3 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
      hasContinuation: false,
    },
  },
  {
    id: 'build_spanish_pet_house',
    prompt: 'genera una casita para mi perro',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'timeout',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /pet house|dog house/i,
      actions: [
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Dog House',
          polygon: [[0, 0], [1.2, 0], [1.2, 1.4], [0, 1.4]],
          color: '#fde68a',
        },
        { type: 'create_wall', levelId: 'level_0', start: [0, 0], end: [0, 1.4], height: 0.8, thickness: 0.05 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 1.4], end: [1.2, 1.4], height: 0.8, thickness: 0.05 },
        { type: 'create_wall', levelId: 'level_0', start: [1.2, 1.4], end: [1.2, 0], height: 0.8, thickness: 0.05 },
        { type: 'create_wall', levelId: 'level_0', start: [1.2, 0], end: [0, 0], height: 0.8, thickness: 0.05 },
        { type: 'create_slab', levelId: 'level_0', name: 'Dog House Slab', polygon: [[0, 0], [1.2, 0], [1.2, 1.4], [0, 1.4]] },
        { type: 'create_roof', levelId: 'level_0', name: 'Dog House Roof', corner1: [0, 0], corner2: [1.2, 1.4], height: 0.48 },
        { type: 'place_door', wallId: '$ref_pet_house_wall_front', localX: 0.6, width: 0.54, height: 0.5599999999999999 },
        { type: 'place_window', wallId: '$ref_pet_house_wall_front', localX: 0.6, localY: 0.68, width: 0.3, height: 0.2 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
      hasContinuation: false,
    },
  },
  {
    id: 'build_small_furnished_cafe',
    prompt: 'make a small furnished cafe',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'planner',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /furnished cafe|cafe shell/i,
      actions: [
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Cafe',
          polygon: [[0, 0], [6.5, 0], [6.5, 5.5], [0, 5.5]],
          color: '#f59e0b',
        },
        { type: 'create_wall', levelId: 'level_0', start: [0, 0], end: [6.5, 0], height: 2.8, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [6.5, 0], end: [6.5, 5.5], height: 2.8, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [6.5, 5.5], end: [0, 5.5], height: 2.8, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 5.5], end: [0, 0], height: 2.8, thickness: 0.15 },
        { type: 'create_slab', levelId: 'level_0', name: 'Cafe Slab', polygon: [[0, 0], [6.5, 0], [6.5, 5.5], [0, 5.5]] },
        { type: 'create_ceiling', levelId: 'level_0', name: 'Cafe Ceiling', polygon: [[0, 0], [6.5, 0], [6.5, 5.5], [0, 5.5]], height: 2.8 },
        { type: 'create_roof', levelId: 'level_0', name: 'Cafe Roof', corner1: [0, 0], corner2: [6.5, 5.5], height: 1.4 },
        { type: 'place_door', wallId: '$ref_cafe_wall_0', localX: 3.12, width: 1.1, height: 2.2 },
        { type: 'place_window', wallId: '$ref_cafe_wall_1', localX: 2.2, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_cafe_wall_3', localX: 3.3, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_item', assetId: 'kitchen-counter', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [5.3, 0, 0.9] },
        { type: 'place_item', assetId: 'coffee-machine', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [5.2, 0, 1.5] },
        { type: 'place_item', assetId: 'stool', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [4.4, 0, 1.4] },
        { type: 'place_item', assetId: 'stool', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [4.4, 0, 2.1] },
        { type: 'place_item', assetId: 'dining-table', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [1.8, 0, 1.8] },
        { type: 'place_item', assetId: 'dining-chair', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [1.2, 0, 1.8] },
        { type: 'place_item', assetId: 'dining-chair', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [2.4, 0, 1.8] },
        { type: 'place_item', assetId: 'dining-table', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [3.7, 0, 3.3] },
        { type: 'place_item', assetId: 'dining-chair', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [3.1, 0, 3.3] },
        { type: 'place_item', assetId: 'dining-chair', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [4.3, 0, 3.3] },
        { type: 'place_item', assetId: 'indoor-plant', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [0.8, 0, 4.8] },
        { type: 'place_item', assetId: 'floor-lamp', targetNodeId: '$ref_zone_cafe', placement: 'explicit', position: [5.7, 0, 4.7] },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'place_sofa_center_room',
    prompt: 'put a sofa in the center of the room',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        zoneId: 'zone_living',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' }],
      catalog: [{ id: 'sofa', name: 'Sofa', category: 'furniture', attachTo: null, tags: ['couch'] }],
    },
    buildable: true,
    baselineFailureSource: 'asset/catalog',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /furnish|sofa/i,
      actions: [{ type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_living', placement: 'center' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'furnish_living_room_bundle',
    prompt: 'furnish the living room with a sofa, coffee table, rug, and TV wall',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' }],
    },
    buildable: true,
    baselineFailureSource: 'asset/catalog',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /furnish/i,
      actions: [
        { type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'coffee-table', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'television', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'tv-stand', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'shower-rug', targetNodeId: 'zone_living', placement: 'center' },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'place_sofa_in_named_kitchen',
    prompt: 'put a sofa in the kitchen',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [
        { id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' },
        { id: 'zone_kitchen', type: 'zone', name: 'Kitchen', parentId: 'level_0' },
      ],
      catalog: [{ id: 'sofa', name: 'Sofa', category: 'furniture', attachTo: null, tags: ['couch'] }],
    },
    buildable: true,
    baselineFailureSource: 'action surface',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /furnish|catalog items/i,
      actions: [{ type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_kitchen', placement: 'center' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'rename_selected_room_to_kitchen',
    prompt: 'rename this room kitchen',
    owner: 'assistant-planner',
    context: {
      selection: {
        zoneId: 'zone_room',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'zone_room', type: 'zone', name: 'Room', parentId: 'level_0' }],
    },
    buildable: true,
    baselineFailureSource: 'action surface',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /rename/i,
      actions: [{ type: 'rename_node', nodeId: 'zone_room', name: 'Kitchen' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'hide_selected_reference',
    prompt: 'hide this reference',
    owner: 'assistant-planner',
    context: {
      selection: {
        selectedIds: ['guide_ref'],
      },
      selectedNodeSummary: [{ id: 'guide_ref', type: 'guide', name: 'Reference Guide' }],
    },
    buildable: true,
    baselineFailureSource: 'action surface',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /hide/i,
      actions: [{ type: 'set_node_visibility', nodeIds: ['guide_ref'], visible: false }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'clean_current_level_contents',
    prompt: 'clean everything',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: ['slab_old'],
      },
      selectedNodeSummary: [{ id: 'slab_old', type: 'slab', name: 'Old Slab', parentId: 'level_0' }],
      sceneSummary: [
        { id: 'wall_old', type: 'wall', name: 'Old Wall', parentId: 'level_0' },
        { id: 'roof_old', type: 'roof', name: 'Old Roof', parentId: 'level_0' },
      ],
    },
    buildable: true,
    baselineFailureSource: 'executor',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /clear the current level|leave it blank/i,
      actions: [{ type: 'clear_level_contents', levelId: 'level_0' }],
      requiresReview: true,
      destructiveActionCount: 1,
    },
  },
  {
    id: 'make_windows_taller',
    prompt: 'make the windows taller',
    owner: 'assistant-planner',
    context: {
      selection: {
        selectedIds: [],
      },
      sceneSummary: [
        { id: 'window_a', type: 'window', name: 'Window A', height: 1.2 },
        { id: 'window_b', type: 'window', name: 'Window B', height: 1.4 },
      ],
    },
    buildable: true,
    baselineFailureSource: 'action surface',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /windows taller/i,
      actions: [
        { type: 'update_window_properties', nodeId: 'window_a', height: 1.5 },
        { type: 'update_window_properties', nodeId: 'window_b', height: 1.7 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'add_two_windows_to_selected_wall',
    prompt: 'add two windows',
    owner: 'assistant-planner',
    context: {
      selection: {
        selectedIds: ['wall_main'],
      },
      selectedNodeSummary: [
        {
          id: 'wall_main',
          type: 'wall',
          name: 'Main Wall',
          start: [0, 0],
          end: [6, 0],
          parentId: 'level_0',
        },
      ],
      sceneSummary: [
        {
          id: 'wall_main',
          type: 'wall',
          name: 'Main Wall',
          start: [0, 0],
          end: [6, 0],
          parentId: 'level_0',
        },
      ],
    },
    buildable: true,
    baselineFailureSource: 'action surface',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /two windows/i,
      actions: [
        { type: 'place_window', wallId: 'wall_main', localX: 1.98, localY: 1.4, width: 1.32, height: 1.2 },
        { type: 'place_window', wallId: 'wall_main', localX: 3.96, localY: 1.4, width: 1.32, height: 1.2 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'large_furnished_house_continues',
    prompt: 'make a furnished small two-bedroom house with kitchen and living room',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'continuation',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /step 1 of/i,
      actions: [],
      requiresReview: true,
      destructiveActionCount: 0,
      hasContinuation: true,
    },
  },
  {
    id: 'spanish_two_bedroom_house_shell',
    prompt: 'haz una casa pequena de dos habitaciones con cocina y sala',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
    },
    buildable: true,
    baselineFailureSource: 'decomposition',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /house shell/i,
      actions: [
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Living Room',
          polygon: [[0, 0], [4.4, 0], [4.4, 4], [0, 4]],
          color: '#eab308',
        },
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Kitchen',
          polygon: [[4.4, 0], [8, 0], [8, 4], [4.4, 4]],
          color: '#f97316',
        },
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Bedroom 1',
          polygon: [[0, 4], [4, 4], [4, 7.2], [0, 7.2]],
          color: '#38bdf8',
        },
        {
          type: 'create_zone',
          levelId: 'level_0',
          name: 'Bedroom 2',
          polygon: [[4, 4], [8, 4], [8, 7.2], [4, 7.2]],
          color: '#22c55e',
        },
        { type: 'create_wall', levelId: 'level_0', start: [0, 0], end: [8, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [8, 0], end: [8, 7.2], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [8, 7.2], end: [0, 7.2], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 7.2], end: [0, 0], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [4.4, 0], end: [4.4, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [0, 4], end: [8, 4], height: 2.7, thickness: 0.15 },
        { type: 'create_wall', levelId: 'level_0', start: [4, 4], end: [4, 7.2], height: 2.7, thickness: 0.15 },
        { type: 'create_slab', levelId: 'level_0', name: 'Main Slab', polygon: [[0, 0], [8, 0], [8, 7.2], [0, 7.2]] },
        { type: 'create_ceiling', levelId: 'level_0', name: 'Main Ceiling', polygon: [[0, 0], [8, 0], [8, 7.2], [0, 7.2]], height: 2.7 },
        { type: 'create_roof', levelId: 'level_0', name: 'Main Roof', corner1: [0, 0], corner2: [8, 7.2], height: 1.6 },
        { type: 'place_door', wallId: '$ref_wall_0', localX: 1.2, width: 1, height: 2.2 },
        { type: 'place_window', wallId: '$ref_wall_1', localX: 2.2, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_wall_2', localX: 1.8, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_wall_2', localX: 6.2, localY: 1.45, width: 1.6, height: 1.3 },
        { type: 'place_window', wallId: '$ref_wall_3', localX: 2.4, localY: 1.45, width: 1.6, height: 1.3 },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'spanish_furnish_living_room_bundle',
    prompt: 'amuebla la sala con sofa, mesa de centro, alfombra y tv',
    owner: 'assistant-planner',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Sala', parentId: 'level_0' }],
    },
    buildable: true,
    baselineFailureSource: 'asset/catalog',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /furnish/i,
      actions: [
        { type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'coffee-table', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'television', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'tv-stand', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'shower-rug', targetNodeId: 'zone_living', placement: 'center' },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'spanish_move_sofa_left',
    prompt: 'mueve el sofa a la izquierda 0.5 m',
    owner: 'assistant-planner',
    context: {
      selection: {
        selectedIds: [],
      },
      sceneSummary: [
        {
          id: 'item_sofa',
          type: 'item',
          name: 'Sofa',
          position: [2, 0, 2],
          asset: { id: 'sofa', name: 'Sofa' },
        },
      ],
    },
    buildable: true,
    baselineFailureSource: 'action surface',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /move the sofa/i,
      actions: [{ type: 'move_target', nodeId: 'item_sofa', delta: [-0.5, 0, 0] }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'image_floorplan_buildable_plan',
    prompt: 'recreate this floor plan approximately',
    owner: 'assistant-planner-remote',
    imageDataUrl: 'data:image/png;base64,ZmFrZQ==',
    context: {
      selection: {
        levelId: 'level_0',
      },
    },
    buildable: true,
    baselineFailureSource: 'multimodal extraction',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /floor plan/i,
      actions: [{ type: 'create_zone', levelId: 'level_0', name: 'Approx Room', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'image_reference_room_furnish_layout',
    prompt: 'use this room reference to furnish the room approximately',
    owner: 'assistant-planner-remote',
    imageDataUrl: 'data:image/png;base64,ZmFrZQ==',
    context: {
      selection: {
        levelId: 'level_0',
        zoneId: 'zone_living',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'zone_living', type: 'zone', name: 'Living Room', parentId: 'level_0' }],
    },
    buildable: true,
    baselineFailureSource: 'multimodal extraction',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /room/i,
      actions: [
        { type: 'place_item', assetId: 'sofa', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'coffee-table', targetNodeId: 'zone_living', placement: 'center' },
        { type: 'place_item', assetId: 'shower-rug', targetNodeId: 'zone_living', placement: 'center' },
      ],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'image_sketch_cad_part_plan',
    prompt: 'create a simple bracket approximation from this drawing',
    owner: 'assistant-planner-remote',
    imageDataUrl: 'data:image/png;base64,ZmFrZQ==',
    context: {
      selection: {
        levelId: 'level_0',
      },
    },
    buildable: true,
    baselineFailureSource: 'multimodal extraction',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /cad build|bracket/i,
      actions: [{ type: 'run_cad_prompt', prompt: 'create a simple bracket approximation from this drawing' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'spanish_box_ears',
    prompt: 'al cubo conviertelo en la superficie dale unas orejas',
    owner: 'assistant-planner',
    context: {
      selectedNodeSummary: [{ id: 'cbody_selected', type: 'cad-body' }],
    },
    buildable: true,
    baselineFailureSource: 'planner',
    expectedTurn: {
      mode: 'plan',
      replyPattern: /ears/i,
      actions: [{ type: 'add_cad_box_ears', bodyId: 'cbody_selected' }],
      requiresReview: true,
      destructiveActionCount: 0,
    },
  },
  {
    id: 'unsupported_branded_exact_mesh',
    prompt: 'create an exact ferrari with full animation rig',
    owner: 'assistant-planner',
    context: {},
    buildable: false,
    baselineFailureSource: 'unsupported',
    expectedTurn: {
      mode: 'chat',
      replyPattern: /cannot create an exact branded|nearest buildable fallback/i,
      actions: [],
      requiresReview: false,
      destructiveActionCount: 0,
    },
  },
]

export const assistantCommandVisionFixtures: AssistantCommandVisionFixture[] = [
  {
    id: 'workspace_cleanup_annotated_region',
    prompt: 'clean this area',
    baselineFailureSource: 'target grounding',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [
        { id: 'wall_a', type: 'wall', name: 'Wall A' },
        { id: 'wall_b', type: 'wall', name: 'Wall B' },
        { id: 'slab_a', type: 'slab', name: 'Slab A' },
      ],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace-cleanup',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.18, y: 0.2, width: 0.42, height: 0.44 },
        imageWidth: 1024,
        imageHeight: 768,
        redPixelCount: 1280,
        annotationKinds: [],
      },
    },
  },
  {
    id: 'workspace_move_window_left',
    prompt: 'move this window left',
    baselineFailureSource: 'command routing',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'window_a', type: 'window', name: 'Front Window' }],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace-window',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.46, y: 0.22, width: 0.21, height: 0.24 },
        imageWidth: 1024,
        imageHeight: 768,
        redPixelCount: 940,
        annotationKinds: [],
      },
    },
  },
  {
    id: 'workspace_delete_highlighted_walls',
    prompt: 'delete the highlighted walls',
    baselineFailureSource: 'destructive review',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [
        { id: 'wall_a', type: 'wall', name: 'Wall A' },
        { id: 'wall_b', type: 'wall', name: 'Wall B' },
        { id: 'wall_c', type: 'wall', name: 'Wall C' },
      ],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace-walls',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.15, y: 0.17, width: 0.64, height: 0.56 },
        imageWidth: 1200,
        imageHeight: 800,
        redPixelCount: 2110,
        annotationKinds: [],
      },
    },
  },
  {
    id: 'planner_alias_phase_mismatch',
    prompt: 'switch to furnish mode',
    baselineFailureSource: 'planner drift',
    image: {
      dataUrl: 'data:image/png;base64,reference-image',
      kind: 'reference',
      source: 'upload',
    },
  },
  {
    id: 'command_delete_without_selection',
    prompt: 'remove this',
    baselineFailureSource: 'schema validation',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'roof_a', type: 'roof', name: 'Main Roof' }],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace-roof',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.38, y: 0.16, width: 0.24, height: 0.18 },
        imageWidth: 1365,
        imageHeight: 768,
        redPixelCount: 880,
        annotationKinds: [],
      },
    },
  },
  {
    id: 'workspace_unknown_image_requires_grounding',
    prompt: 'remove this',
    baselineFailureSource: 'image interpretation',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [],
    },
    image: {
      dataUrl: 'data:image/png;base64,unknown-workspace',
      kind: 'auto',
      source: 'upload',
    },
  },
  {
    id: 'stale_reviewed_delete_batch',
    prompt: 'delete the highlighted walls',
    baselineFailureSource: 'executor',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [
        { id: 'wall_a', type: 'wall', name: 'Wall A' },
        { id: 'wall_b', type: 'wall', name: 'Wall B' },
      ],
    },
    image: {
      dataUrl: 'data:image/png;base64,stale-batch',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.22, y: 0.2, width: 0.4, height: 0.35 },
        imageWidth: 800,
        imageHeight: 600,
        redPixelCount: 620,
        annotationKinds: [],
      },
    },
  },
  {
    id: 'raw_planner_schema_mismatch',
    prompt: 'clean de area',
    baselineFailureSource: 'timeout',
    context: {
      selection: {
        levelId: 'level_0',
        selectedIds: [],
      },
      sceneSummary: [{ id: 'wall_a', type: 'wall', name: 'Wall A' }],
    },
    image: {
      dataUrl: 'data:image/png;base64,workspace-schema',
      kind: 'workspace',
      source: 'upload',
      analysis: {
        hasRedMarkup: true,
        redMarkupBounds: { x: 0.25, y: 0.21, width: 0.3, height: 0.33 },
        imageWidth: 800,
        imageHeight: 600,
        redPixelCount: 760,
        annotationKinds: [],
      },
    },
  },
]

export const assistantSessionResetFixtures: AssistantSessionResetFixture[] = [
  {
    id: 'new_chat_preserves_current_mode_when_requested',
    currentChatMode: 'refine',
    preserveChatMode: true,
    baselineFailureSource: 'selection drift',
    expectedChatMode: 'refine',
  },
  {
    id: 'new_chat_defaults_back_to_create',
    currentChatMode: 'ask',
    baselineFailureSource: 'selection drift',
    expectedChatMode: 'create',
  },
]

export const assistantComposerAssistFixtures: AssistantComposerAssistFixture[] = [
  {
    id: 'composer_ranks_cafe_creation_for_cafe_input',
    baselineFailureSource: 'composer-assist gap',
    context: {
      input: 'cafe',
      phase: 'structure',
      tool: 'wall',
      selectedSummary: 'No selection',
      hasSelection: false,
      levelId: 'level_0',
      chatMode: 'create',
      catalogCategories: ['furniture'],
      recentSuccessfulPrompts: [],
    },
    expectedLeadingSuggestionId: 'create-cafe',
  },
  {
    id: 'composer_ranks_recent_success_for_exact_reuse',
    baselineFailureSource: 'composer-assist gap',
    context: {
      input: 'make a small furnished cafe',
      phase: 'structure',
      tool: 'select',
      selectedSummary: 'No selection',
      hasSelection: false,
      levelId: 'level_0',
      chatMode: 'create',
      catalogCategories: ['furniture'],
      recentSuccessfulPrompts: ['Make a small furnished cafe'],
    },
    expectedLeadingSuggestionId: 'recent-success-0',
  },
]

export type AssistantSurfaceSourceFixture = {
  id: string
  path: string
  requiredPatterns: RegExp[]
  forbiddenMutationPatterns: RegExp[]
}

export const assistantSurfaceSourceFixtures: AssistantSurfaceSourceFixture[] = [
  {
    id: 'command_palette',
    path: 'packages/editor/src/components/ui/command-palette/index.tsx',
    requiredPatterns: [/runAssistantCommand/, /runCadCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'cad_tools',
    path: 'packages/editor/src/components/ui/action-menu/cad-tools.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'cad_command_actions',
    path: 'packages/editor/src/lib/cad-command-actions.ts',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'structure_tools',
    path: 'packages/editor/src/components/ui/action-menu/structure-tools.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'camera_actions',
    path: 'packages/editor/src/components/ui/action-menu/camera-actions.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'view_toggles',
    path: 'packages/editor/src/components/ui/action-menu/view-toggles.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'control_modes',
    path: 'packages/editor/src/components/ui/action-menu/control-modes.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'furnish_tools',
    path: 'packages/editor/src/components/ui/action-menu/furnish-tools.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'cad_helper',
    path: 'packages/editor/src/components/ui/helpers/cad-helper.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'viewer_overlay',
    path: 'packages/editor/src/components/viewer-overlay.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'icon_rail',
    path: 'packages/editor/src/components/ui/sidebar/icon-rail.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'workspace_switcher',
    path: 'packages/editor/src/components/ui/sidebar/workspace-switcher.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'settings_panel',
    path: 'packages/editor/src/components/ui/sidebar/panels/settings-panel/index.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'cad_body_panel',
    path: 'packages/editor/src/components/ui/panels/cad-body-panel.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'cad_sketch_panel',
    path: 'packages/editor/src/components/ui/panels/cad-sketch-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /delete_cad_sketch_constraint/, /update_cad_sketch_dimension/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'item_panel',
    path: 'packages/editor/src/components/ui/panels/item-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_item_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'door_panel',
    path: 'packages/editor/src/components/ui/panels/door-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_door_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'window_panel',
    path: 'packages/editor/src/components/ui/panels/window-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_window_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'wall_panel',
    path: 'packages/editor/src/components/ui/panels/wall-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_wall_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'slab_panel',
    path: 'packages/editor/src/components/ui/panels/slab-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_slab_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'ceiling_panel',
    path: 'packages/editor/src/components/ui/panels/ceiling-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_ceiling_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'roof_panel',
    path: 'packages/editor/src/components/ui/panels/roof-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_roof_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'reference_panel',
    path: 'packages/editor/src/components/ui/panels/reference-panel.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_reference_properties/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'site_building_tree',
    path: 'packages/editor/src/components/ui/sidebar/panels/site-panel/building-tree-node.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'site_level_tree',
    path: 'packages/editor/src/components/ui/sidebar/panels/site-panel/level-tree-node.tsx',
    requiredPatterns: [/runAssistantCommand/],
    forbiddenMutationPatterns: [/setPhase\(/, /setTool\(/, /setMode\(/, /updateNode\(/, /createNode\(/, /deleteNode\(/],
  },
  {
    id: 'inline_rename_input',
    path: 'packages/editor/src/components/ui/sidebar/panels/site-panel/inline-rename-input.tsx',
    requiredPatterns: [/runAssistantCommand/, /rename_node/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'tree_node_actions',
    path: 'packages/editor/src/components/ui/sidebar/panels/site-panel/tree-node-actions.tsx',
    requiredPatterns: [/runAssistantCommand/, /set_node_visibility/],
    forbiddenMutationPatterns: [/updateNode\(/, /updateNodes\(/, /deleteNode\(/],
  },
  {
    id: 'zone_tree_node',
    path: 'packages/editor/src/components/ui/sidebar/panels/site-panel/zone-tree-node.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_zone_color/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'site_panel',
    path: 'packages/editor/src/components/ui/sidebar/panels/site-panel/index.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_site_properties/, /update_zone_color/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
  {
    id: 'zone_panel',
    path: 'packages/editor/src/components/ui/sidebar/panels/zone-panel/index.tsx',
    requiredPatterns: [/runAssistantCommand/, /update_zone_color/],
    forbiddenMutationPatterns: [/updateNode\(/, /deleteNode\(/],
  },
]
