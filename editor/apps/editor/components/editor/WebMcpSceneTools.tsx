'use client'

import { createPistolaAgentApi, getAssistantWorkspaceContext } from '@pascal-app/editor'
import { defineTool, registerTools } from '@nekuda/webmcp-sdk'
import { useEffect } from 'react'

const api = () => (typeof window !== 'undefined' && window.pistola ? window.pistola : createPistolaAgentApi())

const getPistolaSceneContext = defineTool({
  stableKey: 'pistola.scene_context',
  name: 'get_pistola_scene_context',
  title: 'Get Pistola scene context',
  description:
    'Read the current Pistola scene, selection, catalog, and capabilities. Call this before planning a scene change.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  intent: 'answer',
  async execute() {
    return { workspace: getAssistantWorkspaceContext(), manual: await api().manual() }
  },
})

const applyPistolaSceneActions = defineTool<{ actions: unknown[] }>({
  stableKey: 'pistola.apply_scene_actions',
  name: 'apply_pistola_scene_actions',
  title: 'Apply Pistola scene actions',
  description:
    'Apply an ordered, validated batch of Pistola scene actions through window.pistola.run. This changes the shared page.',
  inputSchema: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: 25,
        items: { type: 'object', additionalProperties: true },
      },
    },
    required: ['actions'],
    additionalProperties: false,
  },
  intent: 'act',
  async execute({ actions }) {
    const result = await api().run(actions, { confirmDestructive: true })
    return { result, workspace: getAssistantWorkspaceContext() }
  },
})

const undoPistolaSceneChange = defineTool({
  stableKey: 'pistola.undo_scene_change',
  name: 'undo_pistola_scene_change',
  title: 'Undo Pistola scene change',
  description: 'Undo the most recent editor scene change.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  intent: 'act',
  async execute() {
    return api().undo()
  },
})

export function WebMcpSceneTools() {
  useEffect(() => {
    const registration = registerTools(
      [getPistolaSceneContext, applyPistolaSceneActions, undoPistolaSceneChange],
      { telemetry: false },
    )
    return () => registration.unregister()
  }, [])

  return null
}
