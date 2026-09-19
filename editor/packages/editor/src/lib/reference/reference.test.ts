import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clearSceneHistory, useScene } from '@pascal-app/core'
import { validateCadSolidSpec } from '../cad/local-kernel'
import { pngDataUrl } from '../render/png'
import { createPistolaAgentApi } from '../agent-api'
import { useOperatorPlanStore } from '../operator-plan'
import { decodePng } from '../render/png'
import { encodePng } from '../render/png'
import { useReferenceStore } from './store'
import { traceReferenceSheet } from './tracer'

const reset = () => {
  useScene.getState().clearScene()
  clearSceneHistory()
  useOperatorPlanStore.getState().setPlan(null)
  useReferenceStore.getState().clear()
}

afterEach(reset)

const sheetDataUrl = () => {
  const width = 180
  const height = 60
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * width + x) * 4
        rgba[index] = 20
        rgba[index + 1] = 20
        rgba[index + 2] = 20
        rgba[index + 3] = 255
      }
    }
  }
  fill(10, 15, 50, 45)
  fill(70, 15, 90, 45)
  fill(130, 20, 170, 40)
  return pngDataUrl(width, height, rgba)
}

const blockBlueprint = {
  title: 'Block',
  overall_m: [2, 1.5, 1],
  anchor: 'floor',
  parts: [
    {
      id: 'body',
      name: 'Body',
      technique: 'primitive',
      primitive: 'box',
      dims_m: [2, 1.5, 1],
      position_m: [0, 0, 0],
    },
  ],
}

test('decodePng round-trips encodePng pixels', () => {
  const rgba = new Uint8ClampedArray(8 * 4)
  for (let i = 0; i < 8; i += 1) {
    rgba[i * 4] = i * 20
    rgba[i * 4 + 1] = 30
    rgba[i * 4 + 2] = 40
    rgba[i * 4 + 3] = 255
  }
  const decoded = decodePng(encodePng(4, 2, rgba))
  assert.equal(decoded.width, 4)
  assert.equal(decoded.height, 2)
  assert.equal(decoded.data[0], 0)
  assert.equal(decoded.data[4], 20)
})

const gridFromDataUrl = (dataUrl: string) => {
  const comma = dataUrl.indexOf(',')
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return decodePng(bytes)
}

test('traceReferenceSheet scales three left-to-right views into the views.ts frame', () => {
  const traced = traceReferenceSheet(gridFromDataUrl(sheetDataUrl()), 2)
  assert.ok(Math.abs(traced.overall_m[0] - 2) < 0.05)
  assert.ok(Math.abs(traced.overall_m[1] - 1.5) < 0.05)
  assert.ok(Math.abs(traced.overall_m[2] - 1) < 0.05)
  assert.equal(traced.consistent, true)
  assert.equal(traced.views.front.plane, 'XY')
  assert.equal(traced.views.side.plane, 'ZY')
  assert.equal(traced.views.top.plane, 'XZ')
})

test('reference.add requires a blueprint, traces the sheet, and does not apply hull or guides', async () => {
  reset()
  const api = createPistolaAgentApi()
  await assert.rejects(() => api.invoke('reference.add', { dataUrl: sheetDataUrl(), knownDimension: 2 }), /blueprint/)
  const added = (await api.invoke('reference.add', {
    dataUrl: sheetDataUrl(),
    layout: 'front|side|top',
    knownDimension: 2,
    blueprint: blockBlueprint,
  })) as {
    consistent: boolean
    overall_m: number[]
    hull: { type: string; spec: { op: string } }
    guides: Array<{ type: string; url: string; view: string }>
  }
  assert.equal(added.consistent, true)
  assert.ok(Math.abs((added.overall_m[0] ?? 0) - 2) < 0.05)
  assert.equal(added.hull.type, 'build_cad_solid')
  assert.equal(added.hull.spec.op, 'intersect_profiles')
  assert.equal(added.guides.length, 3)
  assert.equal(added.guides[0]?.url.startsWith('pistola-reference:'), true)
  assert.equal('dataUrl' in added, false)
  const spec = validateCadSolidSpec(added.hull.spec)
  assert.equal(spec.success, true)
  assert.equal(
    Object.values(useScene.getState().nodes).some((node) => node.type === 'guide' || node.type === 'cad-body'),
    false,
  )
})

test('create_guide places a vertical front plane and the fitter proposes unapplied patches', async () => {
  reset()
  const api = createPistolaAgentApi()
  const levelId = Object.values(useScene.getState().nodes).find((node) => node.type === 'level')?.id
  assert.ok(levelId)
  const added = (await api.invoke('reference.add', {
    dataUrl: sheetDataUrl(),
    knownDimension: { axis: 'width', meters: 2 },
    blueprint: blockBlueprint,
  })) as { guides: Array<{ type: 'create_guide'; url: string; view: 'front' | 'side' | 'top' }> }
  const created = await api.run([
    {
      type: 'place_item',
      assetId: 'primitive-box',
      name: 'Body',
      levelId,
      placement: 'explicit',
      position: [0.4, 0, 0],
      scale: [2, 1.5, 1],
    },
    {
      ...added.guides.find((guide) => guide.view === 'front')!,
      position: [0, 0.75, -0.65],
      levelId,
    },
  ])
  assert.equal(created.ok, true)
  const guide = Object.values(useScene.getState().nodes).find((node) => node.type === 'guide')
  assert.ok(guide)
  assert.equal((guide.metadata as { pistolaPlane?: string } | undefined)?.pistolaPlane, 'front')

  const beforeX = (Object.values(useScene.getState().nodes).find((node) => node.type === 'item') as { position?: number[] })
    ?.position?.[0]
  const fit = (await api.invoke('reference.fit')) as {
    applied: boolean
    beforeIou: number
    afterIou: number
    patches: Array<{ type: string; delta?: number[] }>
  }
  assert.equal(fit.applied, false)
  assert.ok(fit.afterIou + 1e-6 >= fit.beforeIou)
  const move = fit.patches.find((patch) => patch.type === 'move_target')
  assert.ok(move?.delta)
  assert.ok((move.delta?.[0] ?? 0) < 0)
  const afterX = (Object.values(useScene.getState().nodes).find((node) => node.type === 'item') as { position?: number[] })
    ?.position?.[0]
  assert.equal(afterX, beforeX)
})
