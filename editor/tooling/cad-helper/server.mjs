import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PISTOLA_CAD_HELPER_PORT || 7878)
const HOST = process.env.PISTOLA_CAD_HELPER_HOST || '127.0.0.1'
const jobs = new Map()

const helperInfo = {
  status: 'ready',
  runtime: 'mock',
  engine: 'mock-freecad',
  version: '0.1.0',
  helperUrl: `http://${HOST}:${PORT}`,
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

function sanitizeName(name) {
  return String(name || 'cad-body')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function getEntityPoints(entity) {
  switch (entity.kind) {
    case 'line':
      return [entity.start, entity.end]
    case 'rectangle': {
      const halfWidth = entity.width / 2
      const halfHeight = entity.height / 2
      return [
        [entity.center[0] - halfWidth, entity.center[1] - halfHeight],
        [entity.center[0] + halfWidth, entity.center[1] - halfHeight],
        [entity.center[0] + halfWidth, entity.center[1] + halfHeight],
        [entity.center[0] - halfWidth, entity.center[1] + halfHeight],
      ]
    }
    case 'circle':
      return [
        [entity.center[0] - entity.radius, entity.center[1] - entity.radius],
        [entity.center[0] + entity.radius, entity.center[1] + entity.radius],
      ]
    case 'arc':
      return [
        [entity.center[0] - entity.radius, entity.center[1] - entity.radius],
        [entity.center[0] + entity.radius, entity.center[1] + entity.radius],
      ]
    case 'polyline':
      return entity.points
    default:
      return [
        [-1, -0.75],
        [1, 0.75],
      ]
  }
}

function getSketchBounds(sketch) {
  const points = (sketch.entities || []).flatMap(getEntityPoints)
  if (!points.length) {
    return { width: 2, depth: 1.5 }
  }

  const xs = points.map((value) => value[0])
  const ys = points.map((value) => value[1])

  return {
    width: Math.max(Math.max(...xs) - Math.min(...xs), 0.5),
    depth: Math.max(Math.max(...ys) - Math.min(...ys), 0.5),
  }
}

function makeExtrudeResult(sketch, depth, helperJobId) {
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
        sketchId: sketch.id,
        depth,
      },
    ],
    artifacts: {
      helperJobId,
      previewUrl: `memory://preview/${helperJobId}`,
      cadUrl: `cad://body/${sketch.id}`,
    },
  }
}

function makeRevolveResult(sketch, angle, axis, helperJobId) {
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
        sketchId: sketch.id,
        axis,
        angle,
      },
    ],
    artifacts: {
      helperJobId,
      previewUrl: `memory://preview/${helperJobId}`,
      cadUrl: `cad://body/${sketch.id}`,
    },
  }
}

function buildJob(type, payload) {
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
      const body = payload.body
      const sketch = payload.sketch
      const operations = body.operationHistory?.length ? body.operationHistory : body.operations || []
      const latestOperation = [...operations].reverse().find((op) => !op?.suppressed) || null
      const overrideDepth = Number(
        payload.overrides?.depth ||
          operations.find((op) => op.kind === 'extrude')?.depth ||
          1.2,
      )
      let result

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
          preview: body.preview,
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

    if (type === 'export_step') {
      const body = payload.body
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

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing request URL.' })
    return
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, helperInfo)
    return
  }

  if (request.method === 'POST' && request.url === '/v1/cad/jobs') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}')
        const job = buildJob(parsed.type, parsed.payload || {})
        jobs.set(job.jobId, job)
        sendJson(response, 200, {
          jobId: job.jobId,
          status: job.status === 'failed' ? 'failed' : 'pending',
        })
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid CAD helper payload.',
        })
      }
    })
    return
  }

  if (request.method === 'GET' && request.url.startsWith('/v1/cad/jobs/')) {
    const jobId = request.url.split('/').pop()
    const job = jobId ? jobs.get(jobId) : null
    if (!job) {
      sendJson(response, 404, { error: 'CAD helper job not found.' })
      return
    }

    sendJson(response, 200, job)
    return
  }

  sendJson(response, 404, { error: 'CAD helper route not found.' })
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`[cad-helper] listening on http://${HOST}:${PORT}\n`)
})
