import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAssistantSendLabel,
  isAssistantComposerLocked,
  normalizeAssistantPromptForSubmission,
  validateAssistantPromptForSubmission,
} from './assistant-panel-prompt'

test('normalizeAssistantPromptForSubmission trims surrounding whitespace', () => {
  assert.equal(normalizeAssistantPromptForSubmission('  make a room  '), 'make a room')
})

test('validateAssistantPromptForSubmission rejects empty prompts without throwing', () => {
  assert.deepEqual(validateAssistantPromptForSubmission('   '), {
    ok: false,
    error: 'Enter a prompt before sending it to the assistant.',
  })
})

test('validateAssistantPromptForSubmission accepts non-empty prompts', () => {
  assert.deepEqual(validateAssistantPromptForSubmission(' build a room '), {
    ok: true,
    prompt: 'build a room',
  })
})

test('assistant composer stays editable during execution so a new prompt can interrupt the current run', () => {
  assert.equal(isAssistantComposerLocked('planning'), true)
  assert.equal(isAssistantComposerLocked('executing'), false)
  assert.equal(isAssistantComposerLocked('idle'), false)
})

test('getAssistantSendLabel reflects planning and interruption states', () => {
  assert.equal(getAssistantSendLabel('idle'), 'Send')
  assert.equal(getAssistantSendLabel('planning'), 'Planning...')
  assert.equal(getAssistantSendLabel('executing'), 'Interrupt & Send')
})
