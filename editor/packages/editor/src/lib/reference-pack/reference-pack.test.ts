import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isOpaqueAssetRef,
  type ReferencePackInput,
  ReferencePackSchema,
  referenceViewValues,
  validateReferencePack,
} from './reference-pack'

const hashFor = (value: number) => value.toString(16).padStart(64, '0')

const makeReferencePack = (): ReferencePackInput => ({
  version: 1,
  concept: {
    source: 'ide-native',
    assetRef: 'pistola://assets/concept-approved',
    sha256: hashFor(1),
    dimensions: { width: 1024, height: 1024 },
    approved: true,
  },
  scaleAnchor: {
    label: 'overall length',
    meters: 0.4,
  },
  assets: referenceViewValues.map((view, index) => ({
    view,
    source: index % 2 === 0 ? 'ide-native' : 'user-upload',
    assetRef: `pistola://assets/toy-boat-${view}`,
    sha256: hashFor(index + 10),
    dimensions: { width: 1024, height: 1024 },
    projection: view === 'left-45' || view === 'right-45' ? 'perspective' : 'orthographic',
  })),
})

const errorWithCode = (input: unknown, code: string) => {
  const result = validateReferencePack(input)
  if (result.valid) assert.fail('Expected the reference pack to be invalid.')
  assert.equal(result.valid, false)
  const error = result.errors.find((issue) => issue.code === code)
  assert.ok(
    error,
    `Expected a ${code} error; received ${result.errors.map((issue) => issue.code).join(', ')}`,
  )
  return error
}

test('ReferencePackSchema accepts one approved concept, scale anchor, and every canonical view', () => {
  const pack = makeReferencePack()
  const parsed = ReferencePackSchema.parse(pack)

  assert.equal(parsed.assets.length, 8)
  assert.deepEqual(
    parsed.assets.map((asset) => asset.view),
    referenceViewValues,
  )

  const result = validateReferencePack(pack)
  if (!result.valid) assert.fail(`Expected valid pack, received ${JSON.stringify(result.errors)}`)
  assert.equal(result.valid, true)
  assert.equal(result.data.concept.approved, true)
})

test('opaque asset references reject inline and local-file payloads while accepting stored URLs', () => {
  assert.equal(isOpaqueAssetRef('pistola://assets/reference-front'), true)
  assert.equal(isOpaqueAssetRef('asset:reference-front'), true)
  assert.equal(isOpaqueAssetRef('https://assets.example/reference-front.png'), true)
  assert.equal(isOpaqueAssetRef('data:image/png;base64,AAAA'), false)
  assert.equal(isOpaqueAssetRef('blob:https://editor.example/reference'), false)
  assert.equal(isOpaqueAssetRef('file:///C:/reference-front.png'), false)
  assert.equal(isOpaqueAssetRef('raw-base64-image-bytes'), false)
})

test('validation reports a missing canonical view with a concrete corrective hint', () => {
  const pack = makeReferencePack()
  pack.assets = pack.assets.filter((asset) => asset.view !== 'bottom')

  const error = errorWithCode(pack, 'missing-view')
  assert.match(error.message, /bottom/)
  assert.match(error.hint, /front, back, left, right, top, bottom, left-45, and right-45/)
})

test('validation reports a duplicate label and the corresponding missing view', () => {
  const pack = makeReferencePack()
  const backAsset = pack.assets.find((asset) => asset.view === 'back')
  assert.ok(backAsset)
  backAsset.view = 'front'

  const duplicate = errorWithCode(pack, 'duplicate-view')
  assert.deepEqual(duplicate.path, ['assets', '1', 'view'])
  assert.match(duplicate.message, /front/)
  assert.ok(errorWithCode(pack, 'missing-view').message.includes('back'))
})

test('validation requires an explicitly approved concept and a positive scale anchor', () => {
  const pack = makeReferencePack()
  pack.concept.approved = false
  pack.scaleAnchor.meters = 0

  const conceptError = errorWithCode(pack, 'approved-concept-required')
  assert.match(conceptError.hint, /user/)
  const scaleError = errorWithCode(pack, 'invalid-scale-anchor')
  assert.match(scaleError.hint, /positive meters/)
})

test('validation makes bad asset storage, hash, and dimensions actionable', () => {
  const pack = makeReferencePack()
  const front = pack.assets.find((asset) => asset.view === 'front')
  assert.ok(front)
  front.assetRef = 'data:image/png;base64,AAAA'
  front.sha256 = 'not-a-sha256'
  front.dimensions.width = 0

  const assetError = errorWithCode(pack, 'invalid-asset-ref')
  assert.match(assetError.hint, /Store image bytes outside the pack/)
  assert.ok(errorWithCode(pack, 'invalid-sha256'))
  assert.ok(errorWithCode(pack, 'invalid-dimensions'))
})

test('geometry-source views require orthographic projection but diagonal review views may be perspective', () => {
  const pack = makeReferencePack()
  const front = pack.assets.find((asset) => asset.view === 'front')
  assert.ok(front)
  front.projection = 'perspective'

  const error = errorWithCode(pack, 'invalid-projection')
  assert.deepEqual(error.path, ['assets', '0', 'projection'])
  assert.match(error.message, /front/)

  const diagonalOnly = makeReferencePack()
  const left45 = diagonalOnly.assets.find((asset) => asset.view === 'left-45')
  assert.ok(left45)
  left45.projection = 'perspective'
  assert.equal(validateReferencePack(diagonalOnly).valid, true)
})

test('validation rejects reusing a stored image under different view labels', () => {
  const pack = makeReferencePack()
  const front = pack.assets.find((asset) => asset.view === 'front')
  const back = pack.assets.find((asset) => asset.view === 'back')
  assert.ok(front)
  assert.ok(back)
  back.assetRef = front.assetRef
  back.sha256 = front.sha256

  const error = errorWithCode(pack, 'duplicate-asset')
  assert.match(error.hint, /distinct stored image/)
})
