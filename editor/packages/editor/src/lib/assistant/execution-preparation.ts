import { type AnyNodeId, useScene } from '@pascal-app/core'

import type { AssistantAction } from './types'

export type PreparedAssistantActionForExecution =
  | { action: AssistantAction; skippedMessage: string | null }
  | { action: null; skippedMessage: string }

export const prepareAssistantActionForExecution = (
  action: AssistantAction,
  deletedNodeIds: Set<string>,
): PreparedAssistantActionForExecution => {
  const hasNode = (nodeId: string) => Boolean(useScene.getState().nodes[nodeId as AnyNodeId])

  if (action.type === 'delete_target' && action.nodeId && deletedNodeIds.has(action.nodeId)) {
    return {
      action: null,
      skippedMessage: `Skipped ${action.type} because the target was already deleted earlier in this plan.`,
    }
  }

  if (action.type === 'delete_target' && action.nodeId && !hasNode(action.nodeId)) {
    return {
      action: null,
      skippedMessage: `Skipped ${action.type} because the resolved target no longer exists in the scene.`,
    }
  }

  if (action.type === 'delete_nodes') {
    const remainingNodeIds = action.nodeIds.filter((nodeId) => !deletedNodeIds.has(nodeId) && hasNode(nodeId))
    if (remainingNodeIds.length === 0) {
      return {
        action: null,
        skippedMessage: `Skipped ${action.type} because none of the reviewed targets still exist in the scene.`,
      }
    }

    if (remainingNodeIds.length !== action.nodeIds.length) {
      return {
        action: { ...action, nodeIds: remainingNodeIds },
        skippedMessage: `${action.type} will skip reviewed targets that disappeared before execution and continue with the remaining nodes.`,
      }
    }
  }

  return {
    action,
    skippedMessage: null,
  }
}
