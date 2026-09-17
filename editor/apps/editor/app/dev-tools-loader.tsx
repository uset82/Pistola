'use client'

import { useEffect } from 'react'

const DEV_TOOL_SCRIPTS = [
  {
    id: 'react-scan',
    src: '//unpkg.com/react-scan/dist/auto.global.js',
  },
  {
    id: 'react-grab',
    src: '//unpkg.com/react-grab/dist/index.global.js',
  },
] as const

export function DevToolsLoader() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== '1'
    ) {
      return
    }

    const appendedScripts: HTMLScriptElement[] = []

    for (const tool of DEV_TOOL_SCRIPTS) {
      if (document.querySelector(`script[data-dev-tool="${tool.id}"]`)) {
        continue
      }

      // Load dev-only helpers after hydration so browser extensions cannot
      // invalidate the server-rendered head markup before React attaches.
      const script = document.createElement('script')
      script.src = tool.src
      script.crossOrigin = 'anonymous'
      script.dataset.devTool = tool.id

      document.head.appendChild(script)
      appendedScripts.push(script)
    }

    return () => {
      for (const script of appendedScripts) {
        script.remove()
      }
    }
  }, [])

  return null
}
