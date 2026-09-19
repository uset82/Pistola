import assert from 'node:assert/strict'
import test from 'node:test'
import { assertWorkspaceCommandType } from './workspace-bridge'

test('unknown workspace command types are rejected', () => {
  assert.doesNotThrow(() => assertWorkspaceCommandType('api'))
  assert.doesNotThrow(() => assertWorkspaceCommandType('assistant_prompt'))
  assert.throws(() => assertWorkspaceCommandType('prompt'), /Unknown workspace command type/)
})
