'use client'

import { useScene } from '@pascal-app/core'
import { useCad } from '@pascal-app/editor'
import { useEffect, useMemo } from 'react'

type HelperTone = 'ready' | 'busy' | 'error'

const POLL_INTERVAL_MS = 10_000

export function CadHelperStatus() {
  const nodes = useScene((state) => state.nodes)
  const helperStatus = useCad((state) => state.helperStatus)
  const helperInfo = useCad((state) => state.helperInfo)
  const lastError = useCad((state) => state.lastError)
  const refreshHealth = useCad((state) => state.refreshHealth)

  const hasBusyBody = useMemo(
    () =>
      Object.values(nodes).some(
        (node) =>
          node.type === 'cad-body' &&
          (node.regenStatus === 'building' ||
            node.regenStatus === 'pending' ||
            node.regenStatus === 'running' ||
            node.regenStatus === 'queued'),
      ),
    [nodes],
  )

  useEffect(() => {
    void refreshHealth()
    const interval = window.setInterval(() => {
      void refreshHealth()
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [refreshHealth])

  const tone: HelperTone =
    helperStatus === 'error'
      ? 'error'
      : hasBusyBody || helperStatus === 'busy' || helperStatus === 'checking' || helperStatus === 'unknown'
        ? 'busy'
        : 'ready'

  const isRealFreecad = helperInfo?.engine === 'freecad'
  const isStub =
    helperInfo?.engine === 'freecad-stub' ||
    helperInfo?.engine === 'mock' ||
    (helperInfo?.runtime === 'mock' && helperStatus === 'ready')
  const isMissingBuild =
    helperStatus === 'error' &&
    (lastError?.includes('FREECAD_PATH') || lastError?.includes('FreeCADCmd'))

  const helperMeta =
    [helperInfo?.runtime, helperInfo?.engine, helperInfo?.version].filter(Boolean).join(' • ') ||
    (helperStatus === 'error'
      ? 'helper unavailable'
      : helperStatus === 'unknown' || helperStatus === 'checking'
        ? 'checking helper'
        : 'helper ready')

  const dotClass =
    tone === 'ready'
      ? isStub
        ? 'bg-yellow-400'
        : 'bg-emerald-400'
      : tone === 'busy'
        ? 'bg-amber-400'
        : 'bg-rose-400'

  const label =
    tone === 'ready'
      ? isStub
        ? 'CAD helper (mock)'
        : isRealFreecad
          ? 'FreeCAD ready'
          : 'CAD helper ready'
      : tone === 'busy'
        ? helperStatus === 'unknown' || helperStatus === 'checking'
          ? 'CAD helper checking'
          : 'CAD helper busy'
        : isMissingBuild
          ? 'FreeCAD build missing'
          : 'CAD helper error'

  const displayError = isMissingBuild
    ? 'Set FREECAD_PATH to your FreeCADCmd.exe build or run the FreeCAD submodule build.'
    : lastError

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[120]">
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3 py-2 text-white shadow-lg backdrop-blur-md"
        title={displayError || helperMeta}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em]">{label}</span>
          <span className="text-[11px] text-white/65">{displayError || helperMeta}</span>
        </div>
      </div>
    </div>
  )
}
