'use client'

import { Search } from 'lucide-react'
import { Button } from '../../../components/ui/primitives/button'
import { useCommandPalette } from '../../../components/ui/command-palette'

export function CommandsTrigger() {
  const setOpen = useCommandPalette((state) => state.setOpen)

  return (
    <Button
      className="h-10 w-full justify-between rounded-xl border-border/60 bg-accent/30 px-3 text-foreground hover:bg-accent/60"
      onClick={() => setOpen(true)}
      type="button"
      variant="outline"
    >
      <span className="flex items-center gap-2">
        <Search className="h-4 w-4" />
        <span className="font-medium">Commands</span>
      </span>
      <span className="rounded-md border border-border/40 bg-background/70 px-2 py-1 font-medium font-mono text-[10px] text-muted-foreground leading-none">
        Ctrl/Cmd + K
      </span>
    </Button>
  )
}
