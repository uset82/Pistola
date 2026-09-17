import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { requestOpenAiResponses } from './ai-provider-shared'

test('requestOpenAiResponses strips the trailing /responses segment before constructing the OpenAI client base URL', async () => {
  let receivedPath: string | null = null
  let receivedAuthorization: string | null = null
  let receivedModel: string | null = null

  const server = createServer((request, response) => {
    receivedPath = request.url ?? null
    receivedAuthorization =
      typeof request.headers.authorization === 'string'
        ? request.headers.authorization
        : null

    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const parsed = JSON.parse(body) as { model?: unknown }
      receivedModel = typeof parsed.model === 'string' ? parsed.model : null

      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'structured reply' }],
            },
          ],
        }),
      )
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const port = address.port

  try {
    const text = await requestOpenAiResponses(
      {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        responsesUrl: `http://127.0.0.1:${port}/v1/responses`,
      },
      {
        model: 'gpt-5.4',
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: 'hello' }],
          },
        ],
        store: false,
      },
      5_000,
      'OpenAI assistant planning',
    )

    assert.equal(text, 'structured reply')
    assert.equal(receivedPath, '/v1/responses')
    assert.equal(receivedAuthorization, 'Bearer test-openai-key')
    assert.equal(receivedModel, 'gpt-5.4')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
})
