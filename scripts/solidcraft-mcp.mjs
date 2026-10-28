#!/usr/bin/env node
/**
 * Portable launcher for SolidCraft's stdio MCP server.
 *
 * Keeps the repo-level IDE configs free of a hard-coded install path while
 * still using the exact binary the user installed. Resolution order:
 *
 *   1. SOLIDCRAFT_CLI_PATH
 *   2. any portable build under .tools/, newest version name first
 *   3. the platform's default install location
 *   4. solidcraft-cli on PATH
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const exe = isWindows ? 'solidcraft-cli.exe' : 'solidcraft-cli'

/** Portable builds under .tools/, newest version name first. */
const portableCandidates = () => {
  const toolsDir = join(repoRoot, '.tools')
  if (!existsSync(toolsDir)) return []
  return readdirSync(toolsDir)
    .filter((name) => name.startsWith('solidcraft-'))
    .sort()
    .reverse()
    .map((name) => join(toolsDir, name, exe))
}

const defaultInstall = isWindows
  ? join(process.env.ProgramFiles || 'C:/Program Files', 'SolidCraft', exe)
  : '/usr/local/bin/solidcraft-cli'

const candidates = [
  process.env.SOLIDCRAFT_CLI_PATH,
  ...portableCandidates(),
  defaultInstall,
].filter(Boolean)

// Falling through to the bare name lets PATH resolve it, which is the normal
// case on Linux and macOS.
const cli = candidates.find((candidate) => existsSync(candidate)) ?? exe

const allowPath = join(repoRoot, 'cad-out')
const child = spawn(
  cli,
  ['mcp', '--allow-path', allowPath, '--param-check', 'strict', ...process.argv.slice(2)],
  { stdio: 'inherit' },
)

child.on('error', (error) => {
  console.error(
    `solidcraft-mcp: could not start ${cli}: ${error.message}\n` +
      'Set SOLIDCRAFT_CLI_PATH, or install SolidCraft from https://github.com/tangency-labs/solidcraft.',
  )
  process.exit(127)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
