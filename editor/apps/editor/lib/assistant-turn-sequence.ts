import type { AssistantContinuation, AssistantTurnResult } from '../../../packages/editor/src/lib/assistant/types'
import type { AssistantImageAttachment } from './assistant-image-contract'

export type AssistantTurnSequenceStatus =
  | 'executed'
  | 'clarify'
  | 'review'
  | 'task-plan'
  | 'idle'
  | 'error'

export type AssistantTurnSequenceFetchArgs = {
  prompt: string
  image?: AssistantImageAttachment | null
  continuation?: AssistantContinuation | null
}

export type AssistantTurnSequenceChunkResult<UndoSnapshot> = {
  result: {
    ok: boolean
    resolvedForwardRefs?: Record<string, string>
  }
  undoSnapshot: UndoSnapshot | null
}

export type AssistantTurnSequenceOutcome<UndoSnapshot> = {
  status: AssistantTurnSequenceStatus
  undoSnapshot: UndoSnapshot | null
  interrupted: boolean
  finalTurn: AssistantTurnResult
}

export const runAssistantTurnSequence = async <UndoSnapshot>({
  initialTurn,
  prompt,
  image,
  reviewConfirmed,
  executeTurnChunk,
  requestAssistantTurn,
  requiresManualReview,
  shouldContinue,
  wasInterrupted,
  onFetchedTurn,
}: {
  initialTurn: AssistantTurnResult
  prompt: string
  image?: AssistantImageAttachment | null
  reviewConfirmed: boolean
  executeTurnChunk: (
    turn: AssistantTurnResult,
    reviewConfirmed: boolean,
    undoSnapshot: UndoSnapshot | null,
  ) => Promise<AssistantTurnSequenceChunkResult<UndoSnapshot>>
  requestAssistantTurn: (args: AssistantTurnSequenceFetchArgs) => Promise<AssistantTurnResult>
  requiresManualReview: (turn: AssistantTurnResult) => boolean
  shouldContinue: (turn: AssistantTurnResult) => boolean
  wasInterrupted: () => boolean
  onFetchedTurn?: (turn: AssistantTurnResult, needsManualReview: boolean) => void
}): Promise<AssistantTurnSequenceOutcome<UndoSnapshot>> => {
  let currentTurn = initialTurn
  let undoSnapshot: UndoSnapshot | null = null

  while (true) {
    const { result, undoSnapshot: nextUndoSnapshot } = await executeTurnChunk(
      currentTurn,
      reviewConfirmed,
      undoSnapshot,
    )
    undoSnapshot = nextUndoSnapshot

    if (!result.ok) {
      return {
        status: 'error',
        undoSnapshot,
        interrupted: wasInterrupted(),
        finalTurn: currentTurn,
      }
    }

    if (!shouldContinue(currentTurn)) {
      break
    }

    const nextContinuation = currentTurn.continuation
      ? {
        ...currentTurn.continuation,
        resolvedRefs: {
          ...(currentTurn.continuation.resolvedRefs ?? {}),
          ...(result.resolvedForwardRefs ?? {}),
        },
      }
      : currentTurn.continuation

    const nextTurn = await requestAssistantTurn({
      prompt,
      image,
      continuation: nextContinuation,
    })
    const nextTurnNeedsManualReview = requiresManualReview(nextTurn)
    onFetchedTurn?.(nextTurn, nextTurnNeedsManualReview)

    if (nextTurn.mode === 'task-plan') {
      return {
        status: 'task-plan',
        undoSnapshot,
        interrupted: wasInterrupted(),
        finalTurn: nextTurn,
      }
    }

    if (nextTurn.mode === 'clarify') {
      return {
        status: 'clarify',
        undoSnapshot,
        interrupted: wasInterrupted(),
        finalTurn: nextTurn,
      }
    }

    if (nextTurn.actions.length === 0) {
      return {
        status: 'idle',
        undoSnapshot,
        interrupted: wasInterrupted(),
        finalTurn: nextTurn,
      }
    }

    if (nextTurnNeedsManualReview) {
      return {
        status: 'review',
        undoSnapshot,
        interrupted: wasInterrupted(),
        finalTurn: nextTurn,
      }
    }

    currentTurn = nextTurn
  }

  return {
    status: 'executed',
    undoSnapshot,
    interrupted: wasInterrupted(),
    finalTurn: currentTurn,
  }
}
