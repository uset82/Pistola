import assert from 'node:assert/strict'
import test from 'node:test'

import { CadBodyNodeSchema } from '@pascal-app/core'

import { capabilityMap } from './capabilities/registry'
import {
  AssistantActionSchema,
  AssistantMaterialCardSchema,
  assistantActionTypeValues,
  assistantDestructiveActionTypes,
  isSafeImmediateAssistantActionType,
} from './types'

const CARD = {
  schema_version: 1 as const,
  designation: 'Synthetic orthotropic example — not design data',
  family: 'metal' as const,
  sources: [{ id: 'example', title: 'Synthetic example', kind: 'illustrative' as const }],
  properties: [
    {
      data: {
        kind: 'elasticity',
        model: {
          symmetry: 'orthotropic',
          axes: 'material123',
          young_moduli_pa: [200e9, 100e9, 50e9],
          shear_moduli_pa: [76e9, 38e9, 19e9],
          poisson_ratios: [0.3, 0.25, 0.2],
        },
      },
      source_id: 'example',
    },
  ],
}

test('assign_cad_material is a registered action type', () => {
  assert.ok(
    (assistantActionTypeValues as readonly string[]).includes('assign_cad_material'),
  )
})

test('a material assignment changes body state, so it is not safe-immediate', () => {
  assert.equal(isSafeImmediateAssistantActionType('assign_cad_material'), false)
  assert.ok(
    !(assistantDestructiveActionTypes as readonly string[]).includes('assign_cad_material'),
  )
})

test('assign_cad_material has a cad-domain capability', () => {
  const capability = capabilityMap.get('assign_cad_material')

  assert.ok(capability, 'assign_cad_material must be in the capability registry')
  assert.equal(capability.domain, 'cad')
  assert.equal(capability.safeImmediate, false)
  assert.ok(capability.describe.length > 5)
})

test('the action takes a material name and an optional card and direction', () => {
  const action = AssistantActionSchema.parse({
    type: 'assign_cad_material',
    bodyId: 'cbody_1',
    material: 'Steel',
    card: CARD,
    direction: [1, 0, 0],
  })

  assert.equal(action.type, 'assign_cad_material')
  assert.equal('material' in action ? action.material : undefined, 'Steel')
  assert.deepEqual('direction' in action ? action.direction : undefined, [1, 0, 0])
})

test('the action requires a non-empty material name', () => {
  assert.throws(() =>
    AssistantActionSchema.parse({ type: 'assign_cad_material', material: '' }),
  )
})

test('a zero direction is rejected before it reaches the helper', () => {
  assert.throws(() =>
    AssistantActionSchema.parse({
      type: 'assign_cad_material',
      material: 'Steel',
      direction: [0, 0, 0],
    }),
  )
})

test('the card validator enforces the schema-1 envelope', () => {
  assert.equal(AssistantMaterialCardSchema.parse(CARD).schema_version, 1)

  assert.throws(() =>
    AssistantMaterialCardSchema.parse({ ...CARD, schema_version: 2 }),
  )
  assert.throws(() => AssistantMaterialCardSchema.parse({ ...CARD, family: 'ceramic' }))
  assert.throws(() => AssistantMaterialCardSchema.parse({ ...CARD, properties: [] }))
  assert.throws(() =>
    AssistantMaterialCardSchema.parse({
      ...CARD,
      properties: [{ data: { kind: 'not_a_property' }, source_id: 'example' }],
    }),
  )
})

test('unknown card fields survive so a newer schema is not truncated', () => {
  const parsed = AssistantMaterialCardSchema.parse({
    ...CARD,
    future_field: { note: 'kept' },
  })

  assert.deepEqual((parsed as Record<string, unknown>).future_field, { note: 'kept' })
})

test('a CAD body carries a material field that defaults to null', () => {
  const body = CadBodyNodeSchema.parse({ name: 'Body', parentId: null })

  assert.equal(
    (body as Record<string, unknown>).material,
    null,
    'older scenes must parse unchanged',
  )
})

test('a CAD body material keeps the name and the engineering card', () => {
  const body = CadBodyNodeSchema.parse({
    name: 'Body',
    parentId: null,
    material: { name: 'Steel', card: CARD },
  })

  const material = (body as { material: { name: string; card: unknown } }).material
  assert.equal(material.name, 'Steel')
  assert.deepEqual(material.card, CARD)
})
