import assert from 'node:assert/strict'
import test from 'node:test'
import { BuildingNode } from './src/schema/nodes/building'
import { CadBodyNode } from './src/schema/nodes/cad-body'
import { LevelNode } from './src/schema/nodes/level'
import { SiteNode } from './src/schema/nodes/site'
import { ensureProjectWorlds } from './src/lib/worlds'

test('ensureProjectWorlds adds a cad-space root beside the site', () => {
  const level = LevelNode.parse({ level: 0, children: [] })
  const building = BuildingNode.parse({ children: [level.id] })
  const site = SiteNode.parse({ children: [building] })
  const nodes = {
    [site.id]: site,
    [building.id]: building,
    [level.id]: level,
  }

  const worlds = ensureProjectWorlds(nodes, [site.id])

  assert.deepEqual(worlds.rootNodeIds, [site.id, worlds.cadSpaceId])
  assert.equal(worlds.nodes[worlds.cadSpaceId]?.type, 'cad-space')
  assert.equal(worlds.nodes[site.id]?.type, 'site')
  assert.equal(
    Object.values(worlds.nodes).some((node) => node.type === 'cad-instance'),
    false,
  )
})

test('ensureProjectWorlds moves CAD definitions off levels without placing copies', () => {
  const body = CadBodyNode.parse({ name: 'Bracket', parentId: null })
  const level = LevelNode.parse({ level: 0, children: [body.id] })
  const building = BuildingNode.parse({ children: [level.id] })
  const site = SiteNode.parse({ children: [building] })
  const nodes = {
    [site.id]: site,
    [building.id]: building,
    [level.id]: { ...level, parentId: building.id },
    [body.id]: { ...body, parentId: level.id },
  }

  const worlds = ensureProjectWorlds(nodes, [site.id])
  const migratedLevel = worlds.nodes[level.id]
  const migratedBody = worlds.nodes[body.id]
  const cadSpace = worlds.nodes[worlds.cadSpaceId]

  assert.equal(migratedBody?.type, 'cad-body')
  assert.equal(migratedBody?.parentId, worlds.cadSpaceId)
  assert.equal(migratedLevel?.type, 'level')
  if (migratedLevel?.type === 'level') {
    assert.equal(migratedLevel.children.includes(body.id), false)
  }
  assert.equal(cadSpace?.type, 'cad-space')
  if (cadSpace?.type === 'cad-space') {
    assert.equal(cadSpace.children.includes(body.id), true)
  }
  assert.equal(
    Object.values(worlds.nodes).filter((node) => node.type === 'cad-body').length,
    1,
  )
  assert.equal(
    Object.values(worlds.nodes).some((node) => node.type === 'cad-instance'),
    false,
  )
  assert.equal(worlds.nodes[site.id]?.type, 'site')
})
