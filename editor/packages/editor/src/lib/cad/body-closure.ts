import {
  normalizeCadBodyOperations,
  type CadBodyNode,
  type CadBodyOperation,
} from '@pascal-app/core'

/**
 * The payload a named helper job needs.
 *
 * Inspection and material assignment both rebuild bodies from their operation
 * timelines, so the helper needs the whole dependency graph: each target body,
 * every boolean tool body it references, and every sketch those operations
 * use. Sending only the roots would fail with "missing from the job's body
 * closure".
 */
export type BodySnapshotPayload = {
  id: string
  name: string
  operations: CadBodyOperation[]
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type BodyClosure = {
  /** Bodies the job acts on, in the order the caller asked for them. */
  bodyIds: string[]
  /** Clearance only: bodies measured against, but not reported themselves. */
  againstBodyIds: string[]
  /** Roots plus boolean tool bodies, keyed by node id. */
  bodies: Record<string, BodySnapshotPayload>
  sketches: Record<string, Record<string, unknown>>
}

type SceneNode = { type?: string } & Record<string, unknown>

const asTriple = (
  value: unknown,
  fallback: [number, number, number],
): [number, number, number] => {
  if (!Array.isArray(value) || value.length < 3) return fallback
  const [x, y, z] = value
  return typeof x === 'number' && typeof y === 'number' && typeof z === 'number'
    ? [x, y, z]
    : fallback
}

const toolBodyIdsOf = (operation: CadBodyOperation): string[] => {
  const params = operation.params
  const fromParams =
    params && typeof params === 'object' && Array.isArray((params as { toolBodyIds?: unknown }).toolBodyIds)
      ? ((params as { toolBodyIds: unknown[] }).toolBodyIds as unknown[])
      : []
  const operationToolBodyIds = (operation as { toolBodyIds?: unknown }).toolBodyIds
  const fromOperation = Array.isArray(operationToolBodyIds) ? operationToolBodyIds : []

  return [...fromOperation, ...fromParams]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .filter((value, index, values) => values.indexOf(value) === index)
}

/**
 * Collect the bodies, tool bodies and sketches a named job needs.
 *
 * With no `bodyIds`, every CAD body is included, excluding any named in
 * `againstBodyIds` (a clearance baseline is not itself the subject).
 */
export const collectBodyClosure = (
  nodes: Record<string, SceneNode>,
  options: { bodyIds?: string[]; againstBodyIds?: string[] } = {},
): BodyClosure => {
  const againstBodyIds = (options.againstBodyIds ?? []).filter(
    (id) => nodes[id]?.type === 'cad-body',
  )

  const requested =
    options.bodyIds && options.bodyIds.length > 0
      ? options.bodyIds
      : Object.keys(nodes).filter(
          (id) => nodes[id]?.type === 'cad-body' && !againstBodyIds.includes(id),
        )

  const bodyIds = requested.filter((id) => nodes[id]?.type === 'cad-body')
  const bodies: Record<string, BodySnapshotPayload> = {}
  const sketches: Record<string, Record<string, unknown>> = {}

  const visit = (id: string) => {
    if (bodies[id]) return
    const node = nodes[id]
    if (!node || node.type !== 'cad-body') return

    const body = node as unknown as CadBodyNode
    const history =
      Array.isArray(body.operationHistory) && body.operationHistory.length > 0
        ? body.operationHistory
        : (body.operations ?? [])
    const operations = normalizeCadBodyOperations(history)

    bodies[id] = {
      id,
      name: typeof body.name === 'string' ? body.name : id,
      operations,
      position: asTriple(body.position, [0, 0, 0]),
      rotation: asTriple(body.rotation, [0, 0, 0]),
      scale: asTriple(body.scale, [1, 1, 1]),
    }

    for (const operation of operations) {
      const sketchId = 'sketchId' in operation ? operation.sketchId : null
      if (typeof sketchId === 'string' && nodes[sketchId]?.type === 'cad-sketch') {
        sketches[sketchId] = nodes[sketchId] as Record<string, unknown>
      }
      for (const toolBodyId of toolBodyIdsOf(operation)) {
        visit(toolBodyId)
      }
    }
  }

  for (const id of [...bodyIds, ...againstBodyIds]) {
    visit(id)
  }

  return { bodyIds, againstBodyIds, bodies, sketches }
}
