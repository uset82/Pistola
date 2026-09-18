import type { z } from 'zod'

export type CapabilityDomain =
  | 'workspace'
  | 'viewer'
  | 'structure'
  | 'furnish'
  | 'transform'
  | 'cad'
  | 'history/export'

export type AssistantCapability<TType extends string = string, TAction extends { type: TType } = { type: TType }> = {
  type: TType
  domain: CapabilityDomain
  schema: z.ZodType<TAction>
  safeImmediate?: boolean
  destructive?: boolean
  describe: string
  examples?: string[]
  aliases?: {
    en?: string[]
    es?: string[]
  }
}

export function defineCapability<TType extends string, TAction extends { type: TType }>(
  cap: AssistantCapability<TType, TAction>,
): AssistantCapability<TType, TAction> {
  return cap
}
