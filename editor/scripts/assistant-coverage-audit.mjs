#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const editorRoot = path.resolve(__dirname, '..')

// File paths for audit
const commandPalettePath = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'components',
  'ui',
  'command-palette',
  'index.tsx',
)
const toolManagerPath = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'components',
  'tools',
  'tool-manager.tsx',
)
const toolSurfacePath = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'lib',
  'assistant',
  'tool-surface.ts',
)
const assistantTypesPath = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'lib',
  'assistant',
  'types.ts',
)
const useEditorPath = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'store',
  'use-editor.tsx',
)
const useCadPath = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'store',
  'use-cad.ts',
)
const panelsDir = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'components',
  'ui',
  'panels',
)
const sidebarPanelsDir = path.join(
  editorRoot,
  'packages',
  'editor',
  'src',
  'components',
  'ui',
  'sidebar',
  'panels',
)

// Allowlist for operations that are intentionally manual-only (UI dialogs, auth, hardware, raw file picking)
export const manualOnlyAllowlist = new Map([
  ['Help / Documentation', 'External link/documentation modal'],
  ['Keyboard Shortcuts', 'Static keyboard shortcut reference dialog'],
  ['Sign In / Auth', 'Authentication and session handling'],
  ['Feedback Dialog', 'User feedback modal'],
  ['Browse Local File', 'Browser local file input dialog'],
])

