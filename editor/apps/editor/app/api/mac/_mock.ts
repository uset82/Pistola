import { randomUUID } from 'node:crypto'

type MockArtifact = {
  filename: string
  content: string
  contentType: string
}

type MockMacJob = {
  jobId: string
  type: string
  status: 'succeeded' | 'pending' | 'failed'
  warnings: string[]
  error?: string
  result?: any
}

const jobs = new Map<string, MockMacJob>()
const artifacts = new Map<string, MockArtifact>()

export const getMockMacHelperInfo = () => ({
  status: 'ready' as const,
  runtime: 'mock',
  engine: 'mac-mock',
  version: '0.1.0',
  helperUrl: process.env.PISTOLA_MAC_HELPER_URL || 'http://127.0.0.1:7879',
  macRootConfigured: false,
  macRoot: null,
  pythonPath: null,
  openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY || process.env.PISTOLA_CAD_AI_API_KEY),
  model: process.env.PISTOLA_MAC_MODEL || process.env.PISTOLA_CAD_MODEL || 'openrouter/free',
})

const mockStep = (prompt: string) => `ISO-10303-21;
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

export function createMockMacJob(prompt: string): MockMacJob {
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

  const job: MockMacJob = {
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

export async function handleMockMacRequest(
  pathname: string,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(`http://localhost${pathname}`)
  const cleanPath = url.pathname

  if (cleanPath === '/health' || cleanPath === '/v1/health') {
    return new Response(JSON.stringify(getMockMacHelperInfo()), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }

  if (cleanPath === '/v1/mac/jobs' && (init?.method === 'POST' || !init?.method)) {
    try {
      let bodyData: any = {}
      if (typeof init?.body === 'string') {
        bodyData = JSON.parse(init.body || '{}')
      }
      const prompt = typeof bodyData.prompt === 'string' ? bodyData.prompt.trim() : ''
      if (!prompt) {
        return new Response(
          JSON.stringify({ error: 'Describe the part you want to generate.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        )
      }

      const job = createMockMacJob(prompt)
      return new Response(
        JSON.stringify({ jobId: job.jobId, status: 'pending' }),
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
          error: error instanceof Error ? error.message : 'Invalid MAC helper payload.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  }

  if (cleanPath.startsWith('/v1/mac/jobs/')) {
    const jobId = decodeURIComponent(cleanPath.split('/').pop() || '')
    const job = jobs.get(jobId)
    if (!job) {
      return new Response(
        JSON.stringify({ error: 'MAC helper job not found.' }),
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

  if (cleanPath.startsWith('/v1/mac/artifacts/')) {
    const artifactPath = decodeURIComponent(cleanPath.slice('/v1/mac/artifacts/'.length))
    const artifact = artifacts.get(artifactPath)
    if (!artifact) {
      return new Response(
        JSON.stringify({ error: 'MAC artifact not found.' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(artifact.content, {
      status: 200,
      headers: {
        'Content-Type': artifact.contentType,
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${artifact.filename}"`,
      },
    })
  }

  return new Response(
    JSON.stringify({ error: `Mock MAC route ${cleanPath} not found.` }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}
