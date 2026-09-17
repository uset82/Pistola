import type { AssistantTurnResult } from '../../../packages/editor/src/lib/assistant/types'

export const shouldRequestAssistantContinuation = ({
  turn,
  stopRequested,
  runId,
  activeRunId,
}: {
  turn: AssistantTurnResult
  stopRequested: boolean
  runId: number
  activeRunId: number
}) => Boolean(turn.continuation) && !stopRequested && activeRunId === runId
