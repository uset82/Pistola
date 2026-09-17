'use client'

import { AlertCircle } from 'lucide-react'
import { useEffect } from 'react'
import useCad from '../../../store/use-cad'

const TOAST_TIMEOUT_MS = 2400

export function CadCommandToast() {
  const commandToast = useCad((state) => state.commandToast)
  const clearCommandToast = useCad((state) => state.clearCommandToast)

  useEffect(() => {
    if (!commandToast) return

    const timeout = window.setTimeout(() => {
      clearCommandToast()
    }, TOAST_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [clearCommandToast, commandToast])

  if (!commandToast) return null

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[75] w-[340px] -translate-x-1/2">
      <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-black/85 px-4 py-3 text-red-100 shadow-2xl backdrop-blur-xl">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="text-sm">{commandToast.message}</div>
      </div>
    </div>
  )
}
