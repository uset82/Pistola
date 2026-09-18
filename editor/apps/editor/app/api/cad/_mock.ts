import { randomUUID } from 'node:crypto'

type MockJob = {
  jobId: string
  type: string
  status: 'succeeded' | 'pending' | 'failed'
  warnings: string[]
  error?: string
  result?: any
}

const jobs = new Map<string, MockJob>()

export const mockCadHelperInfo = {
  status: 'ready' as const,
  runtime: 'mock',
  engine: 'mock-freecad',
  version: '0.1.0',
  helperUrl: 'http://127.0.0.1:7878',
}

function sanitizeName(name: string) {
  return String(name || 'cad-body')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function getEntityPoints(entity: any): number[][] {
  switch (entity?.kind) {
    case 'line':
      return [entity.start, entity.end]
    case 'rectangle': {
      const halfWidth = (entity.width || 2) / 2
      const halfHeight = (entity.height || 1.5) / 2
      const center = entity.center || [0, 0]
      return [
        [center[0] - halfWidth, center[1] - halfHeight],
        [center[0] + halfWidth, center[1] - halfHeight],
        [center[0] + halfWidth, center[1] + halfHeight],
        [center[0] - halfWidth, center[1] + halfHeight],
      ]
    }
    case 'circle': {
      const radius = entity.radius || 1
      const center = entity.center || [0, 0]
      return [
        [center[0] - radius, center[1] - radius],
        [center[0] + radius, center[1] + radius],
      ]
    }
    case 'arc': {
      const radius = entity.radius || 1
      const center = entity.center || [0, 0]
      return [
        [center[0] - radius, center[1] - radius],
        [center[0] + radius, center[1] + radius],
      ]
    }
    case 'polyline':
      return entity.points || []
    default:
      return [
        [-1, -0.75],
        [1, 0.75],
      ]
  }
}

function getSketchBounds(sketch: any) {
  const points = (sketch?.entities || []).flatMap(getEntityPoints)
  if (!points.length) {
    return { width: 2, depth: 1.5 }
  }

  const xs = points.map((value: number[]) => value[0] ?? 0)
  const ys = points.map((value: number[]) => value[1] ?? 0)

  return {
    width: Math.max(Math.max(...xs) - Math.min(...xs), 0.5),
    depth: Math.max(Math.max(...ys) - Math.min(...ys), 0.5),
  }
}

function makeExtrudeResult(sketch: any, depth: number, helperJobId: string) {
  const bounds = getSketchBounds(sketch)

  return {
    preview: {
      primitive: 'box',
      dimensions: [bounds.width, depth, bounds.depth],
      color: '#60a5fa',
    },
    operations: [
      {
        kind: 'extrude',
        sketchId: sketch?.id,
        depth,
      },
    ],
    artifacts: {
      helperJobId,
      previewUrl: `memory://preview/${helperJobId}`,
      cadUrl: `cad://body/${sketch?.id || helperJobId}`,
    },
  }
}

function makeRevolveResult(sketch: any, angle: number, axis: string, helperJobId: string) {
  const bounds = getSketchBounds(sketch)
  const radius = Math.max(bounds.width, bounds.depth) / 2
  const height = Math.max(bounds.depth, 0.25)

  return {
    preview: {
      primitive: 'cylinder',
      radius,
      height,
      radialSegments: 48,
      color: '#38bdf8',
    },
    operations: [
      {
        kind: 'revolve',
        sketchId: sketch?.id,
        axis,
        angle,
      },
    ],
    artifacts: {
      helperJobId,
      previewUrl: `memory://preview/${helperJobId}`,
      cadUrl: `cad://body/${sketch?.id || helperJobId}`,
    },
  }
}

export function buildMockCadJob(type: string, payload: any): MockJob {
  const jobId = `cadjob_${randomUUID().replaceAll('-', '')}`

  try {
    if (type === 'sketch_to_solid') {
      const sketch = payload.sketch
      const depth = Number(payload.depth || 1.2)
      return {
        jobId,
        type,
        status: 'succeeded',
        warnings: [],
        result: makeExtrudeResult(sketch, depth, jobId),
      }
    }

    if (type === 'extrude') {
      const sketch = payload.sketch
      const depth = Number(payload.distance || 1.2)
      return {
        jobId,
        type,
        status: 'succeeded',
        warnings: [],
        result: makeExtrudeResult(sketch, depth, jobId),
      }
    }

    if (type === 'revolve') {
      const sketch = payload.sketch
      const angle = Number(payload.angle || 360)
      const axis = payload.axis || 'Z'
      return {
        jobId,
        type,
        status: 'succeeded',
        warnings: [],
        result: makeRevolveResult(sketch, angle, axis, jobId),
      }
    }

    if (type === 'regenerate') {
      const body = payload.body || {}
      const sketch = payload.sketch
      const operations = body.operationHistory?.length ? body.operationHistory : body.operations || []
      const latestOperation = [...operations].reverse().find((op: any) => !op?.suppressed) || null
      const overrideDepth = Number(
        payload.overrides?.depth ||
          operations.find((op: any) => op?.kind === 'extrude')?.depth ||
          1.2,
      )
      let result: any

      if (sketch && sketch.id && latestOperation?.kind === 'revolve') {
        result = makeRevolveResult(
          sketch,
          Number(latestOperation.angle || latestOperation.params?.angle || 360),
          latestOperation.axis || latestOperation.params?.axis || 'Z',
          jobId,
        )
      } else if (sketch && sketch.id) {
        result = makeExtrudeResult(sketch, overrideDepth, jobId)
      } else {
        result = {
          preview: body.preview || { primitive: 'box', dimensions: [2, 1, 2], color: '#60a5fa' },
          operations,
          artifacts: {
            ...(body.artifacts || {}),
            helperJobId: jobId,
          },
        }
      }

      return {
        jobId,
        type,
        status: 'succeeded',
        warnings: [],
        result,
      }
    }

    if (type === 'import_step') {
      return {
        jobId,
        type,
        status: 'succeeded',
        warnings: ['Mock STEP import generated by CAD mock runtime.'],
        result: {
          preview: {
            primitive: 'box',
            dimensions: [2, 1, 2],
            color: '#94a3b8',
          },
          operations: [{ kind: 'import_step' }],
          artifacts: {
            helperJobId: jobId,
            cadUrl: `cad://imported/${jobId}`,
          },
        },
      }
    }

    if (type === 'export_step') {
      const body = payload.body || {}
      return {
        jobId,
        type,
        status: 'succeeded',
        warnings: ['Mock STEP export generated by the CAD helper scaffold.'],
        result: {
          preview: body.preview,
          operations: body.operations || [],
          artifacts: {
            ...(body.artifacts || {}),
            helperJobId: jobId,
            exportUrl: `memory://export/${jobId}.step`,
          },
          exportFile: {
            filename: `${sanitizeName(body.name || body.id)}.step`,
            content: `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Pistola CAD helper scaffold export'),'2;1');
FILE_NAME('${sanitizeName(body.name || body.id)}.step','2026-03-23T00:00:00',('Pistola'),('Pistola CAD Helper'),'OpenAI Codex','Pistola','');
ENDSEC;
DATA;
/* Mock STEP placeholder for ${body.id} */
ENDSEC;
END-ISO-10303-21;`,
          },
        },
      }
    }

    return {
      jobId,
      type,
      status: 'failed',
      warnings: [],
      error: `${type} is not implemented in the CAD helper scaffold yet.`,
    }
  } catch (error) {
    return {
      jobId,
      type,
      status: 'failed',
      warnings: [],
      error: error instanceof Error ? error.message : 'Unexpected CAD helper failure.',
    }
  }
}

export async function handleMockCadRequest(
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(`http://localhost${pathname}`)
  const cleanPath = url.pathname

  if (cleanPath === '/health' || cleanPath === '/v1/health') {
    return new Response(JSON.stringify(mockCadHelperInfo), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }

  if (cleanPath === '/v1/cad/jobs' && (init?.method === 'POST' || !init?.method)) {
    try {
      let bodyData: any = {}
      if (typeof init?.body === 'string') {
        bodyData = JSON.parse(init.body || '{}')
      } else if (init?.body instanceof FormData) {
        const type = init.body.get('type') as string
        bodyData = { type: type || 'import_step' }
      }

      const job = buildMockCadJob(bodyData.type, bodyData.payload || bodyData)
      jobs.set(job.jobId, job)

      return new Response(
        JSON.stringify({
          jobId: job.jobId,
          status: job.status === 'failed' ? 'failed' : 'pending',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      )
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Invalid CAD helper payload.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  }

  if (cleanPath.startsWith('/v1/cad/jobs/')) {
    const jobId = cleanPath.split('/').pop() || ''
    const job = jobs.get(jobId)
    if (!job) {
      return new Response(
        JSON.stringify({ error: 'CAD helper job not found.' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(JSON.stringify(job), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response(
    JSON.stringify({ error: `Mock CAD route ${cleanPath} not found.` }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
