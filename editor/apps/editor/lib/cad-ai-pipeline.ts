import { type CadBrief, CadBriefSchema } from '../../../packages/core/src/schema/cad-brief'
import type { AnyNode } from '../../../packages/core/src/schema/types'
import { useCad } from '@pascal-app/editor'
import { z } from 'zod'
import { shapeCadPlanningContext } from './ai-context-shaping'

type CadPromptContext = {
  nodes: AnyNode[]
  levelId: string | null
  codexThreadId?: string | null
}

type CadBriefResponse = {
  raw: string
  provider: 'fallback' | 'openai' | 'openrouter' | 'codex'
  codexThreadId?: string
}

type CadBriefErrorResponse = {
  error?: string
  provider?: 'fallback' | 'openai' | 'openrouter' | 'codex'
  kind?: string
}

const getCadBriefRouteErrorMessage = (
  payload: CadBriefErrorResponse | null,
  providerLabel: string,
) => {
  if (payload?.kind === 'timeout') {
    return `${providerLabel} CAD planning timed out.`
  }

  if (payload?.kind === 'validation') {
    return `${providerLabel} CAD planning returned an invalid brief.`
  }

  if (payload?.error) {
    return `${providerLabel} CAD planning failed: ${payload.error}`
  }

  return `${providerLabel} CAD planning failed.`
}

export class CadAiBriefValidationError extends Error {
  issues: z.ZodIssue[]

  constructor(error: z.ZodError) {
    super(`CAD brief validation failed: ${error.issues.map((issue) => issue.message).join('; ')}`)
    this.name = 'CadAiBriefValidationError'
    this.issues = error.issues
  }
}

const summarizeNode = (node: AnyNode) => {
  switch (node.type) {
    case 'level':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        level: node.level,
      }
    case 'cad-sketch':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        plane: node.plane,
        entityCount: node.entities.length,
      }
    case 'cad-body':
      return {
        id: node.id,
        type: node.type,
        name: node.name ?? null,
        parentId: node.parentId,
        regenStatus: node.regenStatus,
        sourceSketchIds: node.sourceSketchIds,
      }
    default:
      return {
        id: node.id,
        type: node.type,
        name: 'name' in node ? (node.name ?? null) : null,
        parentId: node.parentId,
      }
  }
}

const getCadAiErrorMessage = (error: unknown) => {
  if (error instanceof CadAiBriefValidationError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'CAD AI planning failed unexpectedly.'
}

const requestCadBrief = async (
  prompt: string,
  context: CadPromptContext,
  retry: number,
): Promise<CadBriefResponse> => {
  const shapedContext = shapeCadPlanningContext(prompt, {
    levelId: context.levelId,
    nodes: context.nodes.map(summarizeNode),
  })

  const response = await fetch('/api/cad/brief', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      retry,
      codexThreadId: context.codexThreadId ?? undefined,
      context: shapedContext,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as CadBriefErrorResponse | null
    const providerLabel =
      payload?.provider === 'openrouter'
        ? 'OpenRouter'
        : payload?.provider === 'openai'
          ? 'OpenAI'
          : payload?.provider === 'codex'
            ? 'Codex'
            : 'CAD AI'

    throw new Error(getCadBriefRouteErrorMessage(payload, providerLabel))
  }

  return response.json() as Promise<CadBriefResponse>
}

export async function promptToCadBrief(
  prompt: string,
  context: CadPromptContext,
): Promise<CadBrief> {
  try {
    for (let retry = 0; retry < 2; retry += 1) {
      const result = await requestCadBrief(prompt, context, retry)

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(result.raw)
      } catch {
        if (retry === 0) continue
        throw new Error('CAD AI returned malformed JSON.')
      }

      try {
        return CadBriefSchema.parse(parsedJson)
      } catch (error) {
        if (error instanceof z.ZodError) {
          if (retry === 0) continue
          throw new CadAiBriefValidationError(error)
        }

        throw error
      }
    }

    throw new Error('CAD AI returned malformed JSON.')
  } catch (error) {
    useCad.getState().showCommandToast(getCadAiErrorMessage(error))
    throw error
  }
}

export type { CadPromptContext }
