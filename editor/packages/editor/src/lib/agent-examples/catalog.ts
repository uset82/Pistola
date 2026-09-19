import { CREATION_RECIPES } from '../assistant/recipes/creation-recipes'
import type { AssistantAction } from '../assistant/types'
import type { BlueprintV2 } from '../blueprint'
import { MANUAL_OP_EXAMPLES } from '../cad/manual-examples'
import { place } from './helpers'
import type { AgentExample, ResolvedExampleParams } from './types'

const part = (
  id: string,
  name: string,
  dims: [number, number, number],
  position: [number, number, number],
  technique: BlueprintV2['parts'][number]['technique'] = 'primitive',
) => ({
  id,
  name,
  role: id,
  technique,
  dims_m: dims,
  position_m: position,
  parent: null as string | null,
})

const primitiveTechnique = (
  op: string,
  assetId: string,
  scale: [number, number, number],
): AgentExample => ({
  id: `technique-${op}`,
  title: `Technique: ${op}`,
  kind: 'technique',
  keywords: [op, 'primitive', 'technique', 'canonical frame'],
  technique: op,
  partIds: [op],
  defaults: {},
  actions: ({ color }) => [
    place(op, assetId, [0, 0, 0], scale, { color: color ?? '#60a5fa', refId: `$ref_${op}` }),
  ],
  blueprint: () => ({
    title: op,
    overall_m: scale,
    parts: [part(op, op, scale, [0, 0, 0])],
  }),
})

const OPEN_CAD_OPS = new Set(['cylinder', 'sphere', 'union', 'difference', 'intersection', 'intersect_profiles'])

const cadTechniqueExamples: AgentExample[] = Object.entries(MANUAL_OP_EXAMPLES)
  .filter(([op]) => !OPEN_CAD_OPS.has(op))
  .map(([op, spec]) => ({
    id: `technique-${op}`,
    title: `Technique: ${op}`,
    kind: 'technique',
    keywords: [op, 'cad', 'solid', 'technique', 'canonical frame'],
    technique: op,
    partIds: [op],
    defaults: {},
    actions: () => [
      {
        type: 'build_cad_solid',
        name: op,
        partId: op,
        role: op,
        position: [0, 0, 0],
        color: '#60a5fa',
        spec,
        refId: `$ref_${op.replace(/[^A-Za-z0-9_]/g, '_')}`,
      } as AssistantAction,
    ],
    blueprint: () => ({
      title: op,
      overall_m: [1, 1, 1],
      parts: [part(op, op, [1, 1, 1], [0, 0, 0], 'cad-brief')],
    }),
  }))

const booleanPair = (op: string, a: [number, number, number], bPos: [number, number, number], b: [number, number, number]): AgentExample => ({
  id: `technique-${op}`,
  title: `Technique: ${op}`,
  kind: 'technique',
  keywords: [op, 'cad', 'boolean', 'technique', 'canonical frame'],
  technique: op,
  partIds: [`${op}-a`, `${op}-b`],
  defaults: {},
  actions: ({ color }) => [
    place(`${op}-a`, 'primitive-box', [0, 0, 0], a, { color: color ?? '#60a5fa', refId: `$ref_${op}_a` }),
    place(`${op}-b`, 'primitive-box', bPos, b, { color: color ?? '#93c5fd', refId: `$ref_${op}_b` }),
  ],
  blueprint: () => ({
    title: op,
    overall_m: a,
    parts: [part(`${op}-a`, `${op}-a`, a, [0, 0, 0], 'cad-brief')],
  }),
})

const techniqueExamples: AgentExample[] = [
  ...cadTechniqueExamples,
  primitiveTechnique('cylinder', 'primitive-cylinder', [0.4, 0.5, 0.4]),
  primitiveTechnique('sphere', 'primitive-sphere', [0.6, 0.6, 0.6]),
  booleanPair('union', [0.8, 0.2, 0.4], [0, 0.2, 0], [0.2, 0.4, 0.2]),
  booleanPair('difference', [1, 0.3, 1], [0, 0.3, 0], [0.3, 0.08, 0.3]),
  booleanPair('intersection', [0.8, 0.4, 0.8], [0.25, 0, 0], [0.5, 0.4, 0.5]),
  booleanPair('intersect_profiles', [1.6, 0.3, 0.5], [0, 0.3, 0], [0.5, 0.08, 0.5]),
]

