import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { capabilities } from './registry'

// Allowlist for operations that are intentionally manual-only (UI dialogs, auth, hardware, raw file picking)
export const manualOnlyAllowlist = new Map<string, string>([
  ['Help / Documentation', 'External link/documentation modal'],
  ['Keyboard Shortcuts', 'Static keyboard shortcut reference dialog'],
  ['Sign In / Auth', 'Authentication and session handling'],
  ['Feedback Dialog', 'User feedback modal'],
  ['Browse Local File', 'Browser local file input dialog'],
])

export type CoverageAuditResult = {
  actionTypeCount: number
  toolsAudit: {
    managerTools: string[]
    assistantTools: string[]
    gaps: Array<{ category: string; name: string; reason: string }>
  }
  paletteAudit: {
    allCommands: string[]
    gaps: Array<{ category: string; name: string; reason: string }>
  }
  panelAudit: {
    directMutations: Array<{ file: string; updateCount: number; deleteCount: number }>
  }
  knownGaps: Array<{ type: string; domain: string; description: string }>
  timestamp: string
}

export function runCoverageAudit(editorRootPath?: string): CoverageAuditResult {
  const root =
    editorRootPath ??
    path.resolve(process.cwd().includes('packages') ? path.join(process.cwd(), '..', '..') : process.cwd())

  const commandPalettePath = path.join(
    root,
    'packages',
    'editor',
    'src',
    'components',
    'ui',
    'command-palette',
    'index.tsx',
  )
  const toolManagerPath = path.join(
    root,
    'packages',
    'editor',
    'src',
    'components',
    'tools',
    'tool-manager.tsx',
  )
  const toolSurfacePath = path.join(
    root,
    'packages',
    'editor',
    'src',
    'lib',
    'assistant',
    'tool-surface.ts',
  )
  const panelsDir = path.join(
    root,
    'packages',
    'editor',
    'src',
    'components',
    'ui',
    'panels',
  )
  const sidebarPanelsDir = path.join(
    root,
    'packages',
    'editor',
    'src',
    'components',
    'ui',
    'sidebar',
    'panels',
  )

  const registeredTypes = new Set(capabilities.map((c) => c.type))

  // 1. Tool manager
  const toolManagerContent = readFileSync(toolManagerPath, 'utf8')
  const toolSurfaceContent = readFileSync(toolSurfacePath, 'utf8')

  const toolSurfaceMatch = toolSurfaceContent.match(
    /export const assistantToolValues = \[([\s\S]*?)\] as const/,
  )
  const assistantTools = new Set(
    toolSurfaceMatch?.[1]
      ? toolSurfaceMatch[1]
          .split('\n')
          .map((l) => l.trim().replace(/[',]/g, ''))
          .filter((l) => l.length > 0 && !l.startsWith('//'))
      : [],
  )

  const toolsStart = toolManagerContent.indexOf('const tools:')
  const toolsEnd = toolManagerContent.indexOf('export const ToolManager')
  const toolsBlock = toolsStart !== -1 && toolsEnd !== -1 ? toolManagerContent.slice(toolsStart, toolsEnd) : toolManagerContent

  const managerToolMatches = [
    ...toolsBlock.matchAll(/(?:'([a-z0-9-]+)'|\b([a-z0-9-]+))\s*:\s*[A-Z][A-Za-z0-9]+/g),
  ]
  const managerTools = new Set<string>(
    managerToolMatches
      .map((m) => m[1] || m[2])
      .filter((t): t is string => Boolean(t && t !== 'tools' && t !== 'site' && t !== 'structure' && t !== 'furnish' && t !== 'cad')),
  )

  const toolGaps: Array<{ category: string; name: string; reason: string }> = []
  for (const tool of managerTools) {
    if (!assistantTools.has(tool) && !assistantTools.has(`cad-${tool}`)) {
      toolGaps.push({
        category: 'tool',
        name: tool,
        reason: 'Tool mounted in ToolManager without AssistantToolValue',
      })
    }
  }

  // 2. Command Palette
  const paletteContent = readFileSync(commandPalettePath, 'utf8')
  const itemMatches = [...paletteContent.matchAll(/<Item[\s\S]*?label="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((x): x is string => Boolean(x))
  const optionMatches = [...paletteContent.matchAll(/<OptionItem[\s\S]*?label="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((x): x is string => Boolean(x))
  const allCommands: string[] = Array.from(new Set([...itemMatches, ...optionMatches]))

  const paletteGaps: Array<{ category: string; name: string; reason: string }> = []
  for (const cmd of allCommands) {
    if (manualOnlyAllowlist.has(cmd)) continue
    if (
      cmd.includes('Create Site') ||
      cmd.includes('New Site') ||
      cmd.includes('Create Building') ||
      cmd.includes('New Building')
    ) {
      if (!registeredTypes.has('create_site') && !registeredTypes.has('create_building')) {
        paletteGaps.push({
          category: 'command-palette',
          name: cmd,
          reason: 'Site/Building creation lacks dedicated assistant action',
        })
      }
    }
  }

  // 3. Panels
  const panelFiles: string[] = []
  function scanDir(dir: string) {
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

  const directMutations: Array<{ file: string; updateCount: number; deleteCount: number }> = []
  for (const file of panelFiles) {
    const content = readFileSync(file, 'utf8')
    const relPath = path.relative(root, file)
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

  // Surface gaps to close in Phase 1
  const knownGaps = [
    { type: 'create_site', domain: 'structure', description: 'Create a new site node' },
    { type: 'create_building', domain: 'structure', description: 'Create a new building node under site' },
    { type: 'focus_camera_on_nodes', domain: 'viewer', description: 'Focus camera and frame specific nodes' },
    { type: 'add_cad_sketch_entities', domain: 'cad', description: 'Add sketch lines, rectangles, circles, arcs' },
    { type: 'set_cad_sketch_plane', domain: 'cad', description: 'Set CAD sketch workplane and orientation' },
    { type: 'reparent_node', domain: 'workspace', description: 'Reparent a node to another parent node' },
    { type: 'set_node_metadata', domain: 'workspace', description: 'Set custom metadata attributes on a node' },
  ].filter((g) => !registeredTypes.has(g.type))

  return {
    actionTypeCount: capabilities.length,
    toolsAudit: {
      managerTools: Array.from(managerTools),
      assistantTools: Array.from(assistantTools),
      gaps: toolGaps,
    },
    paletteAudit: {
      allCommands,
      gaps: paletteGaps,
    },
    panelAudit: {
      directMutations,
    },
    knownGaps,
    timestamp: new Date().toISOString(),
  }
}
