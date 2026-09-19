import type { CadSolidSpec } from './solid-spec'

export const MANUAL_OP_EXAMPLES: Record<string, CadSolidSpec> = {
  box: { op: 'box', size: [1, 0.4, 0.6] },
  cylinder: { op: 'cylinder', r: 0.2, h: 0.5 },
  sphere: { op: 'sphere', r: 0.3 },
  extrude: {
    op: 'extrude',
    polygon: [
      [-0.2, -0.15],
      [0.2, -0.15],
      [0.2, 0.15],
      [-0.2, 0.15],
    ],
    height: 0.12,
  },
  revolve: {
    op: 'revolve',
    profile: [
      [0.1, 0],
      [0.3, 0],
      [0.3, 0.4],
      [0.1, 0.4],
    ],
    angle: 360,
  },
  union: {
    op: 'union',
    children: [
      { op: 'box', size: [0.8, 0.2, 0.4] },
      { op: 'box', size: [0.2, 0.4, 0.2], translate: [0, 0.2, 0] },
    ],
  },
  difference: {
    op: 'difference',
    children: [
      { op: 'box', size: [1, 0.3, 1] },
      { op: 'cylinder', r: 0.15, h: 0.4, translate: [0, -0.05, 0] },
    ],
  },
  intersection: {
    op: 'intersection',
    children: [
      { op: 'box', size: [0.8, 0.4, 0.8] },
      { op: 'sphere', r: 0.35, translate: [0, 0, 0] },
    ],
  },
  intersect_profiles: {
    op: 'intersect_profiles',
    profileXY: [
      [-0.8, 0],
      [0.8, 0],
      [0.8, 0.3],
      [-0.8, 0.3],
    ],
    profileXZ: [
      [-0.8, -0.25],
      [0.8, -0.25],
      [0.8, 0.25],
      [-0.8, 0.25],
    ],
  },
  mirror: {
    op: 'mirror',
    axis: 'x',
    child: { op: 'box', size: [0.2, 0.2, 0.2], translate: [0.3, 0, 0] },
  },
  linearArray: {
    op: 'linearArray',
    count: 3,
    offset: [0.3, 0, 0],
    child: { op: 'box', size: [0.2, 0.2, 0.2] },
  },
  polarArray: {
    op: 'polarArray',
    count: 4,
    axis: 'y',
    child: { op: 'box', size: [0.15, 0.1, 0.15], translate: [0.35, 0, 0] },
  },
}

export const ASYMMETRIC_L_SPEC: CadSolidSpec = {
  op: 'union',
  children: [
    { op: 'box', size: [2, 0.2, 0.4] },
    { op: 'box', size: [0.4, 0.2, 1.2], translate: [0.8, 0, 0.4] },
  ],
}
