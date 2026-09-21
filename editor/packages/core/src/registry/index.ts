import type { ZodTypeAny } from 'zod'

/**
 * Minimal node-plugin registry aligned with pascalorg/editor's loadPlugin
 * contract. Full geometry builders and inspector extensions stay in the
 * local renderers until a deeper core sync lands.
 */

export type NodeDefinition = {
  kind: string
  schema?: ZodTypeAny
  label?: string
}

export type AnyNodeDefinition = NodeDefinition

export type Plugin = {
  id: string
  apiVersion: number
  nodes?: AnyNodeDefinition[]
}

const HOST_API_VERSION = 1 as const

let registryVersion = 0
const registryListeners = new Set<() => void>()
const pluginIdsByKind = new Map<string, string>()

function notifyRegistryChanged(): void {
  registryVersion += 1
  for (const listener of [...registryListeners]) listener()
}

export function getRegistryVersion(): number {
  return registryVersion
}

export function onRegistryChange(listener: () => void): () => void {
  registryListeners.add(listener)
  return () => {
    registryListeners.delete(listener)
  }
}

class NodeRegistryImpl {
  private readonly defs = new Map<string, AnyNodeDefinition>()

  has(kind: string): boolean {
    return this.defs.has(kind)
  }

  get(kind: string): AnyNodeDefinition | undefined {
    return this.defs.get(kind)
  }

  entries(): IterableIterator<[string, AnyNodeDefinition]> {
    return this.defs.entries()
  }

  get size(): number {
    return this.defs.size
  }

  _register(def: AnyNodeDefinition): void {
    if (!def.kind) throw new Error('Node definition requires a kind')
    this.defs.set(def.kind, def)
    notifyRegistryChanged()
  }

  /** Test-only reset. */
  _reset(): void {
    this.defs.clear()
    pluginIdsByKind.clear()
    notifyRegistryChanged()
  }
}

export const nodeRegistry = new NodeRegistryImpl()

export function registerNode(def: AnyNodeDefinition, pluginId = 'pascal:core'): void {
  pluginIdsByKind.set(def.kind, pluginId)
  nodeRegistry._register(def)
}

export async function loadPlugin(plugin: Plugin): Promise<void> {
  if (plugin.apiVersion !== HOST_API_VERSION) {
    throw new Error(
      `Plugin "${plugin.id}" targets apiVersion ${plugin.apiVersion}; host expects ${HOST_API_VERSION}.`,
    )
  }
  for (const def of plugin.nodes ?? []) {
    registerNode(def, plugin.id)
  }
}

export function getNodePluginId(kind: string): string | undefined {
  return pluginIdsByKind.get(kind)
}

export function getSelectableKinds(): string[] {
  return [...nodeRegistry.entries()].map(([kind]) => kind)
}
