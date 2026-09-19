#!/usr/bin/env node
import { createBridgeDriver } from './drivers/bridge.ts'
import { createBrowserDriver } from './drivers/browser.ts'
import type { PageDriver } from './drivers/types.ts'
import { createStdioServer, type McpTool } from './stdio.ts'

const assistantToolsEnabled = process.env.PISTOLA_MCP_ASSISTANT_TOOLS === '1'
const transportName = process.env.PISTOLA_TRANSPORT === 'bridge' ? 'bridge' : 'browser'

const jsonResult = (data: unknown, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  isError,
})

const imageResult = (data: string, mime = 'image/png', extra?: unknown) => ({
  content: [
    { type: 'image', data, mimeType: mime },
    ...(extra ? [{ type: 'text', text: JSON.stringify(extra, null, 2) }] : []),
  ],
})

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: true,
})

let driverPromise: Promise<PageDriver> | null = null

const getDriver = () => {
  driverPromise ??= transportName === 'bridge' ? createBridgeDriver() : createBrowserDriver()
  return driverPromise
}

const invoke = async (method: string, args?: unknown) => {
  const driver = await getDriver()
  return driver.invoke(method, args)
}

const unwrap = (value: unknown) => {
  if (value && typeof value === 'object' && 'data' in value) return (value as { data: unknown }).data
  if (value && typeof value === 'object' && 'output' in value) return (value as { output: unknown }).output
  return value
}

const runActions = async (actions: unknown[], confirmDestructive = false) =>
  unwrap(await invoke('run', [actions, { confirmDestructive }]))

