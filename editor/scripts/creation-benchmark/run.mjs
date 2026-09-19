#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createMcpClient, parseToolJson, spawnMcpServer } from '../mcp-stdio-client.mjs'
import { replayActions } from './lib/replay-actions.mjs'
import { scoreScene, summarizeScores } from './lib/score-core.mjs'
import { writeGoldFiles } from './gold/make.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const evidenceRoot = path.join(repoRoot, 'docs/tasks/evidence/creation-quality')
const promptsPath = path.join(here, 'prompts.json')

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  return args[index + 1] ?? true
}

const mode = flag('--mode', 'replay')
const setName = flag('--set', 'all')
const outRel = flag('--out', path.join('docs/tasks/evidence/creation-quality', mode === 'replay' ? 'baseline' : mode))
const cli = flag('--cli', null)
const seeds = Number(flag('--seeds', '3'))
const slugFilter = flag('--slug', null)

const loadPrompts = async () => JSON.parse(await readFile(promptsPath, 'utf8'))

const selectedPrompts = (catalog) => {
  const groups = setName === 'dev' ? ['dev'] : setName === 'held-out' || setName === 'heldOut' ? ['heldOut'] : ['dev', 'heldOut']
  const items = groups.flatMap((group) => (catalog[group] ?? []).map((item) => ({ ...item, set: group })))
  return slugFilter ? items.filter((item) => item.slug === slugFilter) : items
}

const loadGold = async (slug) => JSON.parse(await readFile(path.join(here, 'gold', `${slug}.json`), 'utf8'))

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const todaySailboatActions = [
  {
    type: 'place_item',
    name: 'Sailboat Hull',
    assetId: 'primitive-box',
    placement: 'explicit',
    position: [0, 0, 0],
    scale: [1.4, 0.45, 3.2],
    color: '#8b5a2b',
    allowOverlap: true,
    refId: '$ref_sailboat_hull',
  },
  {
    type: 'place_item',
    name: 'Sailboat Keel',
    assetId: 'primitive-box',
    placement: 'explicit',
    position: [0, -0.35, 0],
    scale: [0.12, 0.7, 1.4],
    color: '#4a3728',
    allowOverlap: true,
    parentId: '$ref_sailboat_hull',
  },
  {
    type: 'place_item',
    name: 'Sailboat Mast',
    assetId: 'primitive-cylinder',
    placement: 'explicit',
    position: [0, 0.45, 0.2],
    scale: [0.1, 2.4, 0.1],
    color: '#d6c6a8',
    allowOverlap: true,
    parentId: '$ref_sailboat_hull',
  },
  {
    type: 'place_item',
    name: 'Sailboat Sail',
    assetId: 'primitive-wedge',
    placement: 'explicit',
    position: [0.15, 0.9, 0.4],
    scale: [0.08, 1.8, 1.4],
    color: '#f4f1ea',
    allowOverlap: true,
    parentId: '$ref_sailboat_hull',
  },
]

const runReplay = async () => {
  await writeGoldFiles()
  const catalog = await loadPrompts()
  const prompts = selectedPrompts(catalog)
  const outDir = path.resolve(repoRoot, outRel)
  const runs = []
  for (const prompt of prompts) {
    const started = Date.now()
    const gold = await loadGold(prompt.slug)
    const replayed = replayActions(gold.actions)
    const scored = scoreScene({
      slug: prompt.slug,
      set: prompt.set,
      prompt,
      goldParts: gold.parts,
      sceneParts: replayed.parts,
      runnableFirstTry: replayed.ok,
      runnableFinal: replayed.ok,
      timeMs: Date.now() - started,
    })
    await writeJson(path.join(outDir, 'scenes', `${prompt.slug}.json`), {
      prompt,
      gold: { slug: gold.slug, partCount: gold.parts.length },
      scene: replayed,
      score: scored,
    })
    runs.push(scored)
  }

  const goldSailboat = await loadGold('sailboat')
  const today = replayActions(todaySailboatActions)
  const todayScore = scoreScene({
    slug: 'sailboat-today-e2e',
    set: 'dev',
    prompt: catalog.dev.find((item) => item.slug === 'sailboat'),
    goldParts: goldSailboat.parts,
    sceneParts: today.parts,
    runnableFirstTry: today.ok,
    runnableFinal: today.ok,
  })
  await writeJson(path.join(outDir, 'scenes', 'sailboat-today-e2e.json'), { scene: today, score: todayScore })

  const scores = {
    generatedAt: new Date().toISOString(),
    mode: 'replay',
    frame: catalog.frame,
    summary: summarizeScores(runs),
    todayTools: {
      note: 'Recorded IDE e2e sailboat (parented keel/mast/sail) scored against the check-clean gold sailboat.',
      score: todayScore,
    },
    runs,
  }
  await writeJson(path.join(outDir, 'scores.json'), scores)
  return { outDir, scores }
}

