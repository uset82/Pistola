import { z } from 'zod'

import type { AssistantChatMode } from './assistant-chat-contract'

export const assistantComposerSuggestionCategoryValues = [
  'quick-start',
  'scene',
  'cleanup',
  'refine',
  'cad',
  'help',
] as const

export const assistantComposerSuggestionInsertionBehaviorValues = ['replace', 'append'] as const

export const AssistantComposerSuggestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  category: z.enum(assistantComposerSuggestionCategoryValues),
  insertionBehavior: z.enum(assistantComposerSuggestionInsertionBehaviorValues),
  requiresSelection: z.boolean().default(false),
  detail: z.string().optional(),
})

export type AssistantComposerSuggestion = z.infer<typeof AssistantComposerSuggestionSchema>
export type AssistantComposerKeyAction =
  | { type: 'none' }
  | { type: 'submit-prompt' }
  | { type: 'move-selection'; nextIndex: number }
  | { type: 'apply-suggestion'; suggestionIndex: number }

export type AssistantComposerSuggestionContext = {
  input: string
  phase: string
  tool: string | null
  availableTools?: string[]
  selectedSummary: string
  hasSelection: boolean
  levelId: string | null
  chatMode: AssistantChatMode
  catalogCategories: string[]
  recentSuccessfulPrompts: string[]
}

const normalizeValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const scoreSuggestionMatch = (
  suggestion: AssistantComposerSuggestion,
  normalizedInput: string,
  chatMode: AssistantChatMode,
) => {
  if (!normalizedInput) {
    const categoryBonus =
      (chatMode === 'create' && suggestion.category === 'scene') ||
      (chatMode === 'refine' && suggestion.category === 'refine') ||
      (chatMode === 'ask' && suggestion.category === 'help')
        ? 25
        : 0
    const quickStartBonus = suggestion.category === 'quick-start' ? 10 : 0
    return categoryBonus + quickStartBonus
  }

  const normalizedText = normalizeValue(suggestion.text)
  const normalizedDetail = normalizeValue(suggestion.detail ?? '')
  const haystack = `${normalizedText} ${normalizedDetail}`.trim()
  const tokens = normalizedInput.split(' ').filter(Boolean)

  let score = 0
  if (normalizedText === normalizedInput) score += 180
  if (normalizedText.startsWith(normalizedInput)) score += 100
  if (haystack.includes(normalizedInput)) score += 40
  for (const token of tokens) {
    if (haystack.includes(token)) score += 8
  }
  if (chatMode === 'create' && suggestion.category === 'scene') score += 8
  if (chatMode === 'refine' && suggestion.category === 'refine') score += 8
  if (chatMode === 'ask' && suggestion.category === 'help') score += 8
  return score
}

