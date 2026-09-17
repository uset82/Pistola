import { type CadBrief, CadBriefSchema } from '../../../packages/core/src/schema/cad-brief'

type CadBriefContext = {
  levelId?: string | null
  nodes?: Array<Record<string, unknown>>
}

type CylinderDimensions = {
  radius: number
  height: number
}

type PlateDimensions =
  | { kind: 'rectangular'; width: number; depth: number; thickness: number }
  | { kind: 'round'; radius: number; thickness: number }

const CAD_PROMPT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcubos?\b/gi, 'cube'],
  [/\bcajas?\b/gi, 'box'],
  [/\bsillas?\b/gi, 'chair'],
  [/\bplacas?\b/gi, 'plate'],
  [/\bsoportes?\b/gi, 'bracket'],
  [/\borejas?\b/gi, 'ears'],
  [/\bsuperficie\b/gi, 'surface'],
  [/\bconvi[ée]rtelo\b|\bconvertirlo\b|\bconvertilo\b/gi, 'convert it'],
  [/\bponle\b|\bdale\b|\bagrega\b|\bañade\b/gi, 'add'],
]

export const normalizeCadPrompt = (prompt: string) =>
  CAD_PROMPT_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    prompt
      .trim()
      .toLowerCase()
      .replaceAll('×', 'x')
      .replaceAll(' by ', ' x ')
      .replaceAll(' por ', ' x ')
      .replace(/(\d+),(\d+)/g, '$1.$2')
      .replace(/\bmedio\s+metros?\b/g, '0.5 m')
      .replace(/\bmedia\s+metros?\b/g, '0.5 m')
      .replaceAll(' metres', ' m')
      .replaceAll(' meters', ' m')
      .replaceAll(' metre', ' m')
      .replaceAll(' meter', ' m')
      .replace(/\bmetros\b/g, ' m')
      .replace(/\bmetro\b/g, ' m')
      .replace(/\s+/g, ' '),
  )

export const parseMetricDimensions = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)

  const match = normalizedPrompt.match(
    /(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?/,
  )

  if (!match) return null

  return match.slice(1, 4).map((value) => Number(value)) as [number, number, number]
}

const parseAgeYears = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  const match = normalizedPrompt.match(/(\d{1,2})\s*(?:years?\s*old|year-old|yo\b)/)
  if (!match) return null

  const age = Number(match[1])
  return Number.isFinite(age) ? age : null
}

const isChildSizedPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  const age = parseAgeYears(prompt)

  return (
    normalizedPrompt.includes('kid') ||
    normalizedPrompt.includes('child') ||
    normalizedPrompt.includes('children') ||
    normalizedPrompt.includes('toddler') ||
    (age !== null && age <= 12)
  )
}

export const isSimpleBoxPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  return (
    parseMetricDimensions(prompt) !== null &&
    (normalizedPrompt.includes('box') ||
      normalizedPrompt.includes('cube') ||
      normalizedPrompt.includes('rectangular prism'))
  )
}

const isBoxFamilyPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  return (
    normalizedPrompt.includes('box') ||
    normalizedPrompt.includes('cube') ||
    normalizedPrompt.includes('rectangular prism')
  )
}

const isCylinderFamilyPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  return normalizedPrompt.includes('cylinder')
}

const isPlateFamilyPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  return normalizedPrompt.includes('plate')
}

const isBracketFamilyPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  return normalizedPrompt.includes('bracket')
}

const isSimpleBracketPrompt = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  if (!isBracketFamilyPrompt(prompt)) return false

  return ![
    'hole',
    'holes',
    'slot',
    'slots',
    'thread',
    'threads',
    'pattern',
    'perforated',
    'hinge',
    'gusset',
  ].some((token) => normalizedPrompt.includes(token))
}

const parseScalarMeasurement = (prompt: string, labels: string[]) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  for (const label of labels) {
    const match = normalizedPrompt.match(
      new RegExp(`(\\d+(?:\\.\\d+)?)\\s*m?\\s*(?:${label})\\b`, 'i'),
    )
    const value = Number(match?.[1])
    if (Number.isFinite(value) && value > 0) return value
  }

  return null
}

