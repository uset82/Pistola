import { CadBodyNode as CadBodyNodeSchema, type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../store/use-editor'
import { createMacJob, waitForMacJob } from './client'
import type { MacHelperJobResult } from './contracts'

export type GenerateMacPartResult = {
  bodyId: string | null
  jobId: string
  bodyIds: string[]
  warnings: string[]
  qaSummary?: string | null
}

const getParentIdForCadNodes = () => {
  const scene = useScene.getState()
  const levelId = useViewer.getState().selection.levelId
  if (levelId && scene.nodes[levelId as AnyNodeId]) return levelId

  return (
    scene.rootNodeIds.find((rootId) => scene.nodes[rootId as AnyNodeId]?.type === 'site') ?? null
  )
}

const isMockMacJob = (job: MacHelperJobResult) => {
  const engine = job.result?.metadata?.engine
  const warnings = [...(job.warnings || []), ...((job.result?.warnings as string[]) || [])]
  return engine === 'mac-mock' || warnings.some((warning) => /mock runtime|mac-mock/i.test(warning))
}

const buildMacBodyFromJob = (job: MacHelperJobResult, parentId: string) => {
  const artifacts = job.result?.artifacts || {}
  const cadUrl = artifacts.cadUrl || null
  const mockJob = isMockMacJob(job)
  const previewUrl = mockJob ? null : artifacts.previewUrl || null
  const warnings = [
    ...(job.warnings || []),
    ...((job.result?.warnings as string[]) || []),
    ...(mockJob ? ['placeholder artifact: hosted MAC preview used a primitive box.'] : []),
  ]

  return CadBodyNodeSchema.parse({
    name: `MAC: ${(job.result?.prompt || 'part').slice(0, 48)}`,
    parentId,
    regenStatus: 'idle',
    regenError: null,
    preview: {
      primitive: 'box',
      dimensions: [2, 1.2, 1.5],
      color: '#34d399',
    },
    operations: [],
    operationHistory: [],
    sourceSketchIds: [],
    artifacts: {
      previewUrl,
      cadUrl,
      previewArtifactRef: mockJob ? null : artifacts.previewArtifactRef || previewUrl,
      cadArtifactRef: artifacts.cadArtifactRef || cadUrl,
    },
    previewArtifactRef: mockJob ? null : artifacts.previewArtifactRef || previewUrl,
    cadArtifactRef: artifacts.cadArtifactRef || cadUrl,
    warnings,
    metadata: {
      cadEngine: 'mac',
      macJobId: job.jobId,
      prompt: job.result?.prompt || '',
      qaSummary: job.result?.qaSummary || null,
      codeUrl: artifacts.codeUrl || null,
      macMetadata: job.result?.metadata || {},
    },
  })
}

/** Run Multi-Agent-CAD and import the result as a non-parametric cad-body. */
export async function generateMacPart(prompt: string): Promise<GenerateMacPartResult> {
  const parentId = getParentIdForCadNodes()
  if (!parentId) {
    throw new Error('No active site or level is selected for MAC import.')
  }
  if (!prompt.trim()) {
    throw new Error('Describe the part you want to generate.')
  }

  useEditor.getState().setPhase('cad')

  const created = await createMacJob({ prompt: prompt.trim(), mode: 'part' })
  if (!created.jobId) {
    throw new Error('MAC helper did not return a job ID.')
  }

  const completed = await waitForMacJob(created.jobId)

  if (completed.status !== 'succeeded' || !completed.result?.artifacts?.cadUrl) {
    throw new Error(completed.error || 'MAC helper failed to generate a part.')
  }

  const body = buildMacBodyFromJob(completed, parentId)
  useScene.getState().createNode(body, parentId)
  useViewer.getState().setSelection({ selectedIds: [body.id], zoneId: null })
  useEditor.getState().setActiveSketchId(null)
  useEditor.getState().setMode('select')
  useEditor.getState().setTool(null)

  return {
    bodyId: body.id,
    jobId: completed.jobId,
    bodyIds: [body.id],
    warnings: completed.warnings || [],
    qaSummary: completed.result?.qaSummary,
  }
}
