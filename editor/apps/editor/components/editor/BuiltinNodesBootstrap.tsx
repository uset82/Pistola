'use client'

import { loadPlugin } from '@pascal-app/core'
import { builtinPlugin } from '@pascal-app/nodes'
import { useEffect, useState, type ReactNode } from 'react'

let pluginPromise: Promise<void> | null = null

const ensureBuiltinPlugin = () => {
  if (!pluginPromise) {
    pluginPromise = loadPlugin(builtinPlugin).catch((error) => {
      pluginPromise = null
      throw error
    })
  }
  return pluginPromise
}

/**
 * Loads the public Pascal builtinPlugin once before mounting children that
 * depend on the node registry (Viewer / workspace).
 */
export function BuiltinNodesBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureBuiltinPlugin()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-red-400">
        Failed to load Pascal node plugin: {error}
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading Pascal nodes…
      </div>
    )
  }

  return <>{children}</>
}