// 1. Extract assistantActionTypeValues
function getAssistantActionTypes() {
  const content = readFileSync(assistantTypesPath, 'utf8')
  const match = content.match(/export const assistantActionTypeValues = \[([\s\S]*?)\] as const/)
  if (!match) return []
  return match[1]
    .split('\n')
    .map((l) => l.trim().replace(/[',]/g, ''))
    .filter((l) => l.length > 0 && !l.startsWith('//'))
}

// 2. Extract Tool IDs from tool-manager and tool-surface
function getToolsAudit() {
  const toolManagerContent = readFileSync(toolManagerPath, 'utf8')
  const toolSurfaceContent = readFileSync(toolSurfacePath, 'utf8')

  const toolSurfaceMatch = toolSurfaceContent.match(
    /export const assistantToolValues = \[([\s\S]*?)\] as const/,
  )
  const assistantTools = new Set(
    toolSurfaceMatch
      ? toolSurfaceMatch[1]
          .split('\n')
          .map((l) => l.trim().replace(/[',]/g, ''))
          .filter((l) => l.length > 0 && !l.startsWith('//'))
      : [],
  )

  const toolsStart = toolManagerContent.indexOf('const tools:')
  const toolsEnd = toolManagerContent.indexOf('export const ToolManager')
  const toolsBlock = toolsStart !== -1 && toolsEnd !== -1 ? toolManagerContent.slice(toolsStart, toolsEnd) : toolManagerContent

  // Find tool keys in tool-manager (e.g. 'property-line', wall:, 'cad-sketch':, etc.)
  const managerToolMatches = [
    ...toolsBlock.matchAll(/(?:'([a-z0-9-]+)'|\b([a-z0-9-]+))\s*:\s*[A-Z][A-Za-z0-9]+/g),
  ]
  const managerTools = new Set(
    managerToolMatches
      .map((m) => m[1] || m[2])
      .filter((t) => t && t !== 'tools' && t !== 'site' && t !== 'structure' && t !== 'furnish' && t !== 'cad'),
  )

  const gaps = []
  for (const tool of managerTools) {
    if (!assistantTools.has(tool) && !assistantTools.has(`cad-${tool}`)) {
      gaps.push({ category: 'tool', name: tool, reason: 'Tool mounted in ToolManager without AssistantToolValue' })
    }
  }

  return { managerTools: Array.from(managerTools), assistantTools: Array.from(assistantTools), gaps }
}

// 3. Extract Command Palette entries
function getCommandPaletteAudit(actionTypesSet) {
  const content = readFileSync(commandPalettePath, 'utf8')
  const itemMatches = [...content.matchAll(/<Item[\s\S]*?label="([^"]+)"/g)].map((m) => m[1])
  const optionMatches = [...content.matchAll(/<OptionItem[\s\S]*?label="([^"]+)"/g)].map((m) => m[1])
  const allCommands = Array.from(new Set([...itemMatches, ...optionMatches]))

  const gaps = []
  for (const cmd of allCommands) {
    if (manualOnlyAllowlist.has(cmd)) continue
    // Check if command is represented in assistant actions
    if (
      cmd.includes('Create Site') ||
      cmd.includes('New Site') ||
      cmd.includes('Create Building') ||
      cmd.includes('New Building')
    ) {
      if (!actionTypesSet.has('create_site') && !actionTypesSet.has('create_building')) {
        gaps.push({ category: 'command-palette', name: cmd, reason: 'Site/Building creation lacks dedicated assistant action' })
      }
    }
  }

  return { allCommands, gaps }
}

// 4. Panel mutations audit (scan for direct updateNode / deleteNode call sites)
function getPanelMutationsAudit() {
  const panelFiles = []
  function scanDir(dir) {
    if (!readdirSync) return
    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) {
          scanDir(full)
        } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
          panelFiles.push(full)
        }
      }
    } catch {}
  }
  scanDir(panelsDir)
  scanDir(sidebarPanelsDir)

  const directMutations = []
  for (const file of panelFiles) {
    const content = readFileSync(file, 'utf8')
    const relPath = path.relative(editorRoot, file)
    const updateMatches = [...content.matchAll(/(?:useScene\.getState\(\)\.updateNode|state\.updateNode|\bupdateNode\()/g)]
    const deleteMatches = [...content.matchAll(/(?:useScene\.getState\(\)\.deleteNode|state\.deleteNode|\bdeleteNode\()/g)]

    if (updateMatches.length > 0 || deleteMatches.length > 0) {
      directMutations.push({
        file: relPath,
        updateCount: updateMatches.length,
        deleteCount: deleteMatches.length,
      })
    }
  }

  return { directMutations }
}

// 5. Run full audit
export function runCoverageAudit() {
  const actionTypes = getAssistantActionTypes()
  const actionTypesSet = new Set(actionTypes)
  const toolsAudit = getToolsAudit()
  const paletteAudit = getCommandPaletteAudit(actionTypesSet)
  const panelAudit = getPanelMutationsAudit()

  // Concrete known surface gaps for Phase 1
  const knownGaps = [
    { type: 'create_site', domain: 'structure', description: 'Create a new site node' },
    { type: 'create_building', domain: 'structure', description: 'Create a new building node under site' },
    { type: 'focus_camera_on_nodes', domain: 'viewer', description: 'Focus camera and frame specific nodes' },
    { type: 'add_cad_sketch_entities', domain: 'cad', description: 'Add sketch lines, rectangles, circles, arcs' },
    { type: 'set_cad_sketch_plane', domain: 'cad', description: 'Set CAD sketch workplane and orientation' },
    { type: 'reparent_node', domain: 'workspace', description: 'Reparent a node to another parent node' },
    { type: 'set_node_metadata', domain: 'workspace', description: 'Set custom metadata attributes on a node' },
  ].filter((g) => !actionTypesSet.has(g.type))

  return {
    actionTypeCount: actionTypes.length,
    toolsAudit,
    paletteAudit,
    panelAudit,
    knownGaps,
    timestamp: new Date().toISOString(),
  }
}

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const audit = runCoverageAudit()
  const isJson = process.argv.includes('--json')

  if (isJson) {
    process.stdout.write(JSON.stringify(audit, null, 2) + '\n')
  } else {
    console.log('=== Pistola Assistant Coverage Audit ===\n')
    console.log(`Registered Assistant Action Types: ${audit.actionTypeCount}`)
    console.log(`Audited Tool Manager Tools: ${audit.toolsAudit.managerTools.length}`)
    console.log(`Audited Command Palette Items: ${audit.paletteAudit.allCommands.length}`)
    console.log(`Panel Files with Direct Mutations: ${audit.panelAudit.directMutations.length}`)
    console.log('\n--- Phase 1 Surface Gaps to Close ---')
    for (const gap of audit.knownGaps) {
      console.log(`  * [${gap.domain}] ${gap.type}: ${gap.description}`)
    }
    console.log('\nAudit complete.')
  }
}
