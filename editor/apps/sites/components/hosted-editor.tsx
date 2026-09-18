'use client'

import { Editor } from '@pascal-app/editor'
import { WebMcpSceneTools } from './webmcp-scene-tools'

export function HostedEditor() {
  return (
    <div className="h-[100dvh] w-full overflow-hidden">
      <WebMcpSceneTools />
      <Editor
        enableCad
        enableCadRuntime
        sidebarTop={
          <div className="rounded-lg border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sky-100 text-xs leading-5">
            <div className="font-semibold tracking-wide">Pistola CAD on Sites</div>
            <p className="mt-0.5 text-sky-100/75">
              Browser sketches stay here. FreeCAD solids and Multi-Agent-CAD parts run through
              Pistola Canner as CAD engines.
            </p>
          </div>
        }
      />
    </div>
  )
}