const writeManualPacket = async (prompt, dest) => {
  const text = `# Manual creation packet: ${prompt.slug}

Host: Cursor or Antigravity. Do not use Pistola's in-app Assistant.

## Prompt
${prompt.prompt}

## Contract
- overall_m: ${JSON.stringify(prompt.overall_m)}
- parts: ${prompt.parts.join(', ')}
- frame: +Y up, +Z front, +X right, meters, bottom-center
- world-space parts only (no parentId) unless the child scale is compensated

## Loop
plan → examples → build per part → check → fix (≤2) → render → critique (≤2) → keep best → report

Write the final exportScene JSON to:
\`${path.relative(repoRoot, dest).replaceAll('\\', '/')}\`
`
  await writeFile(dest.replace(/\.json$/, '.md'), text)
}

const runManual = async () => {
  const catalog = await loadPrompts()
  const prompts = selectedPrompts(catalog)
  const outDir = path.resolve(repoRoot, outRel)
  await mkdir(path.join(outDir, 'manual'), { recursive: true })
  for (const prompt of prompts) {
    await writeManualPacket(prompt, path.join(outDir, 'manual', `${prompt.slug}.json`))
  }
  return { outDir, packets: prompts.map((item) => item.slug) }
}

const which = async (command) =>
  new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })

const runAgent = async () => {
  const outDir = path.resolve(repoRoot, outRel)
  const instructions = await readFile(path.join(here, 'agent-instructions.md'), 'utf8')
  const catalog = await loadPrompts()
  const prompts = selectedPrompts(catalog)
  await writeJson(path.join(outDir, 'agent-packet.json'), {
    cli,
    seeds,
    instructions,
    prompts,
    note: 'Headless agent runs are limited to baseline and phases 2/4/5. Cursor and Antigravity stay manual.',
  })
  const available = cli ? await which(cli) : false
  if (!available) {
    await writeJson(path.join(outDir, 'scores.json'), {
      generatedAt: new Date().toISOString(),
      mode: 'agent',
      skipped: true,
      reason: cli ? `${cli} is not on PATH` : 'Pass --cli codex|claude',
      prompts: prompts.map((item) => item.slug),
    })
    return { outDir, skipped: true, cli }
  }
  await writeJson(path.join(outDir, 'scores.json'), {
    generatedAt: new Date().toISOString(),
    mode: 'agent',
    skipped: true,
    reason: 'CLI present, but Phase 0 does not spend IDE quota. Re-run after Phase 2.',
    cli,
    seeds,
  })
  return { outDir, skipped: true, cli }
}

const listMcpTools = async () => {
  const logPath = path.join(evidenceRoot, 'mcp-call-log.jsonl')
  const child = spawnMcpServer(path.join(repoRoot, 'editor/tooling/pistola-mcp/src/index.ts'), {
    PISTOLA_MCP_ASSISTANT_TOOLS: '',
    PISTOLA_MCP_LOG: logPath,
    PISTOLA_TARGET: 'local',
  })
  const client = createMcpClient(child)
  try {
    await client.initialize()
    const listed = await client.listTools()
    const names = (listed.tools ?? []).map((tool) => tool.name).sort()
    await writeJson(path.join(evidenceRoot, 'mcp-tools-default.json'), names)
    let unknown = null
    try {
      unknown = await client.callTool('this_tool_does_not_exist')
    } catch (error) {
      unknown = { error: error instanceof Error ? error.message : String(error) }
    }
    return { names, unknown, logPath }
  } finally {
    child.kill('SIGKILL')
  }
}

const main = async () => {
  if (args.includes('--write-gold')) {
    const slugs = await writeGoldFiles()
    console.log(JSON.stringify({ wrote: slugs }, null, 2))
    return
  }
  if (args.includes('--list-tools')) {
    const result = await listMcpTools()
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  }
  if (mode === 'replay') {
    const result = await runReplay()
    console.log(JSON.stringify({ ok: true, outDir: result.outDir, summary: result.scores.summary, todayIoU: result.scores.todayTools.score.iou.mean }, null, 2))
    return
  }
  if (mode === 'manual') {
    const result = await runManual()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }
  if (mode === 'agent') {
    const result = await runAgent()
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }
  throw new Error(`Unknown mode ${mode}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
