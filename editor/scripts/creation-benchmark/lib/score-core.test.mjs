import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { writeGoldFiles } from '../gold/make.mjs'
import { replayActions } from './replay-actions.mjs'
import { analyzeSupport, orthographicIoU } from './geometry.mjs'
import { scoreScene } from './score-core.mjs'

const goldDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../gold')

test('gold self-replay yields IoU 1.0 and no floating parts', async () => {
  await writeGoldFiles()
  const gold = JSON.parse(await readFile(path.join(goldDir, 'chair.json'), 'utf8'))
  const replayed = replayActions(gold.actions)
  assert.equal(replayed.ok, true)
  const iou = orthographicIoU(
    gold.parts.map((part) => part.box),
    replayed.parts.map((part) => part.box),
  )
  assert.equal(iou.mean, 1)
  assert.equal(analyzeSupport(replayed.parts).floating.length, 0)
  const scored = scoreScene({
    slug: 'chair',
    set: 'dev',
    prompt: { overall_m: [0.48, 0.9, 0.48], parts: ['seat', 'back', 'leg-fl'] },
    goldParts: gold.parts,
    sceneParts: replayed.parts,
  })
  assert.equal(scored.iou.mean, 1)
  assert.equal(scored.partCoverage.ratio, 1)
})

test('parent scale inheritance explodes a child box', () => {
  const replayed = replayActions([
    {
      type: 'place_item',
      name: 'parent',
      refId: '$ref_parent',
      assetId: 'primitive-box',
      position: [0, 0, 0],
      scale: [2, 0.2, 2],
    },
    {
      type: 'place_item',
      name: 'child',
      parentId: '$ref_parent',
      assetId: 'primitive-box',
      position: [0, 1, 0],
      scale: [1, 1, 1],
    },
  ])
  const child = replayed.parts.find((part) => part.name === 'child')
  assert.deepEqual(child.scale, [2, 0.2, 2])
  assert.equal(child.position[1], 0.2)
})
