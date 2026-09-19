import assert from 'node:assert/strict'
import test from 'node:test'
import { airplaneRecipe, relativizeParentedRecipeActions } from './creation-recipes'

test('recipe children parented to a root use parent-relative positions', () => {
  const raw = airplaneRecipe.generateActions({ position: [10, 0, 4] })
  const relative = relativizeParentedRecipeActions(raw)
  const root = relative.find((action) => action.type === 'place_item' && action.refId === '$ref_airplane_root')
  const wing = relative.find((action) => action.type === 'place_item' && action.name === 'Left Wing')
  assert.ok(root && root.type === 'place_item' && root.position)
  assert.ok(wing && wing.type === 'place_item' && wing.position)
  assert.equal(wing.parentId, '$ref_airplane_root')
  assert.equal(wing.position[0], -3.8)
  assert.equal(Number(wing.position[1].toFixed(1)), -0.1)
})
