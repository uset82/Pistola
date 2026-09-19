import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { createPistolaAgentApi } from '../agent-api'
import { useOperatorPlanStore } from '../operator-plan'
import { rasterizeParts } from './soft-raster'
import { collectStructureParts } from '../structure'
import { encodePng } from './png'
import { renderViews } from './render-views'

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useOperatorPlanStore.getState().setPlan(null)
}

afterEach(reset)

test('a known 1 m box fills a square front mask', async () => {
  reset()
  const api = createPistolaAgentApi()
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  await api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name: 'Known box',
      levelId,
      placement: 'explicit',
      position: [0, 0, 0],
      scale: [1, 1, 1],
    },
  ])
  const parts = collectStructureParts()
  const front = rasterizeParts(parts, 'front', 64)
  let minX = 64
  let maxX = 0
  let minY = 64
  let maxY = 0
  let count = 0
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (!front.mask[y * 64 + x]) continue
      count += 1
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  assert.ok(count > 200, `expected a filled box, got ${count} pixels`)
  const aspect = (maxX - minX + 1) / (maxY - minY + 1)
  assert.ok(aspect > 0.8 && aspect < 1.25, `front mask aspect ${aspect}`)
  const png = encodePng(front.width, front.height, front.rgba)
  assert.equal(png[0], 137)
  assert.equal(png[1], 80)
  const sheet = renderViews({ planned: [1, 1, 1] })
  assert.equal(sheet.mime, 'image/png')
  assert.ok(sheet.dataUrl.startsWith('data:image/png;base64,'))
  assert.equal(sheet.critique.recognizable, true)
  assert.ok((sheet.critique.proportions.error ?? 1) < 0.05)
  assert.deepEqual(sheet.views.map((view) => view.name), ['front', 'side', 'top', 'iso'])
})
