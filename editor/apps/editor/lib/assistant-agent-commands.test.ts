import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAssistantAgentCommand } from './assistant-agent-commands'

test('parses /run JSON and fenced blocks', () => {
  const direct = parseAssistantAgentCommand('/run [{"type":"set_workspace","workspace":"cad"}]')
  assert.equal(direct?.kind, 'run')
  if (direct?.kind === 'run') {
    const first = direct.actions[0] as { type?: string } | undefined
    assert.equal(first?.type, 'set_workspace')
  }

  const fenced = parseAssistantAgentCommand('/validate\n```json\n[{"type":"place_item","assetId":"primitive-box"}]\n```')
  assert.equal(fenced?.kind, 'validate')
})

test('parses /manual /inspect /recipe /cad', () => {
  assert.equal(parseAssistantAgentCommand('/manual')?.kind, 'manual')
  assert.equal(parseAssistantAgentCommand('/inspect {"type":"item"}')?.kind, 'inspect')
  const recipe = parseAssistantAgentCommand('/recipe heart {"width":2}')
  assert.equal(recipe?.kind, 'recipe')
  if (recipe?.kind === 'recipe') assert.equal(recipe.name, 'heart')
  const cad = parseAssistantAgentCommand('/cad {"op":"box","size":[1,1,1]}')
  assert.equal(cad?.kind, 'cad')
})
