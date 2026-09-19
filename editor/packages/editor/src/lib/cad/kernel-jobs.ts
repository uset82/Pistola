/**
 * Worker-ready CAD evaluate. This module stays free of the scene store so it
 * can run on the main thread (tests, Sites) or inside a Worker.
 */
import {
  evaluateCadSolidSpec,
  KERNEL_TRIANGLE_BUDGET,
  type KernelMesh,
} from './local-kernel'

export { KERNEL_TRIANGLE_BUDGET }

export type EvaluateKernelJob = {
  kind: 'evaluate'
  spec: unknown
  budget?: number
}

export type KernelJob = EvaluateKernelJob

export const executeKernelJob = (job: KernelJob): KernelMesh =>
  evaluateCadSolidSpec(job.spec, { budget: job.budget ?? KERNEL_TRIANGLE_BUDGET })

export const runKernelJob = async (job: KernelJob): Promise<KernelMesh> => executeKernelJob(job)