const buildBaseSuggestions = ({
  phase,
  tool,
  availableTools = [],
  selectedSummary,
  hasSelection,
  levelId,
  chatMode,
  catalogCategories,
  recentSuccessfulPrompts,
}: Omit<AssistantComposerSuggestionContext, 'input'>) => {
  const suggestions: AssistantComposerSuggestion[] = [
    {
      id: 'ask-help',
      text: 'What can you help me build here?',
      category: 'help',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Get a concise explanation of what the assistant can do in the current workspace.',
    },
    {
      id: 'create-room',
      text: levelId
        ? 'Create a 4m x 4m room on this level with walls, slab, ceiling, and roof'
        : 'Create a new editable level scaffold for this building',
      category: 'scene',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: levelId
        ? 'Fast structure starter for the current level.'
        : 'Use when the workspace still needs a level before building rooms.',
    },
    {
      id: 'create-house',
      text: 'Make a small two-bedroom house with kitchen and living room',
      category: 'scene',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Creation-first prompt for a decomposed editable house shell.',
    },
    {
      id: 'create-cafe',
      text: 'Make a small furnished cafe with a counter and seating',
      category: 'scene',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Creation-first prompt for a compact editable cafe approximation.',
    },
    {
      id: 'furnish-room',
      text: 'Furnish the living room with a sofa, coffee table, rug, and TV wall',
      category: 'scene',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Adds a standard furnishing bundle when a room target is available.',
    },
    {
      id: 'cleanup-level',
      text: levelId ? 'Clean everything on this level' : 'Clean everything in the selected workspace',
      category: 'cleanup',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Requests a bounded reviewed cleanup instead of ad hoc delete commands.',
    },
    {
      id: 'cad-box',
      text: 'Create a CAD box 1m x 2m x 0.5m',
      category: 'cad',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Quick-start CAD prompt.',
    },
  ]

  for (const [index, prompt] of recentSuccessfulPrompts.slice(0, 2).entries()) {
    suggestions.push({
      id: `recent-success-${index}`,
      text: prompt,
      category: 'quick-start',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Reuse a recent successful assistant request.',
    })
  }

  const primaryCatalogCategory = catalogCategories[0]
  if (primaryCatalogCategory && chatMode !== 'ask') {
    suggestions.push({
      id: 'catalog-category-seed',
      text: hasSelection
        ? `Place a ${primaryCatalogCategory} item in ${selectedSummary}`
        : `Place a ${primaryCatalogCategory} item on this level`,
      category: 'quick-start',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: `Uses the currently available ${primaryCatalogCategory} catalog category as a prompt seed.`,
    })
  }

  if (hasSelection) {
    suggestions.push(
      {
        id: 'refine-rename',
        text: `Rename ${selectedSummary} to Kitchen`,
        category: 'refine',
        insertionBehavior: 'replace',
        requiresSelection: true,
        detail: 'Rename the current selection or room target.',
      },
      {
        id: 'refine-bigger',
        text: `Make ${selectedSummary} bigger`,
        category: 'refine',
        insertionBehavior: 'replace',
        requiresSelection: true,
        detail: 'Refine the current selection without restating the full scene.',
      },
      {
        id: 'refine-hide',
        text: `Hide ${selectedSummary}`,
        category: 'refine',
        insertionBehavior: 'replace',
        requiresSelection: true,
        detail: 'Hide the current selection or reference target.',
      },
    )
  } else if (chatMode === 'refine') {
    suggestions.push({
      id: 'refine-follow-up',
      text: 'Make the windows taller',
      category: 'refine',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Refine a recent or named target from the current scene.',
    })
  }

  if (tool === 'wall' && hasSelection) {
    suggestions.push({
      id: 'wall-openings',
      text: 'Add two windows to the selected wall',
      category: 'refine',
      insertionBehavior: 'replace',
      requiresSelection: true,
      detail: 'Wall-tool shortcut for common opening edits.',
    })
  }

  if (availableTools.includes('door') && hasSelection) {
    suggestions.push({
      id: 'available-door-opening',
      text: `Add a door to ${selectedSummary}`,
      category: 'refine',
      insertionBehavior: 'replace',
      requiresSelection: true,
      detail: 'Uses the currently available door tool surface to guide an opening edit.',
    })
  }

  if (availableTools.includes('window') && hasSelection && tool !== 'wall') {
    suggestions.push({
      id: 'available-window-openings',
      text: `Add two windows to ${selectedSummary}`,
      category: 'refine',
      insertionBehavior: 'replace',
      requiresSelection: true,
      detail: 'Uses the currently available window tool surface to guide a wall-opening prompt.',
    })
  }

  if (availableTools.includes('item') && phase !== 'cad') {
    suggestions.push({
      id: 'available-furnish',
      text: hasSelection
        ? `Furnish ${selectedSummary} with a seating layout`
        : 'Place a furniture item on this level',
      category: 'quick-start',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Uses the currently available item-placement tool surface as a prompt seed.',
    })
  }

  if (phase === 'cad') {
    suggestions.push({
      id: 'cad-bracket',
      text: 'Make a wall bracket with two holes',
      category: 'cad',
      insertionBehavior: 'replace',
      requiresSelection: false,
      detail: 'Creation-focused CAD request for the current CAD workflow.',
    })

    if (availableTools.includes('cad-extrude')) {
      suggestions.push({
        id: 'available-cad-extrude',
        text: 'Extrude the active sketch 0.5m',
        category: 'cad',
        insertionBehavior: 'replace',
        requiresSelection: false,
        detail: 'Uses the current CAD tool surface to guide a direct modeling prompt.',
      })
    }
  }

  return suggestions.map((suggestion) => AssistantComposerSuggestionSchema.parse(suggestion))
}

