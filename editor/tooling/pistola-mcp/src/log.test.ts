import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { appendMcpLog, errorCodeFromText } from './log.ts'

const previous = process.env.PISTOLA_MCP_LOG

afterEach(() => {
  if (previous === undefined) delete process.env.PISTOLA_MCP_LOG
  else process.env.PISTOLA_MCP_LOG = previous
})

test('appendMcpLog writes tool, ok, error codes and ms', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pistola-mcp-log-'))
  const dest = path.join(dir, 'calls.jsonl')
  process.env.PISTOLA_MCP_LOG = dest
  await appendMcpLog({
    ts: '2026-09-19T00:00:00.000Z',
    tool: 'pistola_export_scene',
    ok: true,
    error: null,
    code: null,
    ms: 12,
  })
  await appendMcpLog({
    ts: '2026-09-19T00:00:01.000Z',
    tool: 'missing',
    ok: false,
    error: 'Unknown tool missing',
    code: -32601,
    ms: 0,
  })
  const lines = (await readFile(dest, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(lines[0].tool, 'pistola_export_scene')
  assert.equal(lines[0].ok, true)
  assert.equal(lines[0].ms, 12)
  assert.equal(lines[1].ok, false)
  assert.equal(lines[1].code, -32601)
})

test('errorCodeFromText prefers JSON code then error text', () => {
  assert.equal(errorCodeFromText(undefined, false), null)
  assert.equal(errorCodeFromText(JSON.stringify({ code: 'EMPTY_RESULT' }), true), 'EMPTY_RESULT')
  assert.equal(errorCodeFromText(JSON.stringify({ error: 'bad spec' }), true), 'bad spec')
  assert.equal(errorCodeFromText('not-json', true), 'ERROR')
})