const subassemblies: AgentExample[] = [
  {
    id: 'leg-set',
    title: 'Leg set',
    kind: 'subassembly',
    keywords: ['legs', 'table', 'furniture', 'four legs'],
    partIds: ['leg-fl', 'leg-fr', 'leg-rl', 'leg-rr'],
    defaults: { width: 1.2, depth: 0.8, height: 0.7 },
    actions: ({ width, depth, height, color }) => {
      const hx = width / 2 - 0.06
      const hz = depth / 2 - 0.06
      const s: [number, number, number] = [0.08, height, 0.08]
      return [
        place('Leg FL', 'primitive-cylinder', [-hx, 0, hz], s, { color, refId: '$ref_leg_fl' }),
        place('Leg FR', 'primitive-cylinder', [hx, 0, hz], s, { color, refId: '$ref_leg_fr' }),
        place('Leg RL', 'primitive-cylinder', [-hx, 0, -hz], s, { color, refId: '$ref_leg_rl' }),
        place('Leg RR', 'primitive-cylinder', [hx, 0, -hz], s, { color, refId: '$ref_leg_rr' }),
      ]
    },
    blueprint: ({ width, depth, height }) => ({
      title: 'Leg set',
      overall_m: [width, height, depth],
      parts: ['leg-fl', 'leg-fr', 'leg-rl', 'leg-rr'].map((id) => part(id, id, [0.08, height, 0.08], [0, 0, 0])),
    }),
  },
  {
    id: 'wheel-axle',
    title: 'Wheel and axle',
    kind: 'subassembly',
    keywords: ['wheel', 'axle', 'vehicle', 'cart'],
    partIds: ['wheel-left', 'axle', 'wheel-right'],
    defaults: { width: 0.8, height: 0.32, depth: 0.32 },
    actions: ({ width, height, color }) => {
      const t = 0.06
      return [
        place('Wheel Left', 'primitive-box', [-width / 2, 0, 0], [t, height, height], { color: color ?? '#1f2937', refId: '$ref_wheel_l' }),
        place('Axle', 'primitive-box', [0, 0, 0], [width - t, 0.08, 0.08], { color: color ?? '#9ca3af', refId: '$ref_axle' }),
        place('Wheel Right', 'primitive-box', [width / 2, 0, 0], [t, height, height], { color: color ?? '#1f2937', refId: '$ref_wheel_r' }),
      ]
    },
    blueprint: ({ width, height }) => ({
      title: 'Wheel and axle',
      overall_m: [width, height, height],
      parts: [
        part('wheel-left', 'Wheel Left', [0.06, height, height], [-width / 2, 0, 0]),
        part('axle', 'Axle', [width, 0.06, 0.06], [0, height / 2, 0]),
        part('wheel-right', 'Wheel Right', [0.06, height, height], [width / 2, 0, 0]),
      ],
      relations: [
        { a: 'axle', rel: 'touches', b: 'wheel-left' },
        { a: 'axle', rel: 'touches', b: 'wheel-right' },
      ],
    }),
  },
  {
    id: 'lathe-bottle',
    title: 'Lathe bottle',
    kind: 'subassembly',
    keywords: ['bottle', 'lathe', 'revolve', 'profile'],
    technique: 'revolve',
    partIds: ['bottle'],
    defaults: { height: 0.28 },
    actions: ({ height, color }) => [
      {
        type: 'build_cad_solid',
        name: 'Bottle',
        partId: 'bottle',
        role: 'body',
        position: [0, 0, 0],
        color: color ?? '#38bdf8',
        spec: {
          op: 'revolve',
          profile: [
            [0.02, 0],
            [0.07, 0],
            [0.08, height * 0.15],
            [0.055, height * 0.55],
            [0.03, height * 0.78],
            [0.035, height],
            [0.02, height],
          ],
          angle: 360,
        },
        refId: '$ref_bottle',
      } as AssistantAction,
    ],
    blueprint: ({ height }) => ({
      title: 'Lathe bottle',
      overall_m: [0.16, height, 0.16],
      parts: [part('bottle', 'Bottle', [0.16, height, 0.16], [0, 0, 0], 'revolve')],
    }),
  },
  {
    id: 'lathe-shade',
    title: 'Lathe shade',
    kind: 'subassembly',
    keywords: ['shade', 'lamp', 'lathe', 'revolve'],
    technique: 'revolve',
    partIds: ['shade'],
    defaults: { height: 0.18, width: 0.28 },
    actions: ({ height, width, color }) => [
      {
        type: 'build_cad_solid',
        name: 'Shade',
        partId: 'shade',
        role: 'shade',
        position: [0, 0, 0],
        color: color ?? '#fde68a',
        spec: {
          op: 'revolve',
          profile: [
            [0.03, 0],
            [width / 2, 0],
            [width / 2 - 0.02, height * 0.35],
            [0.06, height],
            [0.03, height],
          ],
          angle: 360,
        },
        refId: '$ref_shade',
      } as AssistantAction,
    ],
    blueprint: ({ width, height }) => ({
      title: 'Lathe shade',
      overall_m: [width, height, width],
      parts: [part('shade', 'Shade', [width, height, width], [0, 0, 0], 'revolve')],
    }),
  },
  {
    id: 'lathe-cup',
    title: 'Lathe cup',
    kind: 'subassembly',
    keywords: ['cup', 'mug', 'lathe', 'revolve'],
    technique: 'revolve',
    partIds: ['cup'],
    defaults: { height: 0.12, width: 0.1 },
    actions: ({ height, width, color }) => [
      {
        type: 'build_cad_solid',
        name: 'Cup',
        partId: 'cup',
        role: 'body',
        position: [0, 0, 0],
        color: color ?? '#f8fafc',
        spec: {
          op: 'revolve',
          profile: [
            [0.015, 0],
            [width / 2, 0],
            [width / 2, height],
            [width / 2 - 0.008, height],
            [width / 2 - 0.01, 0.012],
            [0.015, 0.012],
          ],
          angle: 360,
        },
        refId: '$ref_cup',
      } as AssistantAction,
    ],
    blueprint: ({ width, height }) => ({
      title: 'Lathe cup',
      overall_m: [width, height, width],
      parts: [part('cup', 'Cup', [width, height, width], [0, 0, 0], 'revolve')],
    }),
  },
  {
    id: 'hollow-container',
    title: 'Hollow container',
    kind: 'subassembly',
    keywords: ['box', 'hollow', 'container', 'difference'],
    technique: 'difference',
    partIds: ['container'],
    defaults: { width: 0.4, height: 0.25, depth: 0.4 },
    actions: ({ width, height, depth, color }) => {
      const t = 0.02
      const c = color ?? '#94a3b8'
      return [
        place('Floor', 'primitive-box', [0, 0, 0], [width, t, depth], { color: c, refId: '$ref_container_floor' }),
        place('Wall L', 'primitive-box', [-width / 2 + t / 2, t, 0], [t, height - t, depth], { color: c, refId: '$ref_container_l' }),
        place('Wall R', 'primitive-box', [width / 2 - t / 2, t, 0], [t, height - t, depth], { color: c, refId: '$ref_container_r' }),
        place('Wall F', 'primitive-box', [0, t, depth / 2 - t / 2], [width - 2 * t, height - t, t], { color: c, refId: '$ref_container_f' }),
        place('Wall B', 'primitive-box', [0, t, -depth / 2 + t / 2], [width - 2 * t, height - t, t], { color: c, refId: '$ref_container_b' }),
      ]
    },
    blueprint: ({ width, height, depth }) => ({
      title: 'Hollow container',
      overall_m: [width, height, depth],
      parts: [part('container', 'Container', [width, height, depth], [0, 0, 0], 'cad-brief')],
    }),
  },
  {
    id: 'rail-ladder',
    title: 'Rail and ladder array',
    kind: 'subassembly',
    keywords: ['rail', 'ladder', 'rungs', 'array'],
    partIds: ['post-l', 'post-r', 'rung-0', 'rung-1', 'rung-2', 'rung-3'],
    defaults: { width: 0.4, height: 1.2, count: 4 },
    actions: ({ width, height, count = 4, color }) => {
      const rungs = Math.max(2, Math.min(8, count))
      const post: [number, number, number] = [0.04, height, 0.04]
      const actions = [
        place('Post L', 'primitive-box', [-width / 2, 0, 0], post, { color: color ?? '#92400e', refId: '$ref_post_l' }),
        place('Post R', 'primitive-box', [width / 2, 0, 0], post, { color: color ?? '#92400e', refId: '$ref_post_r' }),
      ]
      for (let i = 0; i < rungs; i += 1) {
        const y = ((i + 1) / (rungs + 1)) * height
        actions.push(
          place(`Rung ${i}`, 'primitive-box', [0, y, 0], [width, 0.03, 0.03], {
            color: color ?? '#b45309',
            refId: `$ref_rung_${i}`,
          }),
        )
      }
      return actions
    },
    blueprint: ({ width, height }) => ({
      title: 'Rail and ladder',
      overall_m: [width, height, 0.04],
      parts: [part('post-l', 'Post L', [0.04, height, 0.04], [-width / 2, 0, 0])],
    }),
  },
  {
    id: 'handle-knob',
    title: 'Handle and knob',
    kind: 'subassembly',
    keywords: ['handle', 'knob', 'grip', 'door'],
    partIds: ['handle', 'knob'],
    defaults: { width: 0.16, height: 0.04, depth: 0.04 },
    actions: ({ width, height, depth, color }) => [
      place('Handle', 'primitive-box', [0, 0, 0], [width, height, depth], { color: color ?? '#d1d5db', refId: '$ref_handle' }),
      place('Knob', 'primitive-sphere', [width / 2, 0, 0], [height * 1.4, height * 1.4, height * 1.4], {
        color: color ?? '#f9fafb',
        refId: '$ref_knob',
      }),
    ],
    blueprint: ({ width, height, depth }) => ({
      title: 'Handle and knob',
      overall_m: [width + height, height * 1.4, depth],
      parts: [
        part('handle', 'Handle', [width, height, depth], [0, 0, 0]),
        part('knob', 'Knob', [height, height, height], [width / 2, 0, 0]),
      ],
      relations: [{ a: 'knob', rel: 'touches', b: 'handle' }],
    }),
  },
  {
    id: 'arm-link',
    title: 'Arm link',
    kind: 'subassembly',
    keywords: ['arm', 'link', 'robot', 'joint'],
    partIds: ['link-a', 'joint', 'link-b'],
    defaults: { width: 0.7, height: 0.08, depth: 0.08 },
    actions: ({ width, height, depth, color }) => {
      const half = (width - height) / 2
      return [
        place('Link A', 'primitive-box', [-half / 2 - height / 2, 0, 0], [half, height, depth], { color: color ?? '#64748b', refId: '$ref_link_a' }),
        place('Joint', 'primitive-cylinder', [0, 0, 0], [height, height, height], { color: color ?? '#334155', refId: '$ref_joint' }),
        place('Link B', 'primitive-box', [half / 2 + height / 2, 0, 0], [half, height, depth], { color: color ?? '#64748b', refId: '$ref_link_b' }),
      ]
    },
    blueprint: ({ width, height, depth }) => ({
      title: 'Arm link',
      overall_m: [width, height, depth],
      parts: [part('joint', 'Joint', [height, height, height], [0, 0, 0])],
    }),
  },
  {
    id: 'tapered-hull',
    title: 'Tapered hull',
    kind: 'subassembly',
    keywords: ['hull', 'boat', 'taper', 'wedge'],
    partIds: ['hull', 'bow'],
    defaults: { width: 0.5, height: 0.2, depth: 1.4 },
    actions: ({ width, height, depth, color }) => [
      place('Hull', 'primitive-box', [0, 0, -depth * 0.1], [width, height, depth * 0.7], { color: color ?? '#b45309', refId: '$ref_hull' }),
      place('Bow', 'primitive-wedge', [0, 0, depth * 0.35], [width, height, depth * 0.3], { color: color ?? '#c2410c', refId: '$ref_bow' }),
    ],
    blueprint: ({ width, height, depth }) => ({
      title: 'Tapered hull',
      overall_m: [width, height, depth],
      parts: [
        part('hull', 'Hull', [width, height, depth * 0.7], [0, 0, 0]),
        part('bow', 'Bow', [width, height, depth * 0.3], [0, 0, depth * 0.35]),
      ],
      relations: [{ a: 'bow', rel: 'touches', b: 'hull' }],
    }),
  },
  {
    id: 'sail-fin',
    title: 'Sail and fin',
    kind: 'subassembly',
    keywords: ['sail', 'fin', 'boat', 'keel'],
    partIds: ['deck', 'sail', 'fin'],
    defaults: { width: 0.2, height: 0.9, depth: 0.7 },
    actions: ({ width, height, depth, color }) => [
      place('Deck', 'primitive-box', [0, 0, 0], [width, 0.06, depth], { color: color ?? '#92400e', refId: '$ref_deck' }),
      place('Sail', 'primitive-wedge', [0, 0.06, 0.05], [0.03, height - 0.06, depth * 0.7], { color: color ?? '#f8fafc', refId: '$ref_sail' }),
      place('Fin', 'primitive-wedge', [0, 0.06, -depth * 0.2], [0.04, 0.16, 0.22], { color: color ?? '#1e293b', refId: '$ref_fin' }),
    ],
    blueprint: ({ width, height, depth }) => ({
      title: 'Sail and fin',
      overall_m: [width, height, depth],
      parts: [part('deck', 'Deck', [width, 0.06, depth], [0, 0, 0])],
    }),
  },
  {
    id: 'quadruped-blockout',
    title: 'Quadruped blockout',
    kind: 'subassembly',
    keywords: ['dog', 'animal', 'quadruped', 'blockout'],
    partIds: ['body', 'head', 'leg-fl', 'leg-fr', 'leg-rl', 'leg-rr'],
    defaults: { width: 0.28, height: 0.42, depth: 0.7 },
    actions: ({ width, height, depth, color }) => {
      const legH = height * 0.45
      const bodyH = height * 0.32
      const hx = width / 2 - 0.04
      const hz = depth / 2 - 0.1
      const c = color ?? '#78716c'
      return [
        place('Body', 'primitive-box', [0, legH, 0], [width, bodyH, depth * 0.7], { color: c, refId: '$ref_body' }),
        place('Head', 'primitive-box', [0, legH + bodyH * 0.15, depth * 0.42], [width * 0.7, bodyH * 0.85, 0.18], { color: c, refId: '$ref_head' }),
        place('Leg FL', 'primitive-cylinder', [-hx, 0, hz], [0.07, legH, 0.07], { color: c, refId: '$ref_leg_fl' }),
        place('Leg FR', 'primitive-cylinder', [hx, 0, hz], [0.07, legH, 0.07], { color: c, refId: '$ref_leg_fr' }),
        place('Leg RL', 'primitive-cylinder', [-hx, 0, -hz], [0.07, legH, 0.07], { color: c, refId: '$ref_leg_rl' }),
        place('Leg RR', 'primitive-cylinder', [hx, 0, -hz], [0.07, legH, 0.07], { color: c, refId: '$ref_leg_rr' }),
      ]
    },
    blueprint: ({ width, height, depth }) => ({
      title: 'Quadruped blockout',
      overall_m: [width, height, depth],
      parts: [part('body', 'Body', [width, height * 0.32, depth * 0.7], [0, height * 0.45, 0])],
    }),
  },
  {
    id: 'cabinet-carcass',
    title: 'Cabinet carcass',
    kind: 'subassembly',
    keywords: ['cabinet', 'carcass', 'shelf', 'furniture'],
    partIds: ['bottom', 'top', 'side-l', 'side-r', 'back'],
    defaults: { width: 0.8, height: 0.9, depth: 0.4 },
    actions: ({ width, height, depth, color }) => {
      const t = 0.02
      const c = color ?? '#d6b48a'
      return [
        place('Bottom', 'primitive-box', [0, 0, 0], [width, t, depth], { color: c, refId: '$ref_bottom' }),
        place('Top', 'primitive-box', [0, height - t, 0], [width, t, depth], { color: c, refId: '$ref_top' }),
        place('Side L', 'primitive-box', [-width / 2 + t / 2, t, 0], [t, height - 2 * t, depth], { color: c, refId: '$ref_side_l' }),
        place('Side R', 'primitive-box', [width / 2 - t / 2, t, 0], [t, height - 2 * t, depth], { color: c, refId: '$ref_side_r' }),
        place('Back', 'primitive-box', [0, t, -depth / 2 + t / 2], [width - 2 * t, height - 2 * t, t], { color: c, refId: '$ref_back' }),
      ]
    },
    blueprint: ({ width, height, depth }) => ({
      title: 'Cabinet carcass',
      overall_m: [width, height, depth],
      parts: [part('bottom', 'Bottom', [width, 0.02, depth], [0, 0, 0])],
    }),
  },
]