const tools: McpTool[] = [
  {
    name: 'pistola_status',
    description: 'Report the current Pistola target, page API version, transport, and forbidden-request count.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        const driver = await getDriver()
        const opened = await driver.open()
        return jsonResult({
          ok: true,
          target: driver.target,
          transport: driver.kind,
          apiVersion: opened.apiVersion || driver.apiVersion,
          signInRequired: opened.signInRequired,
          forbiddenRequestCount: driver.forbiddenCount(),
          forbiddenHits: driver.forbiddenHits(),
          assistantTools: assistantToolsEnabled,
        })
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_open',
    description: 'Open or reuse the Pistola workspace tab and wait until window.pistola.invoke is ready.',
    inputSchema: objectSchema({ target: { type: 'string' } }),
    handler: async (args) => {
      try {
        if (typeof args.target === 'string') process.env.PISTOLA_TARGET = args.target
        const driver = await getDriver()
        const opened = await driver.open()
        return jsonResult({ ...opened, target: driver.target, transport: driver.kind })
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_manual',
    description: 'Read the page-level Pistola action grammar, primitive ids, and solid-spec rules.',
    inputSchema: objectSchema({ filter: { type: 'string' } }),
    handler: async (args) => {
      try {
        const manual = unwrap(await invoke('manual')) as Record<string, unknown>
        if (typeof args.filter !== 'string') return jsonResult(manual)
        const needle = args.filter.toLowerCase()
        const capabilities = Array.isArray(manual.capabilities)
          ? manual.capabilities.filter((item) => JSON.stringify(item).toLowerCase().includes(needle))
          : []
        return jsonResult({ ...manual, capabilities })
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_inspect',
    description: 'Inspect the live scene: nodes, selection, and counts.',
    inputSchema: objectSchema({
      levelId: { type: 'string' },
      type: { type: 'string' },
      nameQuery: { type: 'string' },
      limit: { type: 'number' },
    }),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('inspect', args)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_export_scene',
    description: 'Read-only dump of every scene node with ids, transforms, and bounds. Does not mutate the scene.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        return jsonResult(unwrap(await invoke('exportScene')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_get_nodes',
    description: 'Read specific scene nodes by id.',
    inputSchema: objectSchema({ nodeIds: { type: 'array', items: { type: 'string' } } }, ['nodeIds']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('getNodes', [args.nodeIds])))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_measure',
    description: 'Measure distances, bounds, or zone occupancy in the live scene.',
    inputSchema: objectSchema({ mode: { type: 'string' } }, ['mode']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('measure', args)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_search_catalog',
    description: 'Search catalog items, including primitive-* ids.',
    inputSchema: objectSchema({ query: { type: 'string' } }),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('searchCatalog', typeof args.query === 'string' ? args.query : '')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_list_recipes',
    description: 'List built-in creation recipes.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        return jsonResult(unwrap(await invoke('listRecipes')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_validate',
    description: 'Validate a typed action batch without mutating the scene.',
    inputSchema: objectSchema({ actions: { type: 'array' } }, ['actions']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('validate', [args.actions])))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_examples',
    description:
      'Search or instantiate retrieval examples (techniques, subassemblies, recipes, library). action=search|get.',
    inputSchema: objectSchema({
      action: { type: 'string' },
      query: { type: 'string' },
      id: { type: 'string' },
      params: { type: 'object' },
      at: { type: 'array' },
      kind: { type: 'string' },
    }),
    handler: async (args) => {
      try {
        const action = typeof args.action === 'string' ? args.action : 'search'
        if (action === 'get') {
          if (typeof args.id !== 'string') throw new Error('pistola_examples get requires id.')
          return jsonResult(
            unwrap(
              await invoke('examples.get', {
                id: args.id,
                params: args.params,
                at: args.at,
              }),
            ),
          )
        }
        return jsonResult(unwrap(await invoke('examples.search', { query: args.query, kind: args.kind })))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_blueprint_check',
    description:
      'Validate a blueprint v2 before building (window.pistola.invoke plan.check). Returns structured issues (PART_MISSING, RELATION_VIOLATED, ACCEPTANCE_FAILED).',
    inputSchema: objectSchema({ blueprint: { type: 'object' } }, ['blueprint']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('plan.check', args.blueprint)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_check',
    description:
      'Run the structural checker on the live scene. Returns {ok, errorCount, warningCount, issues[]}. Also embedded on pistola_run and pistola_task_run_step.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        return jsonResult(unwrap(await invoke('checkStructure')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_run',
    description:
      'Execute a typed, validated action batch through window.pistola.invoke. confirmDestructive defaults to false.',
    inputSchema: objectSchema(
      { actions: { type: 'array' }, confirmDestructive: { type: 'boolean' } },
      ['actions'],
    ),
    handler: async (args) => {
      try {
        return jsonResult(await runActions(args.actions as unknown[], args.confirmDestructive === true))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_execute',
    description: 'Deprecated alias of pistola_run. Still enforces confirmDestructive.',
    inputSchema: objectSchema(
      { actions: { type: 'array' }, confirmDestructive: { type: 'boolean' } },
      ['actions'],
    ),
    handler: async (args) => {
      try {
        return jsonResult({
          deprecated: true,
          aliasOf: 'pistola_run',
          result: await runActions(args.actions as unknown[], args.confirmDestructive === true),
        })
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_screenshot',
    description: 'Capture the live viewport canvas as a PNG.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        const driver = await getDriver()
        const shot = await driver.screenshot()
        return imageResult(shot.data, shot.mime, { forbiddenRequestCount: driver.forbiddenCount() })
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_undo',
    description: 'Undo the last scene mutation.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        return jsonResult(unwrap(await invoke('undo')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_redo',
    description: 'Redo the last undone scene mutation.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        return jsonResult(unwrap(await invoke('redo')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_wait_idle',
    description: 'Wait until CAD/MAC regeneration is idle.',
    inputSchema: objectSchema({ timeoutMs: { type: 'number' } }),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('waitForIdle', typeof args.timeoutMs === 'number' ? args.timeoutMs : 20_000)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_camera',
    description: 'Run a single camera action such as orbit_camera, camera_top_view, or focus_camera_on_nodes.',
    inputSchema: objectSchema({ action: { type: 'object' } }, ['action']),
    handler: async (args) => {
      try {
        return jsonResult(await runActions([args.action], false))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_create',
    description:
      'Create a checkbox operator plan before any scene mutation. Pass {blueprint} to run plan.check and generate one step per part.',
    inputSchema: objectSchema({ plan: { type: 'object' } }, ['plan']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.create', args.plan)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_get',
    description: 'Read the active operator plan.',
    inputSchema: objectSchema(),
    handler: async () => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.get')))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_run_step',
    description: 'Validate and execute one plan step through taskPlan.runStep.',
    inputSchema: objectSchema(
      {
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        stepId: { type: 'string' },
        actions: { type: 'array' },
        confirmDestructive: { type: 'boolean' },
        strict: { type: 'boolean' },
      },
      ['planId', 'phaseId', 'stepId', 'actions'],
    ),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.runStep', args)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_update_step',
    description: 'Mark observation or validation steps done. Execution steps must use pistola_task_run_step.',
    inputSchema: objectSchema(
      {
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        stepId: { type: 'string' },
        status: { type: 'string' },
        evidence: { type: 'object' },
      },
      ['planId', 'phaseId', 'stepId', 'status'],
    ),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.updateStep', args)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_restore_best',
    description: 'Restore the plan snapshot with the fewest structural errors.',
    inputSchema: objectSchema({ planId: { type: 'string' } }, ['planId']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.restoreBest', args.planId)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_complete',
    description: 'Complete the active operator plan with a summary.',
    inputSchema: objectSchema({ planId: { type: 'string' }, summary: { type: 'string' } }, ['planId', 'summary']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.complete', [args.planId, args.summary])))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_undo',
    description: 'Restore the scene snapshot captured before the plan started.',
    inputSchema: objectSchema({ planId: { type: 'string' } }, ['planId']),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.undo', args.planId)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
  {
    name: 'pistola_task_clear',
    description: 'Clear the active operator plan.',
    inputSchema: objectSchema({ planId: { type: 'string' } }),
    handler: async (args) => {
      try {
        return jsonResult(unwrap(await invoke('taskPlan.clear', args.planId)))
      } catch (error) {
        return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
      }
    },
  },
]

if (assistantToolsEnabled) {
  const prefix = "[Uses Pistola's in-app AI model, not the IDE's model] "
  const baseUrl = () => (process.env.PISTOLA_BASE_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '')
  const assistantFetch = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        typeof (payload as { error?: string }).error === 'string'
          ? (payload as { error: string }).error
          : `Assistant ${path} failed (${response.status}).`,
      )
    }
    return payload
  }
  tools.push(
    {
      name: 'pistola_assistant_plan',
      description: `${prefix}Ask Pistola's in-app model to propose actions. IDE agents should not use this.`,
      inputSchema: objectSchema({ prompt: { type: 'string' }, chatMode: { type: 'string' } }, ['prompt']),
      handler: async (args) => {
        try {
          return jsonResult(
            await assistantFetch('/api/assistant/plan', {
              method: 'POST',
              body: JSON.stringify({ prompt: args.prompt, chatMode: args.chatMode ?? 'create' }),
            }),
          )
        } catch (error) {
          return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
        }
      },
    },
    {
      name: 'pistola_assistant_chat',
      description: `${prefix}Send a natural-language turn to Pistola's in-app chat.`,
      inputSchema: objectSchema({ prompt: { type: 'string' }, chatMode: { type: 'string' } }, ['prompt']),
      handler: async (args) => {
        try {
          return jsonResult(
            await assistantFetch('/api/assistant/turn', {
              method: 'POST',
              body: JSON.stringify({ prompt: args.prompt, chatMode: args.chatMode ?? 'create' }),
            }),
          )
        } catch (error) {
          return jsonResult({ error: error instanceof Error ? error.message : String(error) }, true)
        }
      },
    },
  )
}

createStdioServer(tools)
