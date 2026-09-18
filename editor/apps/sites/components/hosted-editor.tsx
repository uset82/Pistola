'use client'

import { Editor } from '@pascal-app/editor'
import { MacCadPanel } from './mac-cad-panel'
import { WebMcpSceneTools } from './webmcp-scene-tools'

export function HostedEditor() {
  return (
    <div className="h-[100dvh] w-full overflow-hidden">
      <WebMcpSceneTools />
      <MacCadPanel />
      <Editor
        enableCad
        enableCadRuntime
        sidebarTop={
          <div className="rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sky-100 text-xs leading-5">
            <div className="font-semibold tracking-wide">Pistola browser preview</div>
            <p className="mt-0.5 text-sky-100/75">
            Scenes stay in this browser while FreeCAD solids, STEP I/O, and Multi-Agent-CAD run through
            Pistola Canner. Sign in to Pistola Canner before starting a server-side CAD job.
            </p>
          </div>
        }
      />
    </div>
  )
}
