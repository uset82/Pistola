import assert from 'node:assert/strict'
import test from 'node:test'
import { findCatalogItem, listAssistantCatalogItems } from './catalog'

test('search catalog lists primitive-* items', () => {
  const items = listAssistantCatalogItems()
  const primitives = items.filter((item) => item.id.startsWith('primitive-'))
  assert.ok(primitives.some((item) => item.id === 'primitive-box'))
  assert.ok(primitives.some((item) => item.id === 'primitive-cylinder'))
  assert.equal(findCatalogItem('primitive-box')?.id, 'primitive-box')
  assert.equal(findCatalogItem('primitive-box')?.color, '#60a5fa')
})
