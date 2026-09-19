import type { CadBrief } from '@pascal-app/core'
import { executeCadBrief } from '../cad/execute-cad-brief'
import { resolveCadSpaceParentId } from '../cad-parent'
import { generateMacPart } from '../mac/generate-part'
import type { AssistantExecutionRuntime } from './execute'

export type AssistantRuntimeOptions = {
  cadParent?: 'cad-space' | 'level'
  runCadPrompt?: AssistantExecutionRuntime['runCadPrompt']
}

export const resolveAssistantCadParentId = (cadParent: AssistantRuntimeOptions['cadParent'] = 'cad-space') => {
  if (cadParent === 'cad-space') return resolveCadSpaceParentId()
  return resolveCadSpaceParentId()
}

export const createAssistantRuntime = (
  options: AssistantRuntimeOptions = {},
): AssistantExecutionRuntime => ({
  executeCadBrief: async (brief: CadBrief) => {
    const parentId = resolveAssistantCadParentId(options.cadParent)
    if (!parentId) throw new Error('CAD space is unavailable for brief execution.')
    return executeCadBrief(brief, parentId)
  },
  runCadPrompt: options.runCadPrompt,
  generateMacPart: async (prompt: string) => {
    const result = await generateMacPart(prompt)
    return { bodyIds: result.bodyIds, jobId: result.jobId }
  },
})
