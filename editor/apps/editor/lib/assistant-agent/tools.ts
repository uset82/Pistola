import { getAllCapabilities } from '../../../../packages/editor/src/lib/assistant/capabilities/registry'

export type FunctionToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export const AGENT_TOOL_DEFINITIONS: FunctionToolDefinition[] = [
  {
    name: 'inspect_scene',
    description:
      'Query and filter nodes in the current 3D scene (walls, slabs, zones, items, levels, buildings, cad-bodies, cad-sketches). Returns summarized geometry, names, ids, and relationships.',
    parameters: {
      type: 'object',
      properties: {
        levelId: {
          type: 'string',
          description: 'Optional level ID to restrict the search to nodes on that level.',
        },
        type: {
          type: 'string',
          description:
            'Optional node type to filter by (e.g. "wall", "item", "zone", "slab", "cad-body", "cad-sketch", "door", "window").',
        },
        nameQuery: {
          type: 'string',
          description: 'Optional substring to match against node name or ID.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of nodes to return (default 25, max 100).',
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination (default 0).',
        },
      },
    },
  },
  {
    name: 'get_nodes',
    description: 'Retrieve full details and properties for specific node IDs.',
    parameters: {
      type: 'object',
      required: ['nodeIds'],
      properties: {
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of exact node IDs to look up.',
        },
      },
    },
  },
  {
    name: 'measure',
    description:
      'Perform spatial measurements in the scene: distance between 3D points or nodes, bounding boxes, wall lengths, zone floor areas (m²), or remaining free floor space in a room.',
    parameters: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: {
          type: 'string',
          enum: ['distance', 'bounds', 'wall_length', 'zone_area', 'free_floor_space'],
          description:
            'Measurement type: "distance" (3D distance between pointA/pointB or two nodes), "bounds" (bounding box of nodeIds), "wall_length" (wall lengths), "zone_area" (m² area of zones/slabs), "free_floor_space" (free vs occupied floor area in a zone).',
        },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node IDs to measure (for bounds, wall_length, zone_area, free_floor_space, or distance between two nodes).',
        },
        pointA: {
          type: 'array',
          items: { type: 'number' },
          description: '[x, y, z] start point for distance measurement.',
        },
        pointB: {
          type: 'array',
          items: { type: 'number' },
          description: '[x, y, z] end point for distance measurement.',
        },
      },
    },
  },
  {
    name: 'search_catalog',
    description: 'Search the 3D furniture and architectural item catalog by keyword or category.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Keyword to search (e.g. "sofa", "table", "chair", "bed", "refrigerator", "sink").',
        },
        category: {
          type: 'string',
          enum: ['furniture', 'appliance', 'bathroom', 'kitchen', 'outdoor', 'window', 'door'],
          description: 'Optional category filter.',
        },
        limit: {
          type: 'number',
          description: 'Max items to return (default 20).',
        },
      },
    },
  },
  {
    name: 'list_capabilities',
    description: 'List available Pistola action capabilities, their parameters, and descriptions.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['workspace', 'viewer', 'structure', 'furnish', 'transform', 'cad', 'history/export'],
          description: 'Optional capability domain to filter by.',
        },
      },
    },
  },
  {
    name: 'get_workspace_state',
    description: 'Get the active editor state: current phase, mode, selection, active level, active building, workplane.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'validate_actions',
    description: 'Dry-run validate a list of actions before executing them, checking for errors, schema validity, and target existence.',
    parameters: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          items: { type: 'object' },
          description: 'List of assistant actions to validate (max 25).',
        },
      },
    },
  },
  {
    name: 'execute_actions',
    description:
      'Execute a batch of up to 25 mutating actions in the 3D editor (create walls, zones, place items, CAD operations, transforms). Returns created node IDs.',
    parameters: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          items: { type: 'object' },
          description: 'List of actions to execute immediately in the scene.',
        },
        reviewConfirmed: {
          type: 'boolean',
          description: 'Set to true if destructive or reviewed actions have been approved.',
        },
      },
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question when their request is ambiguous or missing critical design requirements.',
    parameters: {
      type: 'object',
      required: ['question'],
      properties: {
        question: {
          type: 'string',
          description: 'Clear, concise question to ask the user.',
        },
      },
    },
  },
  {
    name: 'finish',
    description:
      'Declare completion of the user request. Provide a user-facing summary reply explaining what was created or modified, along with any assumptions made.',
    parameters: {
      type: 'object',
      required: ['reply'],
      properties: {
        reply: {
          type: 'string',
          description: 'Helpful and concise response explaining the outcome to the user.',
        },
        assumptions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Design assumptions made during the build (dimensions, materials, placement).',
        },
      },
    },
  },
]

export function getOpenAiToolDefinitions() {
  return AGENT_TOOL_DEFINITIONS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function getGeminiFunctionDeclarations() {
  return AGENT_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
}
