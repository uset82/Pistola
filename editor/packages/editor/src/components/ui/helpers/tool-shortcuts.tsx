import type { Phase, Tool } from '../../../store/use-editor'

export type ToolShortcutHint = {
  key: string
  label: string
}

const DRAWING_HINTS: ToolShortcutHint[] = [
  { key: 'Shift', label: 'Allow non-45° angles' },
  { key: 'Esc', label: 'Cancel' },
]

const ITEM_HINTS: ToolShortcutHint[] = [
  { key: 'R', label: 'Rotate counterclockwise' },
  { key: 'T', label: 'Rotate clockwise' },
  { key: 'Shift', label: 'Free place' },
]

const MOVING_HINTS: ToolShortcutHint[] = [...ITEM_HINTS, { key: 'Esc', label: 'Cancel' }]

const ROOF_HINTS: ToolShortcutHint[] = [{ key: 'Esc', label: 'Cancel' }]

export const getToolShortcutHints = ({
  movingNode,
  phase,
  tool,
}: {
  movingNode: boolean
  phase: Phase
  tool: Tool | null
}): ToolShortcutHint[] => {
  if (movingNode) return MOVING_HINTS
  if (phase === 'cad') return []

  switch (tool) {
    case 'wall':
    case 'slab':
    case 'ceiling':
      return DRAWING_HINTS
    case 'item':
      return ITEM_HINTS
    case 'roof':
      return ROOF_HINTS
    default:
      return []
  }
}

export function ToolShortcutBar({ hints }: { hints: ToolShortcutHint[] }) {
  if (hints.length === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {hints.map((hint) => (
        <div
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/55 px-2.5 py-1 text-[11px]"
          key={`${hint.key}-${hint.label}`}
        >
          <kbd className="inline-flex h-5 items-center rounded bg-muted px-1.5 font-medium text-[10px] text-foreground/90">
            {hint.key}
          </kbd>
          <span className="text-muted-foreground">{hint.label}</span>
        </div>
      ))}
    </div>
  )
}
