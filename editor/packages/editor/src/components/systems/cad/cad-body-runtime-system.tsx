'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import {
  type AnyNodeId,
  type CadBodyNode,
  type CadSketchNode,
  normalizeCadBodyOperations,
  useScene,
} from '@pascal-app/core'
import { createCadJob, fetchCadJob } from '../../../lib/cad/client'
import useCad from '../../../store/use-cad'

const CAD_JOB_TIMEOUT_MS = 60_000
const CAD_JOB_POLL_MS = 500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getBodyOperations = (body: CadBodyNode) =>
  normalizeCadBodyOperations(body.operationHistory.length > 0 ? body.operationHistory : body.operations)

const getSourceSketch = (
  body: CadBodyNode,
  nodes: ReturnType<typeof useScene.getState>['nodes'],
): CadSketchNode | null => {
  const sourceSketchId = body.sourceSketchId || body.sourceSketchIds[0]
  const sourceNode = sourceSketchId ? nodes[sourceSketchId as AnyNodeId] : null
  return sourceNode?.type === 'cad-sketch' ? (sourceNode as CadSketchNode) : null
}

const mergeBodyArtifacts = (
  body: CadBodyNode,
  jobResult: Awaited<ReturnType<typeof fetchCadJob>>,
) => {
  const nextArtifacts = {
    ...(body.artifacts || {}),
    ...(jobResult.result?.artifacts || {}),
  }

  return {
    artifacts: nextArtifacts,
    previewArtifactRef:
      nextArtifacts.previewArtifactRef || body.previewArtifactRef || null,
    cadArtifactRef: nextArtifacts.cadArtifactRef || body.cadArtifactRef || null,
  }
}

const mapJobStatusToBodyStatus = (
  status: Awaited<ReturnType<typeof fetchCadJob>>['status'],
): CadBodyNode['regenStatus'] => {
  switch (status) {
    case 'running':
      return 'running'
    case 'pending':
      return 'queued'
    case 'failed':
      return 'error'
    case 'succeeded':
    default:
      return 'idle'
  }
}

async function waitForCadJob(
  jobId: string,
  onStatus: (status: Awaited<ReturnType<typeof fetchCadJob>>['status']) => void,
) {
  const deadline = Date.now() + CAD_JOB_TIMEOUT_MS

  while (Date.now() < deadline) {
    const job = await fetchCadJob(jobId)
    onStatus(job.status)

    if (job.status === 'succeeded' || job.status === 'failed') {
      return job
    }

    await sleep(CAD_JOB_POLL_MS)
  }

  throw new Error('CAD helper timed out while waiting for a job result.')
}

export const CadBodyRuntimeSystem = () => {
  const dirtyNodes = useScene((state) => state.dirtyNodes)
  const clearDirty = useScene((state) => state.clearDirty)
  const activeJobsRef = useRef(new Set<string>())
  const pausedHistoryJobsRef = useRef(0)

  const pauseHistory = () => {
    if (pausedHistoryJobsRef.current === 0) {
      useScene.temporal.getState().pause()
    }

    pausedHistoryJobsRef.current += 1
  }

  const resumeHistory = () => {
    pausedHistoryJobsRef.current = Math.max(0, pausedHistoryJobsRef.current - 1)
    if (pausedHistoryJobsRef.current === 0) {
      useScene.temporal.getState().resume()
    }
  }

  useFrame(() => {
    if (dirtyNodes.size === 0) return

    const { nodes, updateNode } = useScene.getState()

    dirtyNodes.forEach((id) => {
      const node = nodes[id]
      if (!node || node.type !== 'cad-body' || node.regenStatus !== 'pending') return
      if (activeJobsRef.current.has(id)) return

      activeJobsRef.current.add(id)
      pauseHistory()
      updateNode(id as AnyNodeId, {
        regenStatus: 'building',
        regenError: null,
      } as Partial<CadBodyNode>)
      useCad.setState({ helperStatus: 'busy', lastError: null, activeJobId: null })

      const sourceSketch = getSourceSketch(node, nodes)
      const bodyPayload = {
        ...node,
        operations: getBodyOperations(node),
        operationHistory: getBodyOperations(node),
      }

      void createCadJob({
        type: 'regenerate',
        payload: {
          body: bodyPayload,
          sketch: sourceSketch,
          overrides: {},
        },
      })
        .then(async (created) => {
          updateNode(id as AnyNodeId, {
            regenStatus: mapJobStatusToBodyStatus(created.status),
            regenError: null,
          } as Partial<CadBodyNode>)
          useCad.setState({ activeJobId: created.jobId, helperStatus: 'busy', lastError: null })

          return waitForCadJob(created.jobId, (status) => {
            updateNode(id as AnyNodeId, {
              regenStatus: mapJobStatusToBodyStatus(status),
            } as Partial<CadBodyNode>)
          })
        })
        .then((job) => {
          if (job.status === 'failed') {
            throw new Error(job.error || 'CAD helper job failed.')
          }

          const artifactState = mergeBodyArtifacts(node, job)
          const nextOperations = normalizeCadBodyOperations(job.result?.operations || getBodyOperations(node))

          updateNode(id as AnyNodeId, {
            regenStatus: 'idle',
            regenError: null,
            preview: job.result?.preview || node.preview,
            operations: nextOperations,
            operationHistory: nextOperations,
            artifacts: artifactState.artifacts,
            previewArtifactRef: artifactState.previewArtifactRef,
            cadArtifactRef: artifactState.cadArtifactRef,
            warnings: job.warnings || [],
          } as Partial<CadBodyNode>)

          useCad.setState({ helperStatus: 'ready', activeJobId: null, lastError: null })
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? error.message
              : 'CAD helper regeneration failed unexpectedly.'

          updateNode(id as AnyNodeId, {
            regenStatus: 'error',
            regenError: message,
          } as Partial<CadBodyNode>)

          useCad.setState({ helperStatus: 'error', activeJobId: null, lastError: message })
        })
        .finally(() => {
          activeJobsRef.current.delete(id)
          resumeHistory()
          clearDirty(id as AnyNodeId)
        })
    })
  }, 2)

  return null
}
