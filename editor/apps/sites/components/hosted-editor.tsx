'use client'

import { PistolaWorkspaceShell } from '../../editor/components/editor/PistolaWorkspaceShell'
import { WebMcpSceneTools } from './webmcp-scene-tools'

export function HostedEditor() {
  return (
    <PistolaWorkspaceShell>
      <WebMcpSceneTools />
    </PistolaWorkspaceShell>
  )
}
