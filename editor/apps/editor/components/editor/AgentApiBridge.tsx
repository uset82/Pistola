'use client'

import { createPistolaAgentApi } from '@pascal-app/editor'
import { useEffect } from 'react'

declare global {
  interface Window {
    pistola?: ReturnType<typeof createPistolaAgentApi>
  }
}

export function AgentApiBridge() {
  useEffect(() => {
    const api = createPistolaAgentApi()
    window.pistola = api
    document.documentElement.dataset.pistolaAgent = 'ready'
    return () => {
      if (window.pistola === api) delete window.pistola
      delete document.documentElement.dataset.pistolaAgent
    }
  }, [])

  return null
}