const recipeExamples: AgentExample[] = CREATION_RECIPES.map((recipe) => ({
  id: `recipe-${recipe.id}`,
  title: recipe.name,
  kind: 'recipe',
  keywords: recipe.keywords,
  partIds: [recipe.id],
  defaults: {},
  actions: (params) =>
    recipe.generateActions({
      width: params.width,
      height: params.height,
      depth: params.depth,
      color: params.color,
      position: params.at,
    }),
  blueprint: ({ at }) => ({
    title: recipe.name,
    slug: recipe.id,
    overall_m: [1, 1, 1],
    parts: [part(recipe.id, recipe.name, [1, 1, 1], at)],
  }),
}))

const phoneStand: AgentExample = {
  id: 'library-geometric-phone-stand',
  title: 'Geometric blue phone stand',
  kind: 'library',
  keywords: ['phone stand', 'desk accessory', 'geometric', 'A-frame', 'blue'],
  partIds: ['base', 'aframe', 'rail', 'pads'],
  defaults: { width: 0.16, height: 0.12, depth: 0.18 },
  actions: ({ width, height, depth, color }) => {
    const c = color ?? '#2563eb'
    return [
      place('Octagonal base', 'primitive-box', [0, 0, 0], [width, 0.012, depth], { color: c, refId: '$ref_phone_base' }),
      place('A-frame L', 'primitive-box', [-width * 0.22, 0.012, -0.02], [0.02, height, 0.04], { color: c, refId: '$ref_phone_aframe_l' }),
      place('A-frame R', 'primitive-box', [width * 0.22, 0.012, -0.02], [0.02, height, 0.04], { color: c, refId: '$ref_phone_aframe_r' }),
      place('Retention rail', 'primitive-box', [0, 0.012, depth / 2 - 0.02], [width * 0.7, 0.018, 0.018], { color: '#1e40af', refId: '$ref_phone_rail' }),
      place('Contact pads', 'primitive-box', [0, 0.012, 0.03], [width * 0.5, 0.006, 0.04], { color: '#93c5fd', refId: '$ref_phone_pads' }),
    ]
  },
  blueprint: ({ width, height, depth }) => ({
    title: 'Geometric blue phone stand',
    slug: 'geometric-phone-stand',
    overall_m: [width, height + 0.012, depth],
    parts: [
      part('base', 'Octagonal base', [width, 0.012, depth], [0, 0, 0], 'cad-brief'),
      part('aframe', 'Open A-frame', [width * 0.7, height, 0.04], [0, 0.012, -0.02], 'cad-brief'),
    ],
  }),
}

export const AGENT_EXAMPLES: AgentExample[] = [...techniqueExamples, ...subassemblies, ...recipeExamples, phoneStand]

export const exampleById = (id: string) => AGENT_EXAMPLES.find((entry) => entry.id === id)

export type { ResolvedExampleParams }