export const getAssistantComposerSuggestions = (
  context: AssistantComposerSuggestionContext,
): AssistantComposerSuggestion[] => {
  const normalizedInput = normalizeValue(context.input)
  const suggestions = buildBaseSuggestions(context)

  return suggestions
    .filter((suggestion) => !suggestion.requiresSelection || context.hasSelection)
    .map((suggestion) => ({
      suggestion,
      score: scoreSuggestionMatch(suggestion, normalizedInput, context.chatMode),
    }))
    .filter(({ score }) => score > 0 || normalizedInput.length === 0)
    .sort((left, right) => right.score - left.score || left.suggestion.text.localeCompare(right.suggestion.text))
    .slice(0, 6)
    .map(({ suggestion }) => suggestion)
}

export const applyAssistantComposerSuggestion = (
  currentInput: string,
  suggestion: AssistantComposerSuggestion,
) => {
  if (suggestion.insertionBehavior === 'append' && currentInput.trim()) {
    return `${currentInput.trim()} ${suggestion.text}`.trim()
  }

  return suggestion.text
}

export const resolveAssistantComposerKeyAction = ({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  isComposing = false,
  activeSuggestionIndex,
  suggestionCount,
}: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  /** True while an IME composition is open; Enter then confirms the composition. */
  isComposing?: boolean
  activeSuggestionIndex: number
  suggestionCount: number
}): AssistantComposerKeyAction => {
  // Enter sends and Shift+Enter adds a line; Ctrl/Cmd+Enter keeps working.
  if (key === 'Enter' && !isComposing && (!shiftKey || ctrlKey || metaKey)) {
    return { type: 'submit-prompt' }
  }

  if (suggestionCount === 0) return { type: 'none' }

  if (key === 'ArrowDown') {
    return {
      type: 'move-selection',
      nextIndex: (activeSuggestionIndex + 1) % suggestionCount,
    }
  }

  if (key === 'ArrowUp') {
    return {
      type: 'move-selection',
      nextIndex: (activeSuggestionIndex - 1 + suggestionCount) % suggestionCount,
    }
  }

  if (key === 'Tab') {
    return {
      type: 'apply-suggestion',
      suggestionIndex: activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0,
    }
  }

  return { type: 'none' }
}

// ---------------------------------------------------------------------------
// Inline autocomplete (ghost text)
// ---------------------------------------------------------------------------

export type InlineAutocompletion = {
  ghostText: string
  fullText: string
}

type AutocompletePattern = {
  prefix: string
  completion: string
  phases?: string[]
}

