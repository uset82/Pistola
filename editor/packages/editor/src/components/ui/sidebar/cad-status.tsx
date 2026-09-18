'use client'

import { Bot, RefreshCcw } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '../../../lib/utils'
import useCad, { cadHelperUnavailableMessage } from '../../../store/use-cad'
import useMac from '../../../store/use-mac'

export function CadStatus() {
  const helperStatus = useCad((state) => state.helperStatus)
  const helperInfo = useCad((state) => state.helperInfo)
  const lastError = useCad((state) => state.lastError)
  const refreshHealth = useCad((state) => state.refreshHealth)
  const macStatus = useMac((state) => state.helperStatus)
  const macInfo = useMac((state) => state.helperInfo)
  const refreshMacHealth = useMac((state) => state.refreshHealth)

  useEffect(() => {
    void refreshHealth()
    void refreshMacHealth()
  }, [refreshHealth, refreshMacHealth])

  const isStub =
    helperInfo?.engine === 'freecad-stub' ||
    helperInfo?.engine === 'mock' ||
    helperInfo?.engine === 'mock-freecad' ||
    (helperInfo?.runtime === 'mock' && helperStatus === 'ready')
  const isRealFreecad = helperInfo?.engine === 'freecad'
  const isMissingBuild =
    helperStatus === 'error' &&
    (lastError?.includes('FREECAD_PATH') || lastError?.includes('FreeCADCmd'))

  const tone =
    helperStatus === 'ready'
      ? isStub
        ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : helperStatus === 'busy' || helperStatus === 'checking'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-border/60 bg-background/40 text-muted-foreground'

  const engineLabel = isStub
    ? 'freecad preview'
    : isRealFreecad
      ? 'freecad'
      : helperInfo?.engine ?? 'freecad'
  const macLabel =
    macInfo?.engine === 'mac-mock' || macInfo?.runtime === 'mock'
      ? 'mac preview'
      : macStatus === 'ready'
        ? 'mac'
        : 'mac offline'

  const helperLabel =
    helperStatus === 'error' && macStatus === 'error'
      ? isMissingBuild
        ? 'Set FREECAD_PATH to FreeCADCmd.exe'
        : lastError || cadHelperUnavailableMessage
      : `${engineLabel} • ${macLabel}`

  const headerLabel = 'CAD Engines'

  return (
    <button
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:bg-white/5',
        tone,
      )}
      onClick={() => {
        void refreshHealth()
        void refreshMacHealth()
      }}
      title={lastError || helperInfo?.runtime || 'Refresh CAD and MAC helper status'}
      type="button"
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4" />
        <div>
          <div className="font-medium text-xs uppercase tracking-wide">{headerLabel}</div>
          <div className="text-[11px] opacity-80">{helperLabel}</div>
        </div>
      </div>
      <RefreshCcw className="h-3.5 w-3.5 opacity-70" />
    </button>
  )
}