const parseCylinderDimensions = (prompt: string): CylinderDimensions | null => {
  if (!isCylinderFamilyPrompt(prompt)) return null

  const normalizedPrompt = normalizeCadPrompt(prompt)
  const radius =
    parseScalarMeasurement(prompt, ['radius']) ??
    (() => {
      const diameter = parseScalarMeasurement(prompt, ['diameter', 'dia'])
      return diameter ? diameter / 2 : null
    })()

  const height =
    parseScalarMeasurement(prompt, ['height', 'tall', 'high', 'long']) ??
    (() => {
      const match = normalizedPrompt.match(
        /(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?/,
      )
      if (!match) return null
      const diameter = Number(match[1])
      const matchedHeight = Number(match[2])
      if (!Number.isFinite(diameter) || !Number.isFinite(matchedHeight)) return null
      return matchedHeight
    })()

  if (!(radius && height)) return null
  return { radius, height }
}

const parsePlateDimensions = (prompt: string): PlateDimensions | null => {
  if (!isPlateFamilyPrompt(prompt)) return null

  const normalizedPrompt = normalizeCadPrompt(prompt)
  const thickness =
    parseScalarMeasurement(prompt, ['thickness', 'thick', 'height']) ??
    (() => {
      const match = normalizedPrompt.match(
        /(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m?/,
      )
      if (!match) return null
      return Number(match[3])
    })()

  if (!thickness) return null

  if (normalizedPrompt.includes('round') || normalizedPrompt.includes('circular')) {
    const radius =
      parseScalarMeasurement(prompt, ['radius']) ??
      (() => {
        const diameter = parseScalarMeasurement(prompt, ['diameter', 'dia'])
        return diameter ? diameter / 2 : null
      })()

    if (!radius) return null
    return { kind: 'round', radius, thickness }
  }

  const dimensions = parseMetricDimensions(prompt)
  if (!dimensions) return null
  return {
    kind: 'rectangular',
    width: dimensions[0],
    depth: dimensions[1],
    thickness: dimensions[2],
  }
}

const canUseDeterministicChairBrief = (prompt: string) => {
  const normalizedPrompt = normalizeCadPrompt(prompt)
  if (!normalizedPrompt.includes('chair')) return false

  return ![
    'office',
    'gaming',
    'rocking',
    'wheelchair',
    'swivel',
    'recliner',
    'bean bag',
    'beanbag',
    'folding',
    'armrest',
    'arms',
  ].some((token) => normalizedPrompt.includes(token))
}

type ChairDimensions = {
  seatWidth: number
  seatDepth: number
  seatThickness: number
  seatHeight: number
  backrestHeight: number
  backrestThickness: number
  legThickness: number
}

const getChairDimensions = (prompt: string): ChairDimensions => {
  const age = parseAgeYears(prompt)

  if (isChildSizedPrompt(prompt)) {
    if (age !== null && age <= 6) {
      return {
        seatWidth: 0.3,
        seatDepth: 0.28,
        seatThickness: 0.03,
        seatHeight: 0.3,
        backrestHeight: 0.24,
        backrestThickness: 0.03,
        legThickness: 0.03,
      }
    }

    return {
      seatWidth: 0.34,
      seatDepth: 0.32,
      seatThickness: 0.03,
      seatHeight: 0.34,
      backrestHeight: 0.28,
      backrestThickness: 0.03,
      legThickness: 0.035,
    }
  }

  return {
    seatWidth: 0.42,
    seatDepth: 0.42,
    seatThickness: 0.035,
    seatHeight: 0.45,
    backrestHeight: 0.4,
    backrestThickness: 0.035,
    legThickness: 0.04,
  }
}

const createRectangleEntity = (
  centerX: number,
  centerY: number,
  width: number,
  depth: number,
) => ({
  type: 'rectangle' as const,
  points: [
    [centerX - width / 2, centerY - depth / 2],
    [centerX + width / 2, centerY + depth / 2],
  ] as [[number, number], [number, number]],
  params: {},
})

const buildDeterministicChairBrief = (
  prompt: string,
  context: CadBriefContext,
): CadBrief => {
  const plane = context?.levelId ? 'level' : 'XY'
  const {
    seatWidth,
    seatDepth,
    seatThickness,
    seatHeight,
    backrestHeight,
    backrestThickness,
    legThickness,
  } = getChairDimensions(prompt)

  const overallHeight = seatHeight + seatThickness + backrestHeight
  const rearZ = -seatDepth / 2 + backrestThickness / 2
  const legOffsetX = seatWidth / 2 - legThickness / 2
  const legOffsetZ = seatDepth / 2 - legThickness / 2

  return CadBriefSchema.parse({
    intent: prompt,
    sketchPlans: [
      {
        plane,
        entities: [createRectangleEntity(0, 0, seatWidth, seatDepth)],
        dimensions: [
          { kind: 'distance', value: seatWidth, label: 'seat width' },
          { kind: 'distance', value: seatDepth, label: 'seat depth' },
        ],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(0, rearZ, seatWidth, backrestThickness)],
        dimensions: [
          { kind: 'distance', value: seatWidth, label: 'backrest width' },
          { kind: 'distance', value: backrestThickness, label: 'backrest thickness' },
        ],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(-legOffsetX, -legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(legOffsetX, -legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(-legOffsetX, legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
      {
        plane,
        entities: [createRectangleEntity(legOffsetX, legOffsetZ, legThickness, legThickness)],
        dimensions: [],
        constraints: [],
      },
    ],
    operationGraph: [
      {
        id: 'op_chair_seat',
        op: 'extrude',
        params: {
          sketchIndex: 0,
          distance: seatThickness,
          baseElevation: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_backrest',
        op: 'extrude',
        params: {
          sketchIndex: 1,
          distance: backrestHeight,
          baseElevation: seatHeight + seatThickness,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_fl',
        op: 'extrude',
        params: {
          sketchIndex: 2,
          distance: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_fr',
        op: 'extrude',
        params: {
          sketchIndex: 3,
          distance: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_rl',
        op: 'extrude',
        params: {
          sketchIndex: 4,
          distance: seatHeight,
        },
        dependsOn: [],
      },
      {
        id: 'op_chair_leg_rr',
        op: 'extrude',
        params: {
          sketchIndex: 5,
          distance: seatHeight,
        },
        dependsOn: [],
      },
    ],
    assumptions: [
      `Used a deterministic ${isChildSizedPrompt(prompt) ? 'child-sized' : 'standard'} chair preset in meters.`,
      `Seat footprint assumed ${seatWidth.toFixed(2)} m x ${seatDepth.toFixed(2)} m.`,
      `Seat height assumed ${seatHeight.toFixed(2)} m above the floor.`,
      `Backrest height assumed ${backrestHeight.toFixed(2)} m above the seat.`,
      `Leg thickness assumed ${legThickness.toFixed(3)} m.`,
      `Overall chair height is ${overallHeight.toFixed(2)} m.`,
    ],
    ambiguities: [],
  })
}

export const buildDeterministicCadBrief = (
  prompt: string,
  context: CadBriefContext,
) => {
  if (canUseDeterministicChairBrief(prompt)) {
    return buildDeterministicChairBrief(prompt, context)
  }

  const cylinder = parseCylinderDimensions(prompt)
  if (cylinder) {
    const plane = context?.levelId ? 'level' : 'XY'

    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [
        {
          plane,
          entities: [
            {
              type: 'circle',
              points: [
                [0, 0],
                [cylinder.radius, 0],
              ],
              params: {},
            },
          ],
          dimensions: [
            { kind: 'distance', value: cylinder.radius * 2, label: 'diameter' },
          ],
          constraints: [],
        },
      ],
      operationGraph: [
        {
          id: 'op_cylinder_extrude_1',
          op: 'extrude',
          params: {
            sketchIndex: 0,
            distance: cylinder.height,
            direction: [0, 1, 0],
            symmetric: false,
          },
          dependsOn: [],
        },
      ],
      assumptions: [
        `Interpreted the prompt as a cylinder with ${Number((cylinder.radius * 2).toFixed(3))} m diameter.`,
        `Extruded the circular profile ${cylinder.height} m upward on the ${plane} workplane.`,
      ],
      ambiguities: [],
    })
  }

  const plate = parsePlateDimensions(prompt)
  if (plate) {
    const plane = context?.levelId ? 'level' : 'XY'

    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [
        {
          plane,
          entities:
            plate.kind === 'round'
              ? [
                  {
                    type: 'circle',
                    points: [
                      [0, 0],
                      [plate.radius, 0],
                    ],
                    params: {},
                  },
                ]
              : [
                  {
                    type: 'rectangle',
                    points: [
                      [-plate.width / 2, -plate.depth / 2],
                      [plate.width / 2, plate.depth / 2],
                    ],
                    params: {},
                  },
                ],
          dimensions:
            plate.kind === 'round'
              ? [{ kind: 'distance', value: plate.radius * 2, label: 'diameter' }]
              : [
                  { kind: 'distance', value: plate.width, label: 'width' },
                  { kind: 'distance', value: plate.depth, label: 'depth' },
                ],
          constraints: [],
        },
      ],
      operationGraph: [
        {
          id: 'op_plate_extrude_1',
          op: 'extrude',
          params: {
            sketchIndex: 0,
            distance: plate.thickness,
            direction: [0, 1, 0],
            symmetric: false,
          },
          dependsOn: [],
        },
      ],
      assumptions: [
        plate.kind === 'round'
          ? `Interpreted the prompt as a round plate with ${Number((plate.radius * 2).toFixed(3))} m diameter.`
          : `Interpreted the prompt as a rectangular plate with a ${plate.width} m by ${plate.depth} m footprint.`,
        `Extruded the plate ${plate.thickness} m upward on the ${plane} workplane.`,
      ],
      ambiguities: [],
    })
  }

  return null
}

export const shouldUseDeterministicCadFallback = (prompt: string) =>
  canUseDeterministicChairBrief(prompt) ||
  isBoxFamilyPrompt(prompt) ||
  isCylinderFamilyPrompt(prompt) ||
  isPlateFamilyPrompt(prompt) ||
  isBracketFamilyPrompt(prompt)

export const buildFallbackCadBrief = (
  prompt: string,
  context: CadBriefContext,
): CadBrief => {
  const deterministicBrief = buildDeterministicCadBrief(prompt, context)
  if (deterministicBrief) return deterministicBrief

  const normalizedPrompt = normalizeCadPrompt(prompt)
  const plane = context?.levelId ? 'level' : 'XY'
  const boxDimensions = parseMetricDimensions(prompt)

  if (
    boxDimensions &&
    isBoxFamilyPrompt(prompt)
  ) {
    const [width, depth, height] = boxDimensions

    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [
        {
          plane,
          entities: [
            {
              type: 'rectangle',
              points: [
                [-width / 2, -depth / 2],
                [width / 2, depth / 2],
              ],
              params: {},
            },
          ],
          dimensions: [
            { kind: 'distance', value: width, label: 'width' },
            { kind: 'distance', value: depth, label: 'depth' },
          ],
          constraints: [],
        },
      ],
      operationGraph: [
        {
          id: 'op_box_extrude_1',
          op: 'extrude',
          params: {
            sketchIndex: 0,
            distance: height,
            direction: [0, 1, 0],
            symmetric: false,
          },
          dependsOn: [],
        },
      ],
      assumptions: [
        `Interpreted the prompt as a rectangular box with a ${width} m by ${depth} m footprint.`,
        `Extruded the footprint ${height} m upward on the ${plane} workplane.`,
      ],
      ambiguities: [],
    })
  }

  if (isBoxFamilyPrompt(prompt)) {
    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [],
      operationGraph: [],
      assumptions: ['No geometry was created because the box dimensions are underspecified.'],
      ambiguities: [
        'Provide width, depth, and height in meters, for example 1 m x 2 m x 0.5 m.',
      ],
    })
  }

  if (isBracketFamilyPrompt(prompt)) {
    const holeAwareAmbiguities = [
      'Specify whether the bracket is L-shaped, U-shaped, flat, or another profile.',
      'Provide overall width, height, thickness, and the mounting leg depth if applicable.',
      /\b(hole|holes|slot|slots|pattern|perforated)\b/.test(normalizedPrompt)
        ? 'Provide the hole or slot diameters plus their spacing or edge offsets.'
        : 'Provide any hole pattern requirements if the bracket needs mounting holes.',
    ]

    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [],
      operationGraph: [],
      assumptions: ['No geometry was created because the bracket shape is underspecified.'],
      ambiguities: holeAwareAmbiguities,
    })
  }

  if (isCylinderFamilyPrompt(prompt)) {
    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [],
      operationGraph: [],
      assumptions: ['No geometry was created because the cylinder dimensions are underspecified.'],
      ambiguities: [
        'Provide the cylinder diameter or radius.',
        'Provide the cylinder height.',
      ],
    })
  }

  if (isPlateFamilyPrompt(prompt)) {
    return CadBriefSchema.parse({
      intent: prompt,
      sketchPlans: [],
      operationGraph: [],
      assumptions: ['No geometry was created because the plate dimensions are underspecified.'],
      ambiguities: [
        'Provide the plate footprint dimensions or diameter.',
        'Provide the plate thickness.',
      ],
    })
  }

  return CadBriefSchema.parse({
    intent: prompt,
    sketchPlans: [],
    operationGraph: [],
    assumptions: [
      'No geometry was created because the request could not be mapped to a deterministic CAD brief.',
    ],
    ambiguities: [
      'Provide the intended base profile and the key dimensions needed to build the part.',
    ],
  })
}