const AUTOCOMPLETE_PATTERNS: AutocompletePattern[] = [
  // English — creation
  { prefix: 'create a ', completion: '4m x 4m room with walls', phases: ['structure'] },
  { prefix: 'create a ', completion: '4m x 4m room with walls' },
  { prefix: 'make a ', completion: 'small house with kitchen and living room' },
  { prefix: 'build ', completion: 'a 2-bedroom house with doors and windows' },
  { prefix: 'build a ', completion: 'small furnished cafe with seating' },
  { prefix: 'generate ', completion: 'a modern living room layout' },

  // English — placement & furnishing
  { prefix: 'place a ', completion: 'sofa in the center of the room' },
  { prefix: 'add a ', completion: 'door to the front wall' },
  { prefix: 'add ', completion: 'two windows to the selected wall' },
  { prefix: 'furnish ', completion: 'the room with a sofa, table, and rug' },
  { prefix: 'put ', completion: 'a table in the kitchen' },

  // English — refinement
  { prefix: 'make it ', completion: 'bigger' },
  { prefix: 'make the ', completion: 'windows taller' },
  { prefix: 'move ', completion: 'the sofa to the left' },
  { prefix: 'rename ', completion: 'the room to Kitchen' },
  { prefix: 'hide ', completion: 'the selected element' },
  { prefix: 'delete ', completion: 'the selected elements' },
  { prefix: 'clean ', completion: 'everything on this level' },

  // English — CAD
  { prefix: 'extrude ', completion: 'the active sketch 0.5m', phases: ['cad'] },
  { prefix: 'revolve ', completion: 'the sketch 360 degrees around Z axis', phases: ['cad'] },
  { prefix: 'fillet ', completion: 'all edges with 2mm radius', phases: ['cad'] },
  { prefix: 'chamfer ', completion: 'the top edges 1mm', phases: ['cad'] },
  { prefix: 'create a cad ', completion: 'box 1m x 2m x 0.5m' },

  // Spanish — creation
  { prefix: 'crea ', completion: 'una habitación de 4m x 4m' },
  { prefix: 'haz ', completion: 'una casa pequeña con cocina' },
  { prefix: 'genera ', completion: 'una casita para mi perro' },
  { prefix: 'construye ', completion: 'una casa de dos habitaciones' },
  { prefix: 'hacer ', completion: 'una sala con muebles' },

  // Spanish — placement
  { prefix: 'agrega ', completion: 'una puerta a la pared frontal' },
  { prefix: 'pon ', completion: 'un sofa en la sala' },
  { prefix: 'ponle ', completion: 'techo a la habitación' },
  { prefix: 'coloca ', completion: 'una mesa en el centro' },

  // Spanish — refinement
  { prefix: 'mueve ', completion: 'el sofa a la izquierda' },
  { prefix: 'renombra ', completion: 'la habitación a Cocina' },
  { prefix: 'limpia ', completion: 'todo en este nivel' },
  { prefix: 'borra ', completion: 'los elementos seleccionados' },
]

export const getInlineAutocompletion = (
  context: AssistantComposerSuggestionContext,
): InlineAutocompletion | null => {
  const input = context.input
  if (!input || input.length < 2) return null

  const normalizedInput = input.toLowerCase()

  // 1. Check against pattern library
  let bestMatch: AutocompletePattern | null = null
  let bestPrefixLength = 0

  for (const pattern of AUTOCOMPLETE_PATTERNS) {
    if (!normalizedInput.startsWith(pattern.prefix)) continue

    // Phase-specific patterns get priority
    const phaseBonus = pattern.phases?.includes(context.phase) ? 100 : 0
    const score = pattern.prefix.length + phaseBonus

    if (score > bestPrefixLength) {
      bestPrefixLength = score
      bestMatch = pattern
    }
  }

  if (bestMatch) {
    const typedAfterPrefix = input.slice(bestMatch.prefix.length)
    const completionLower = bestMatch.completion.toLowerCase()

    // If user already typed part of the completion, extend from there
    if (typedAfterPrefix && completionLower.startsWith(typedAfterPrefix.toLowerCase())) {
      const remaining = bestMatch.completion.slice(typedAfterPrefix.length)
      if (remaining) {
        return {
          ghostText: remaining,
          fullText: input + remaining,
        }
      }
      return null
    }

    // User hasn't started typing the completion yet
    if (!typedAfterPrefix) {
      return {
        ghostText: bestMatch.completion,
        fullText: input + bestMatch.completion,
      }
    }
  }

  // 2. Check against recent successful prompts
  for (const recentPrompt of context.recentSuccessfulPrompts) {
    const recentLower = recentPrompt.toLowerCase()
    if (recentLower.startsWith(normalizedInput) && recentLower !== normalizedInput) {
      const remaining = recentPrompt.slice(input.length)
      if (remaining.length > 2) {
        return {
          ghostText: remaining,
          fullText: recentPrompt,
        }
      }
    }
  }

  return null
}
