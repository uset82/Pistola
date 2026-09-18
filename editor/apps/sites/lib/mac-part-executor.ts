'use client'

import { CadBodyNode as CadBodyNodeSchema, type AnyNodeId, useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'

type MacJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

type MacJob = {
  jobId: string
  status: MacJobStatus
  warnings: string[]
  error?: string
  result?: {
    prompt?: string
    qaSummary?: string | null
    warnings?: string[]
    artifacts?: {
      previewUrl?: string | null
      cadUrl?: string | null
      codeUrl?: string | null
      previewArtifactRef?: string | null
      cadArtifactRef?: string | null
    }
    metadata?: Record<string, unknown>
  }
}

const apiBase = () => process.env.NEXT_PUBLIC_PISTOLA_API_BASE?.trim().replace(/\/+$/, '') || ''
const apiUrl = (pathname: string) => `${apiBase()}${pathname}`
const remoteOptions = (init: RequestInit = {}) =>
  apiBase() ? { ...init, credentials: 'include' as const } : init

const getParentId = () => {
  const scene = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (levelId && scene.nodes[levelId as AnyNodeId]) return levelId
  return scene.rootNodeIds.find((id) => scene.nodes[id as AnyNodeId]?.type === 'site') || null
}

const toArtifactUrl = (value: string | null | undefined) =>
  value?.startsWith('/api/mac/artifacts/') ? apiUrl(value) : value || null

const parseJob = (payload: unknown): MacJob => {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const result = data.result && typeof data.result === 'object' ? (data.result as Record<string, unknown>) : null
  const artifacts = result?.artifacts && typeof result.artifacts === 'object'
    ? (result.artifacts as Record<string, unknown>)
    : {}
  const readString = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
  const status: MacJobStatus = ['pending', 'running', 'succeeded', 'failed'].includes(String(data.status))
    ? (data.status as MacJobStatus)
    : 'pending'

  return {
    jobId: readString(data.jobId) || '',
    status,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((value): value is string => typeof value === 'string') : [],
    error: readString(data.error) || undefined,
    result: result
      ? {
          prompt: readString(result.prompt) || undefined,
          qaSummary: readString(result.qaSummary),
          warnings: Array.isArray(result.warnings)
            ? result.warnings.filter((value): value is string => typeof value === 'string')
            : [],
          artifacts: {
            previewUrl: toArtifactUrl(readString(artifacts.previewUrl)),
            cadUrl: toArtifactUrl(readString(artifacts.cadUrl)),
            codeUrl: toArtifactUrl(readString(artifacts.codeUrl)),
            previewArtifactRef: toArtifactUrl(readString(artifacts.previewArtifactRef)),
            cadArtifactRef: toArtifactUrl(readString(artifacts.cadArtifactRef)),
          },
          metadata: result.metadata && typeof result.metadata === 'object'
            ? (result.metadata as Record<string, unknown>)
            : {},
        }
      : undefined,
  }
}

const readResponse = async (response: Response) => {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : `MAC request failed: ${response.status}`
    throw new Error(message)
  }
  return payload
}

const waitForJob = async (jobId: string): Promise<MacJob> => {
  const deadline = Date.now() + 30 * 60_000
  while (Date.now() < deadline) {
    const response = await fetch(apiUrl(`/api/mac/jobs/${encodeURIComponent(jobId)}`), remoteOptions({ cache: 'no-store' }))
    const job = parseJob(await readResponse(response))
    if (job.status === 'succeeded' || job.status === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error('MAC helper timed out while generating the part.')
}

/** Generate one MAC solid through the authenticated Canner API and add it to this browser scene. */
export async function generateHostedMacPart(prompt: string) {
  const parentId = getParentId()
  if (!parentId) throw new Error('Create or select a site or level before generating a MAC part.')
  if (!prompt.trim()) throw new Error('Describe the part you want to generate.')

  useEditor.getState().setPhase('cad')
  const response = await fetch(apiUrl('/api/mac/jobs'), remoteOptions({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt.trim(), mode: 'part' }),
  }))
  const created = parseJob(await readResponse(response))
  if (!created.jobId) throw new Error('Canner did not return a MAC job ID.')

  const completed = await waitForJob(created.jobId)
  const artifacts = completed.result?.artifacts
  if (completed.status !== 'succeeded' || !artifacts?.cadUrl) {
    throw new Error(completed.error || 'MAC helper failed to generate a CAD part.')
  }

  const body = CadBodyNodeSchema.parse({
    name: `MAC: ${(completed.result?.prompt || prompt).slice(0, 48)}`,
    parentId,
    regenStatus: 'idle',
    regenError: null,
    preview: { primitive: 'box', dimensions: [2, 1.2, 1.5], color: '#34d399' },
    operations: [],
    operationHistory: [],
    sourceSketchIds: [],
    artifacts: {
      previewUrl: artifacts.previewUrl || null,
      cadUrl: artifacts.cadUrl || null,
      previewArtifactRef: artifacts.previewArtifactRef || artifacts.previewUrl || null,
      cadArtifactRef: artifacts.cadArtifactRef || artifacts.cadUrl || null,
    },
    previewArtifactRef: artifacts.previewArtifactRef || artifacts.previewUrl || null,
    cadArtifactRef: artifacts.cadArtifactRef || artifacts.cadUrl || null,
    warnings: [...completed.warnings, ...(completed.result?.warnings || [])],
    metadata: {
      cadEngine: 'mac',
      macJobId: completed.jobId,
      prompt: completed.result?.prompt || prompt,
      qaSummary: completed.result?.qaSummary || null,
      codeUrl: artifacts.codeUrl || null,
      macMetadata: completed.result?.metadata || {},
    },
  })

  useScene.getState().createNode(body, parentId as AnyNodeId)
  useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
  useEditor.getState().setActiveSketchId(null)
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)

  return {
    bodyId: body.id,
    bodyIds: [body.id],
    jobId: completed.jobId,
    warnings: completed.warnings,
    qaSummary: completed.result?.qaSummary || null,
  }
}
