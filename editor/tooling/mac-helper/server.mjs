import { randomUUID } from 'node:crypto'
import http from 'node:http'

const PORT = Number(process.env.PISTOLA_MAC_HELPER_PORT || 7879)
const HOST = process.env.PISTOLA_MAC_HELPER_HOST || '127.0.0.1'
const jobs = new Map()
const artifacts = new Map()

const helperInfo = {
  status: 'ready',
  runtime: 'mock',
  engine: 'mac-mock',
  version: '0.1.0',
  helperUrl: `http://${HOST}:${PORT}`,
  macRootConfigured: false,
  macRoot: null,
  pythonPath: null,
  openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY || process.env.PISTOLA_CAD_AI_API_KEY),
  model: process.env.PISTOLA_MAC_MODEL || process.env.PISTOLA_CAD_MODEL || 'openrouter/free',
}

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

const sendFile = (response, filename, content, contentType) => {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Access-Control-Allow-Origin': '*',
  })
  response.end(content)
}

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })

const mockStep = (prompt) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Pistola MAC mock'),'2;1');
FILE_NAME('part.step','2026-01-01',('pistola'),('pistola'),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
/* Mock Multi-Agent-CAD solid for: ${String(prompt).replace(/\s+/g, ' ').slice(0, 120)} */
ENDSEC;
END-ISO-10303-21;
`

const createMockJob = (prompt) => {
  const jobId = `macjob_${randomUUID().replaceAll('-', '')}`
  artifacts.set(`${jobId}/part.step`, {
    filename: 'part.step',
    content: mockStep(prompt),
    contentType: 'application/step',
  })
  artifacts.set(`${jobId}/design.py`, {
    filename: 'design.py',
    content: `# Mock MAC output for: ${prompt}\nfrom build123d import *\n\nprint("mock")\n`,
    contentType: 'text/x-python',
  })

  const job = {
    jobId,
    type: 'generate_part',
    status: 'succeeded',
    warnings: [
      'Hosted MAC preview used the bundled mock runtime. Point PISTOLA_MAC_ROOT at https://github.com/Pan-Chera/Multi-Agent-CAD for real generation.',
    ],
    result: {
      prompt,
      mode: 'part',
      qaSummary: 'Mock Multi-Agent-CAD preview. Install the MAC clone for engineered solids.',
      warnings: [],
      artifacts: {
        previewUrl: null,
        cadUrl: `/v1/mac/artifacts/${jobId}/part.step`,
        codeUrl: `/v1/mac/artifacts/${jobId}/design.py`,
        previewArtifactRef: null,
        cadArtifactRef: `/v1/mac/artifacts/${jobId}/part.step`,
        codeArtifactRef: `/v1/mac/artifacts/${jobId}/design.py`,
      },
      metadata: {
        engine: 'mac-mock',
        source: 'https://github.com/Pan-Chera/Multi-Agent-CAD',
      },
    },
  }
  jobs.set(jobId, job)
  return job
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

  if (request.method === 'GET' && (request.url === '/health' || request.url === '/v1/health')) {
    sendJson(response, 200, helperInfo)
    return
  }

  if (request.method === 'POST' && request.url === '/v1/mac/jobs') {
    try {
      const parsed = JSON.parse((await readBody(request)) || '{}')
      const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
      if (!prompt) {
        sendJson(response, 400, { error: 'Describe the part you want to generate.' })
        return
      }
      if (parsed.mode && parsed.mode !== 'part') {
        sendJson(response, 400, { error: 'Only mode=part is supported in this increment.' })
        return
      }
      const job = createMockJob(prompt)
      sendJson(response, 200, { jobId: job.jobId, status: 'pending' })
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid MAC helper payload.',
      })
    }
    return
  }

  if (request.method === 'GET' && request.url.startsWith('/v1/mac/jobs/')) {
    const jobId = decodeURIComponent(request.url.split('/').pop() || '')
    const job = jobs.get(jobId)
    if (!job) {
      sendJson(response, 404, { error: 'MAC helper job not found.' })
      return
    }
    sendJson(response, 200, job)
    return
  }

  if (request.method === 'GET' && request.url.startsWith('/v1/mac/artifacts/')) {
    const artifactPath = decodeURIComponent(request.url.slice('/v1/mac/artifacts/'.length).split('?')[0] || '')
    const artifact = artifacts.get(artifactPath)
    if (!artifact) {
      sendJson(response, 404, { error: 'MAC artifact not found.' })
      return
    }
    sendFile(response, artifact.filename, artifact.content, artifact.contentType)
    return
  }

  sendJson(response, 404, { error: 'MAC helper route not found.' })
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`[mac-helper] listening on http://${HOST}:${PORT}\n`)
})
