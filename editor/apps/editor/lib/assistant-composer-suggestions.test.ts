import assert from 'node:assert/strict'
import test from 'node:test'

import { assistantComposerAssistFixtures } from './assistant-acceptance-fixtures'
import {
  applyAssistantComposerSuggestion,
  getAssistantComposerSuggestions,
  getInlineAutocompletion,
  resolveAssistantComposerKeyAction,
} from './assistant-composer-suggestions'

test('getAssistantComposerSuggestions ranks cleanup prompts for clean input on a level', () => {
  const suggestions = getAssistantComposerSuggestions({
    input: 'clean',
    phase: 'structure',
    tool: 'wall',
    selectedSummary: 'No selection',
    hasSelection: false,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.equal(suggestions[0]?.id, 'cleanup-level')
  assert.match(suggestions[0]?.text ?? '', /clean/i)
})

test('getAssistantComposerSuggestions returns refine suggestions that require a selection', () => {
  const suggestions = getAssistantComposerSuggestions({
    input: '',
    phase: 'structure',
    tool: 'select',
    selectedSummary: 'Living Room',
    hasSelection: true,
    levelId: 'level_0',
    chatMode: 'refine',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.ok(suggestions.some((suggestion) => suggestion.id === 'refine-rename'))
  assert.ok(suggestions.some((suggestion) => suggestion.id === 'refine-bigger'))
})

test('applyAssistantComposerSuggestion replaces the current prompt by default', () => {
  const [suggestion] = getAssistantComposerSuggestions({
    input: '',
    phase: 'structure',
    tool: 'wall',
    selectedSummary: 'No selection',
    hasSelection: false,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.ok(suggestion)
  assert.equal(applyAssistantComposerSuggestion('old prompt', suggestion!), suggestion?.text)
})

test('getAssistantComposerSuggestions can surface recent successful prompts', () => {
  const suggestions = getAssistantComposerSuggestions({
    input: '',
    phase: 'structure',
    tool: 'select',
    selectedSummary: 'No selection',
    hasSelection: false,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: ['Make a small furnished cafe'],
  })

  assert.ok(suggestions.some((suggestion) => suggestion.id === 'recent-success-0'))
})

test('getAssistantComposerSuggestions can seed prompts from available catalog categories', () => {
  const suggestions = getAssistantComposerSuggestions({
    input: '',
    phase: 'furnish',
    tool: 'place-item',
    selectedSummary: 'Kitchen',
    hasSelection: true,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['appliance'],
    recentSuccessfulPrompts: [],
  })

  assert.ok(suggestions.some((suggestion) => suggestion.id === 'catalog-category-seed'))
})

test('getAssistantComposerSuggestions can use the active tool to surface wall-specific prompts', () => {
  const suggestions = getAssistantComposerSuggestions({
    input: '',
    phase: 'structure',
    tool: 'wall',
    selectedSummary: 'Main Wall',
    hasSelection: true,
    levelId: 'level_0',
    chatMode: 'refine',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.ok(suggestions.some((suggestion) => suggestion.id === 'wall-openings'))
})

test('getAssistantComposerSuggestions can use available tools to surface tool-aware prompts', () => {
  const suggestions = getAssistantComposerSuggestions({
    input: 'door',
    phase: 'structure',
    tool: 'select',
    availableTools: ['wall', 'window', 'door'],
    selectedSummary: 'Main Wall',
    hasSelection: true,
    levelId: 'level_0',
    chatMode: 'refine',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.ok(suggestions.some((suggestion) => suggestion.id === 'available-door-opening'))
})

for (const fixture of assistantComposerAssistFixtures) {
  test(`assistant composer fixture: ${fixture.id}`, () => {
    const suggestions = getAssistantComposerSuggestions(fixture.context)

    assert.equal(typeof fixture.baselineFailureSource, 'string')
    assert.equal(suggestions[0]?.id, fixture.expectedLeadingSuggestionId)
  })
}

test('resolveAssistantComposerKeyAction navigates suggestions with the keyboard', () => {
  assert.deepEqual(
    resolveAssistantComposerKeyAction({
      key: 'ArrowDown',
      activeSuggestionIndex: 0,
      suggestionCount: 3,
    }),
    { type: 'move-selection', nextIndex: 1 },
  )

  assert.deepEqual(
    resolveAssistantComposerKeyAction({
      key: 'ArrowUp',
      activeSuggestionIndex: 0,
      suggestionCount: 3,
    }),
    { type: 'move-selection', nextIndex: 2 },
  )
})

test('resolveAssistantComposerKeyAction accepts suggestions without auto-sending', () => {
  assert.deepEqual(
    resolveAssistantComposerKeyAction({
      key: 'Tab',
      activeSuggestionIndex: 1,
      suggestionCount: 3,
    }),
    { type: 'apply-suggestion', suggestionIndex: 1 },
  )

  assert.deepEqual(
    resolveAssistantComposerKeyAction({
      key: 'Enter',
      ctrlKey: true,
      activeSuggestionIndex: 1,
      suggestionCount: 3,
    }),
    { type: 'submit-prompt' },
  )
})

test('getInlineAutocompletion returns ghost text for matching prefixes', () => {
  const completion = getInlineAutocompletion({
    input: 'create a ',
    phase: 'structure',
    tool: 'wall',
    selectedSummary: 'No selection',
    hasSelection: false,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.deepEqual(completion, {
    ghostText: '4m x 4m room with walls',
    fullText: 'create a 4m x 4m room with walls',
  })
})

test('getInlineAutocompletion prefers CAD-specific completions in CAD phase', () => {
  const completion = getInlineAutocompletion({
    input: 'extrude ',
    phase: 'cad',
    tool: 'cad-extrude',
    availableTools: ['cad-extrude'],
    selectedSummary: 'Bracket Sketch',
    hasSelection: true,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.equal(completion?.ghostText, 'the active sketch 0.5m')
})

test('getInlineAutocompletion returns null for empty input', () => {
  const completion = getInlineAutocompletion({
    input: '',
    phase: 'structure',
    tool: 'wall',
    selectedSummary: 'No selection',
    hasSelection: false,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.equal(completion, null)
})

test('getInlineAutocompletion supports Spanish prefixes', () => {
  const completion = getInlineAutocompletion({
    input: 'genera ',
    phase: 'structure',
    tool: 'wall',
    selectedSummary: 'No selection',
    hasSelection: false,
    levelId: 'level_0',
    chatMode: 'create',
    catalogCategories: ['furniture'],
    recentSuccessfulPrompts: [],
  })

  assert.equal(completion?.ghostText, 'una casita para mi perro')
})
