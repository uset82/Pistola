import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { useReferencePackStore } from '../reference-pack'
import { createPistolaAgentApi } from './index'

const referenceViews = [
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'left-45',
  'right-45',
] as const

const digest = (digit: string) => digit.repeat(64)

const validReferencePack = () => ({
  concept: {
    source: 'ide-native' as const,
    assetRef: 'pistola://assets/approved-concept',
    sha256: digest('a'),
    dimensions: { width: 1024, height: 1024 },
    approved: true,
  },
  scaleAnchor: { label: 'Hull length', meters: 2.4 },
  assets: referenceViews.map((view, index) => ({
    view,
    source: index % 2 === 0 ? ('ide-native' as const) : ('user-upload' as const),
    assetRef: `pistola://assets/boat-${view}`,
    sha256: digest(index.toString(16)),
    dimensions: { width: 1024, height: 1024 },
    projection:
      view === 'left-45' || view === 'right-45'
        ? ('perspective' as const)
        : ('orthographic' as const),
  })),
})

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useReferencePackStore.getState().clearPack()
}

afterEach(reset)

test('referencePack preserves an approved eight-view metadata pack and rejects an unapproved concept', async () => {
  reset()
  const api = createPistolaAgentApi()
  const rejected = await api.referencePack.set({
    ...validReferencePack(),
    concept: { ...validReferencePack().concept, approved: false },
  })
  assert.equal(rejected.valid, false)
  assert.equal(rejected.stored, false)
  assert.equal(await api.referencePack.get(), null)

  const pack = validReferencePack()
  const stored = await api.invoke('referencePack.set', pack)
  assert.equal((stored as { valid: boolean }).valid, true)
  assert.equal((stored as { stored: boolean }).stored, true)
  assert.equal((stored as { data: { version: number } }).data.version, 1)
  const current = await api.referencePack.get()
  assert.equal(current?.assets.length, 8)
  assert.equal(current?.assets.find((asset) => asset.view === 'top')?.projection, 'orthographic')
  assert.equal((await api.referencePack.clear()).cleared, true)
  assert.equal(await api.referencePack.get(), null)
})

test('renderEightViews produces the fixed eight-view review without moving the active camera', async () => {
  reset()
  const api = createPistolaAgentApi()
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.ok(levelId)
  await api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name: 'Review box',
      levelId,
      placement: 'explicit',
      position: [0, 0, 0],
      scale: [2, 1, 1],
    },
  ])

  const review = await api.renderEightViews()
  assert.equal(review.mime, 'image/svg+xml')
  assert.equal(review.partCount, 1)
  assert.equal(review.columns, 4)
  assert.equal(review.rows, 2)
  assert.deepEqual(
    review.views.map((view) => view.id),
    ['top', 'left-45', 'front', 'right-45', 'left', 'right', 'back', 'bottom'],
  )
  assert.match(review.svg, /Top View/)
  assert.match(review.svg, /Bottom View/)
})
