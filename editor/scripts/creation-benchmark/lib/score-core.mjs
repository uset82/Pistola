import { analyzeSupport, dimensionError, orthographicIoU, partCoverage, unionBox } from './geometry.mjs'

const emptyMetrics = (slug, set) => ({
  slug,
  set,
  runnableFirstTry: 0,
  runnableFinal: 0,
  retriesPerPart: 0,
  floatingParts: [],
  ungroundedParts: [],
  belowFloorParts: [],
  overallDimensionError: null,
  perPartDimensionError: [],
  partCoverage: { required: 0, found: 0, missing: [], ratio: 0 },
  iou: { mean: 0, views: { front: 0, side: 0, top: 0 } },
  rubric: null,
  toolCalls: 0,
  timeMs: 0,
})

export const scoreScene = ({
  slug,
  set,
  prompt,
  goldParts,
  sceneParts,
  runnableFirstTry = true,
  runnableFinal = true,
  retriesPerPart = 0,
  toolCalls = 0,
  timeMs = 0,
  rubric = null,
}) => {
  const metrics = emptyMetrics(slug, set)
  metrics.runnableFirstTry = runnableFirstTry ? 1 : 0
  metrics.runnableFinal = runnableFinal ? 1 : 0
  metrics.retriesPerPart = retriesPerPart
  metrics.toolCalls = toolCalls
  metrics.timeMs = timeMs
  metrics.rubric = rubric

  const support = analyzeSupport(sceneParts)
  metrics.floatingParts = support.floating
  metrics.ungroundedParts = support.ungrounded
  metrics.belowFloorParts = support.belowFloor

  const expectedOverall = prompt?.overall_m
  const actualOverall = unionBox(sceneParts.map((part) => part.box))?.size ?? null
  metrics.overallDimensionError = dimensionError(actualOverall, expectedOverall)

  const required = (prompt?.parts ?? []).map((part) => (typeof part === 'string' ? part : part.id ?? part.name))
  metrics.partCoverage = partCoverage(required, sceneParts)

  metrics.perPartDimensionError = (goldParts ?? []).map((gold) => {
    const match = sceneParts.find((part) => part.name === gold.name || part.id === gold.id)
    return {
      name: gold.name,
      error: match ? dimensionError(match.box.size, gold.box.size) : null,
    }
  })

  metrics.iou = orthographicIoU(
    (goldParts ?? []).map((part) => part.box),
    sceneParts.map((part) => part.box),
  )

  return {
    ...metrics,
    actualOverall_m: actualOverall,
    partCount: sceneParts.length,
  }
}

export const summarizeScores = (runs) => {
  const n = runs.length || 1
  const mean = (pick) => runs.reduce((sum, run) => sum + pick(run), 0) / n
  return {
    count: runs.length,
    runnableFirstTry: mean((run) => run.runnableFirstTry),
    runnableFinal: mean((run) => run.runnableFinal),
    retriesPerPart: mean((run) => run.retriesPerPart),
    floatingRate: mean((run) => (run.floatingParts.length === 0 ? 0 : 1)),
    zeroFloatingShare: mean((run) => (run.floatingParts.length === 0 ? 1 : 0)),
    overallDimensionError: mean((run) => run.overallDimensionError?.mean ?? 1),
    partCoverage: mean((run) => run.partCoverage.ratio),
    iou: mean((run) => run.iou.mean),
    rubric: runs.every((run) => run.rubric == null)
      ? null
      : mean((run) => (typeof run.rubric === 'number' ? run.rubric : 0)),
    toolCalls: mean((run) => run.toolCalls),
    timeMs: mean((run) => run.timeMs),
  }
}
