import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sessionId = process.argv[2]
const actionsPath = process.argv[3]
if (!sessionId || !actionsPath) {
  console.error('usage: node replay-check.mjs <sessionId> <actions.json>')
  process.exit(1)
}

const raw = JSON.parse(await readFile(actionsPath, 'utf8'))
const flatten = (value) => {
  if (Array.isArray(value)) return value
  if (value && Array.isArray(value.actions)) return value.actions
  if (value && Array.isArray(value.order) && value.groups && typeof value.groups === 'object') {
    return value.order.flatMap((name) => (Array.isArray(value.groups[name]) ? value.groups[name] : []))
  }
  return null
}
const list = flatten(raw)
if (!list) {
  const keys = raw && typeof raw === 'object' ? Object.keys(raw) : []
  console.error(`actions file is not a list (${keys.join(', ')})`)
  process.exit(1)
}

const post = async (body) => {
  const response = await fetch('http://127.0.0.1:3002/api/workspace/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, ...body }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `command failed ${response.status}`)
  return payload
}

const waitFor = async (commandId) => {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const response = await fetch(
      `http://127.0.0.1:3002/api/workspace/command?sessionId=${sessionId}&commandId=${commandId}&consume=1`,
    )
    const payload = await response.json()
    if (!payload.pending) return payload.result
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`command ${commandId} timed out`)
}

const invoke = async (method, args) => {
  const enqueued = await post({ type: 'api', method, args })
  const commandId = enqueued.command?.id
  if (!commandId) throw new Error('missing command id')
  return waitFor(commandId)
}

const reportOnly = process.argv.includes('--report')
const sheetOnly = process.argv.includes('--sheet')
if (sheetOnly) {
  const sheet = await invoke('renderSheet', { cell: 160 })
  const payload = sheet?.data ?? sheet?.output ?? sheet
  const dataUrl = typeof payload?.dataUrl === 'string' ? payload.dataUrl : ''
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : ''
  const file = path.resolve('docs/tasks/evidence/frictionless-creation/phase3-eight-view.png')
  if (!base64) throw new Error('renderSheet did not return a PNG')
  await writeFile(file, Buffer.from(base64, 'base64'))
  console.log(JSON.stringify({
    file,
    bytes: Buffer.from(base64, 'base64').length,
    width: payload.width,
    height: payload.height,
    columns: payload.columns,
    rows: payload.rows,
    views: Array.isArray(payload.views) ? payload.views.map((view) => view.id) : [],
  }))
  process.exit(0)
}
const replayed = reportOnly ? null : await invoke('replay', list)
const structure = await invoke('checkStructure')
const nodes = await invoke('getNodes')
const report = structure?.data ?? structure?.output ?? structure
const nodeMap = (nodes?.data ?? nodes?.output ?? nodes)?.nodes ?? {}
const issues = Array.isArray(report?.issues)
  ? report.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      name: nodeMap[issue.partId]?.name ?? issue.partId,
      op: nodeMap[issue.partId]?.spec?.op ?? null,
      triangles: nodeMap[issue.partId]?.triangles ?? null,
      measured: issue.measured ?? null,
    }))
  : []
const replayReport = replayed ? (replayed?.data ?? replayed?.output ?? replayed) : null
console.log(JSON.stringify({
  actions: list.length,
  replayOk: replayReport?.ok ?? null,
  replayError: replayReport?.errors?.[0] ?? null,
  partCount: report?.partCount ?? null,
  errorCount: report?.errorCount ?? null,
  warningCount: report?.warningCount ?? null,
  issues,
}))
