#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const DEFAULT_BASE_URL = process.env.PISTOLA_BASE_URL || 'http://127.0.0.1:3002'
const LOCAL_TOKEN = process.env.PISTOLA_LOCAL_API_TOKEN?.trim() || ''

const textResult = (text: string, isError = false) => ({
  content: [{ type: 'text' as const, text }],
  ...(isError ? { isError: true } : {}),
})

const jsonResult = (value: unknown, isError = false) =>
  textResult(JSON.stringify(value, null, 2), isError)

async function pistolaFetch(pathname: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (LOCAL_TOKEN) {
    headers.set('Authorization', `Bearer ${LOCAL_TOKEN}`)
  }

  const response = await fetch(`${DEFAULT_BASE_URL}${pathname}`, {
    ...init,
    headers,
    cache: 'no-store',
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : typeof payload === 'string'
          ? payload
          : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}

async function waitForCommandResult(sessionId: string, commandId: string, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const payload = (await pistolaFetch(
      `/api/workspace/command?sessionId=${encodeURIComponent(sessionId)}&commandId=${encodeURIComponent(commandId)}`,
    )) as { pending?: boolean; result?: unknown }
    if (!payload.pending && payload.result) {
      return payload.result
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('Timed out waiting for the live editor to execute the command.')
}

async function waitForMacJob(jobId: string, timeoutMs = 1_800_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = (await pistolaFetch(`/api/mac/jobs/${encodeURIComponent(jobId)}`)) as {
      status?: string
      error?: string
    }
    if (job.status === 'succeeded' || job.status === 'failed') {
      return job
    }
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  throw new Error('Timed out waiting for MAC job.')
}

const server = new McpServer({
  name: 'pistola',
  version: '0.1.0',
})

server.tool(
  'pistola_status',
  'Report Pistola helper health, installed AI model, and active workspace session.',
  {},
  async () => {
    try {
      const [workspace, cadHealth, macHealth, aiConfig] = await Promise.all([
        pistolaFetch('/api/workspace/session'),
        pistolaFetch('/api/cad/health').catch((error: Error) => ({ error: error.message })),
        pistolaFetch('/api/mac/health').catch((error: Error) => ({ error: error.message })),
        pistolaFetch('/api/ai/config').catch((error: Error) => ({ error: error.message })),
      ])
      return jsonResult({
        baseUrl: DEFAULT_BASE_URL,
        workspace,
        cadHealth,
        macHealth,
        aiConfig,
      })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_configure_model',
  'Install the user OpenRouter/OpenAI model used by assistant, CAD planning, and MAC.',
  {
    provider: z.enum(['openrouter', 'openai']).default('openrouter'),
    apiKey: z.string().min(1),
    model: z.string().default('openrouter/free'),
    baseUrl: z.string().default('https://openrouter.ai/api/v1'),
  },
  async ({ provider, apiKey, model, baseUrl }) => {
    try {
      const saved = await pistolaFetch('/api/ai/config', {
        method: 'PUT',
        body: JSON.stringify({ provider, apiKey, model, baseUrl }),
      })
      const tested = await pistolaFetch('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({ provider, apiKey, model, baseUrl }),
      }).catch((error: Error) => ({ ok: false, error: error.message }))
      return jsonResult({ saved, tested })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_get_workspace',
  'Get the live editor workspace snapshot (phase, selection, node count).',
  {},
  async () => {
    try {
      return jsonResult(await pistolaFetch('/api/workspace/session'))
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_plan',
  'Plan assistant actions from a natural-language prompt without executing them.',
  {
    prompt: z.string().min(1),
    chatMode: z.enum(['ask', 'create', 'refine']).default('create'),
  },
  async ({ prompt, chatMode }) => {
    try {
      const payload = await pistolaFetch('/api/assistant/plan', {
        method: 'POST',
        body: JSON.stringify({ prompt, chatMode }),
      })
      return jsonResult(payload)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_execute',
  'Enqueue validated assistant actions for the live editor tab to execute.',
  {
    actions: z.array(z.record(z.string(), z.unknown())).min(1),
    sessionId: z.string().optional(),
  },
  async ({ actions, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({ actions, sessionId }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult({ enqueued, result })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_chat',
  'Plan and execute a prompt in the live editor workspace (requires an open editor tab).',
  {
    prompt: z.string().min(1),
    chatMode: z.enum(['ask', 'create', 'refine']).default('create'),
    sessionId: z.string().optional(),
  },
  async ({ prompt, chatMode, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({ prompt, chatMode, sessionId }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult({ enqueued, result })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_generate_mac',
  'Start Multi-Agent-CAD part generation, wait for artifacts, then import into the live scene when a session exists.',
  {
    prompt: z.string().min(1),
    importIntoScene: z.boolean().default(true),
    sessionId: z.string().optional(),
  },
  async ({ prompt, importIntoScene, sessionId }) => {
    try {
      if (importIntoScene) {
        const enqueued = (await pistolaFetch('/api/workspace/command', {
          method: 'POST',
          body: JSON.stringify({ prompt, generateMac: true, sessionId }),
        })) as { sessionId: string; command: { id: string } }
        const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id, 1_800_000)
        return jsonResult({ mode: 'import', enqueued, result })
      }

      const created = (await pistolaFetch('/api/mac/jobs', {
        method: 'POST',
        body: JSON.stringify({ prompt, mode: 'part' }),
      })) as { jobId: string }
      const job = await waitForMacJob(created.jobId)
      return jsonResult({ mode: 'artifacts-only', created, job })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_generate_cad',
  'Generate a FreeCAD CadBrief from a prompt (planning only). Execute via pistola_execute with execute_cad_brief.',
  {
    prompt: z.string().min(1),
  },
  async ({ prompt }) => {
    try {
      const brief = await pistolaFetch('/api/cad/brief', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      })
      return jsonResult(brief)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_get_job',
  'Fetch a FreeCAD CAD job or MAC job by id.',
  {
    engine: z.enum(['cad', 'mac']).default('mac'),
    jobId: z.string().min(1),
  },
  async ({ engine, jobId }) => {
    try {
      const path =
        engine === 'mac'
          ? `/api/mac/jobs/${encodeURIComponent(jobId)}`
          : `/api/cad/jobs/${encodeURIComponent(jobId)}`
      return jsonResult(await pistolaFetch(path))
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_list_artifacts',
  'Describe artifact URLs from a completed MAC job payload (pass jobId).',
  {
    jobId: z.string().min(1),
  },
  async ({ jobId }) => {
    try {
      const job = (await pistolaFetch(`/api/mac/jobs/${encodeURIComponent(jobId)}`)) as {
        result?: { artifacts?: Record<string, unknown> }
      }
      return jsonResult({
        jobId,
        artifacts: job.result?.artifacts || {},
        note: 'Artifact paths are served under /api/mac/artifacts/*',
      })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_inspect_scene',
  'Inspect nodes in the live scene with optional filtering by levelId, node type, name query, and pagination.',
  {
    levelId: z.string().optional(),
    type: z.string().optional(),
    nameQuery: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
    sessionId: z.string().optional(),
  },
  async ({ levelId, type, nameQuery, limit, offset, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'read',
          tool: 'inspect_scene',
          arguments: { levelId, type, nameQuery, limit, offset },
          sessionId,
        }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult(result)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_get_nodes',
  'Retrieve detailed summaries for specific node IDs from the live scene.',
  {
    nodeIds: z.array(z.string()).min(1),
    sessionId: z.string().optional(),
  },
  async ({ nodeIds, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'read',
          tool: 'get_nodes',
          arguments: { nodeIds },
          sessionId,
        }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult(result)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_measure',
  'Measure distances, bounding boxes, wall lengths, zone areas, or free floor space in the live editor scene.',
  {
    mode: z.enum(['distance', 'bounds', 'wall_length', 'zone_area', 'free_floor_space']),
    nodeIds: z.array(z.string()).optional(),
    pointA: z.tuple([z.number(), z.number(), z.number()]).optional(),
    pointB: z.tuple([z.number(), z.number(), z.number()]).optional(),
    sessionId: z.string().optional(),
  },
  async ({ mode, nodeIds, pointA, pointB, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'read',
          tool: 'measure',
          arguments: { mode, nodeIds, pointA, pointB },
          sessionId,
        }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult(result)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_search_catalog',
  'Search the assistant catalog of furniture, architectural, and equipment items.',
  {
    query: z.string().default(''),
    category: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    sessionId: z.string().optional(),
  },
  async ({ query, category, limit, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'read',
          tool: 'search_catalog',
          arguments: { query, category, limit },
          sessionId,
        }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult(result)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_list_capabilities',
  'List registered assistant capabilities (actions, domains, safety flags, and examples).',
  {
    domain: z
      .enum(['workspace', 'viewer', 'structure', 'furnish', 'transform', 'cad', 'history'])
      .optional(),
    sessionId: z.string().optional(),
  },
  async ({ domain, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'read',
          tool: 'list_capabilities',
          arguments: { domain },
          sessionId,
        }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult(result)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_list_recipes',
  'List available parametric creation recipes (heart, airplane, board, robot arm, car, table, etc.).',
  {
    sessionId: z.string().optional(),
  },
  async ({ sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({
          type: 'read',
          tool: 'list_recipes',
          arguments: {},
          sessionId,
        }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id)
      return jsonResult(result)
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

server.tool(
  'pistola_agent',
  'Run the full agentic operator loop in the live editor workspace: observes the scene, measures geometry, executes actions, and returns the timeline and final turn.',
  {
    prompt: z.string().min(1),
    chatMode: z.enum(['ask', 'create', 'refine']).default('create'),
    sessionId: z.string().optional(),
  },
  async ({ prompt, chatMode, sessionId }) => {
    try {
      const enqueued = (await pistolaFetch('/api/workspace/command', {
        method: 'POST',
        body: JSON.stringify({ type: 'agent', prompt, chatMode, sessionId }),
      })) as { sessionId: string; command: { id: string } }
      const result = await waitForCommandResult(enqueued.sessionId, enqueued.command.id, 600_000)
      return jsonResult({ enqueued, result })
    } catch (error) {
      return textResult(error instanceof Error ? error.message : String(error), true)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)

