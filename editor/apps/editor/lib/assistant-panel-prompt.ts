import type { AssistantPanelStatus } from './assistant-panel-session'

export const normalizeAssistantPromptForSubmission = (rawPrompt: string) => rawPrompt.trim()

export const validateAssistantPromptForSubmission = (
  rawPrompt: string,
): { ok: true; prompt: string } | { ok: false; error: string } => {
  const prompt = normalizeAssistantPromptForSubmission(rawPrompt)
  if (!prompt) {
    return {
      ok: false,
      error: 'Enter a prompt before sending it to the assistant.',
    }
  }

  return { ok: true, prompt }
}

export const isAssistantComposerLocked = (status: AssistantPanelStatus) => status === 'planning'

export const getAssistantSendLabel = (status: AssistantPanelStatus) => {
  if (status === 'planning') return 'Planning...'
  if (status === 'executing') return 'Interrupt & Send'
  return 'Send'
}
