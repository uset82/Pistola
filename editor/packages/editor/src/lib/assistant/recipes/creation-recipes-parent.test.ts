import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { clearSceneHistory, ensureProjectWorlds, useScene } from '@pascal-app/core'
import { airplaneRecipe, relativizeParentedRecipeActions } from './creation-recipes'

afterEach(() => {
  useScene.getState().clearScene()
  clearSceneHistory()
})

test('recipe children stay parent-relative when no level exists yet', () => {
  useScene.getState().clearScene()
  useScene.setState({ nodes: {}, rootNodeIds: [] })
  const raw = [
    {
      type: 'place_item' as const,
      refId: '$ref_airplane_root',
      placement: 'explicit' as const,
      name: 'Airplane Fuselage',
      assetId: 'primitive-capsule',
      position: [10, 1.2, 4] as [number, number, number],
    },
    {
      type: 'place_item' as const,
      parentId: '$ref_airplane_root',
      placement: 'explicit' as const,
      name: 'Left Wing',
      assetId: 'primitive-box',
      position: [6.2, 1.1, 3.8] as [number, number, number],
    },
  ]
  const relative = relativizeParentedRecipeActions(raw)
  const wing = relative.find((action) => action.type === 'place_item' && action.name === 'Left Wing')
  assert.ok(wing && wing.type === 'place_item' && wing.position)
  assert.equal(wing.parentId, '$ref_airplane_root')
  assert.equal(Number(wing.position[0].toFixed(1)), -3.8)
  assert.equal(Number(wing.position[1].toFixed(1)), -0.1)
})

test('recipe assemblies sit on the floor in world space when a level exists', () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  const worlds = ensureProjectWorlds(useScene.getState().nodes, useScene.getState().rootNodeIds)
  useScene.getState().setScene(worlds.nodes, worlds.rootNodeIds)
  const raw = airplaneRecipe.generateActions({ position: [10, 0, 4] })
  const wing = raw.find((action) => action.type === 'place_item' && action.name === 'Left Wing')
  const engine = raw.find((action) => action.type === 'place_item' && action.name === 'Left Engine')
  assert.ok(wing && wing.type === 'place_item' && wing.position)
  assert.ok(engine && engine.type === 'place_item' && engine.position)
  assert.ok(wing.levelId || wing.parentId, 'each part needs an explicit level or parent')
  assert.ok(Array.isArray(engine.position))
  const floorY = Math.min(
    ...raw
      .flatMap((action) => {
        if (!('position' in action) || !Array.isArray(action.position)) return []
        const y = action.position[1]
        return typeof y === 'number' ? [y] : []
      }),
  )
  assert.ok(floorY > -1e-6)
})
