'use client'

import { useScene } from '@pascal-app/core'
import { executeAssistantPlan, generateMacPart, getAssistantWorkspaceContext } from '@pascal-app/editor'
import { defineTool, registerTools } from '@nekuda/webmcp-sdk'
import { useEffect } from 'react'

type SceneActionsInput = {
  actions: Record<string, unknown>[]
}

const sceneActionSchema = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      description:
        'Ordered Pistola assistant actions. Read get_pistola_scene_context first. Use the existing action types such as create_wall, create_slab, create_zone, place_item, place_door, place_window, create_level, rename_node, move_target, rotate_target, scale_target, delete_target, create_cad_sketch, add_cad_sketch_entities, extrude_cad_sketch, revolve_cad_sketch, and generate_mac_part. Use $ref_N only to refer to a node created by an earlier action in this same call.',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  required: ['actions'],
  additionalProperties: false,
} as const

const getPistolaSceneContext = defineTool({
  stableKey: 'pistola.scene_context',
  name: 'get_pistola_scene_context',
  title: 'Get Pistola scene context',
  description:
    'Read the current Pistola scene, selection, active level, available catalog assets, and CAD capability. Call this before planning a scene change and again after a mutation to verify the result. This does not change the scene.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  intent: 'answer',
  async execute() {
    return { workspace: getAssistantWorkspaceContext() }
  },
})

const applyPistolaSceneActions = defineTool<SceneActionsInput>({
  stableKey: 'pistola.apply_scene_actions',
  name: 'apply_pistola_scene_actions',
  title: 'Apply Pistola scene actions',
  description:
    'Apply an ordered, validated batch of Pistola scene actions to the live editor. This changes the shared page. Read get_pistola_scene_context first. Use FreeCAD actions for sketches and solids, and generate_mac_part for Multi-Agent-CAD. Return the execution result and inspect the scene afterward.',
  inputSchema: sceneActionSchema,
  intent: 'act',
  async execute({ actions }) {
    const result = await executeAssistantPlan(actions, {
      maxActions: 50,
      reviewConfirmed: true,
      runtime: {
        generateMacPart,
      },
    })

    return {
      result: {
        ok: result.ok,
        completedActionCount: result.completedActionCount,
        createdNodeIds: result.createdNodeIds,
        sketchIds: result.sketchIds,
        bodyIds: result.bodyIds,
        warnings: result.warnings,
        errors: result.errors,
        snapshotRestored: result.snapshotRestored,
      },
      workspace: getAssistantWorkspaceContext(),
    }
  },
})

const undoPistolaSceneChange = defineTool({
  stableKey: 'pistola.undo_scene_change',
  name: 'undo_pistola_scene_change',
  title: 'Undo Pistola scene change',
  description:
    'Undo the most recent editor scene change. Use this to recover from an unwanted scene mutation, then inspect the scene again.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  intent: 'act',
  async execute() {
    const history = useScene.temporal.getState()
    if (history.pastStates.length === 0) {
      return { undone: false, message: 'There is no scene change to undo.' }
    }
    history.undo()
    return { undone: true, workspace: getAssistantWorkspaceContext() }
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
