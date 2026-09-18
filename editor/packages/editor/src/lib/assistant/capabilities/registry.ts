import type { AssistantCapability, CapabilityDomain } from './types'
import { workspaceCapabilities } from './workspace'
import { viewerCapabilities } from './viewer'
import { structureCapabilities } from './structure'
import { furnishCapabilities } from './furnish'
import { transformCapabilities } from './transform'
import { cadCapabilities } from './cad'
import { historyExportCapabilities } from './history-export'

export const capabilities: AssistantCapability[] = [
  ...workspaceCapabilities,
  ...viewerCapabilities,
  ...structureCapabilities,
  ...furnishCapabilities,
  ...transformCapabilities,
  ...cadCapabilities,
  ...historyExportCapabilities,
]

export const capabilityMap: Map<string, AssistantCapability> = new Map(
  capabilities.map((c) => [c.type, c]),
)

export function getCapability(type: string): AssistantCapability | undefined {
  return capabilityMap.get(type)
}

export function getAllCapabilities(): AssistantCapability[] {
  return [...capabilities]
}

export function getCapabilitiesByDomain(domain: CapabilityDomain): AssistantCapability[] {
  return capabilities.filter((c) => c.domain === domain)
}

export const registeredActionTypes = capabilities.map((c) => c.type)

export const registeredSafeImmediateActionTypes = capabilities
  .filter((c) => c.safeImmediate)
  .map((c) => c.type)

export const registeredDestructiveActionTypes = capabilities
  .filter((c) => c.destructive)
  .map((c) => c.type)

export function generateCapabilitySummary(): string {
  return capabilities
    .map((c) => `- \`${c.type}\` [${c.domain}]: ${c.describe}`)
    .join('\n')
}
