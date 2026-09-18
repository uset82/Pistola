import {
  CadBodyNode as CadBodyNodeSchema,
  type AnyNodeId,
  useScene,
} from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { createMacJob, waitForMacJob } from './mac-client'
import type { MacHelperJobResult } from './mac-contracts'

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

const buildMacBodyFromJob = (job: MacHelperJobResult, parentId: string) => {
  const artifacts = job.result?.artifacts || {}
  const previewUrl = artifacts.previewUrl || null
  const cadUrl = artifacts.cadUrl || null

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
      previewArtifactRef: artifacts.previewArtifactRef || previewUrl,
      cadArtifactRef: artifacts.cadArtifactRef || cadUrl,
    },
    previewArtifactRef: artifacts.previewArtifactRef || previewUrl,
    cadArtifactRef: artifacts.cadArtifactRef || cadUrl,
    warnings: [...(job.warnings || []), ...((job.result?.warnings as string[]) || [])],
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

/**
 * Run Multi-Agent-CAD generation and import the result as a non-parametric cad-body.
 * Prefers MAC GLB for viewport preview; STEP is kept as the CAD artifact.
 */
export async function generateMacPart(prompt: string): Promise<GenerateMacPartResult> {
  const parentId = getParentIdForCadNodes()
  if (!parentId) {
    throw new Error('No active site or level is selected for MAC import.')
  }

  useEditor.getState().setPhase('cad')

  const created = await createMacJob({ prompt, mode: 'part' })
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
