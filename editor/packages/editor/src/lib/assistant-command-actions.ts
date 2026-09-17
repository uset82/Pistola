import { type AssistantAction, executeAssistantPlan } from './assistant'
import useCad from '../store/use-cad'

export type RunAssistantCommandOptions = {
  failureMessage?: string
  onSuccess?: () => void
  reviewConfirmed?: boolean
}

export const runAssistantCommand = async (
  actions: AssistantAction[],
  options: RunAssistantCommandOptions = {},
) => {
  const result = await executeAssistantPlan(actions, {
    reviewConfirmed: options.reviewConfirmed ?? true,
  })

  if (!result.ok) {
    useCad
      .getState()
      .showCommandToast(options.failureMessage ?? result.errors[0] ?? 'Command failed.')
    return false
  }

  options.onSuccess?.()
  return true
}
