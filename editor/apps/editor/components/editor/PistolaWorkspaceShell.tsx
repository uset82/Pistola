'use client'

import { Editor, useEditor } from '@pascal-app/editor'
import type { ReactNode } from 'react'

import { AccountBadge } from './AccountBadge'
import { AgentApiBridge } from './AgentApiBridge'
import { AiAssistantPanel } from './AiAssistantPanel'
import { BuiltinNodesBootstrap } from './BuiltinNodesBootstrap'
import { DevStoreBridge } from './DevStoreBridge'
import { OperatorPlanPanel } from './OperatorPlanPanel'
import { ProjectModals } from './ProjectModals'
import { WebMcpSceneTools } from './WebMcpSceneTools'
import { WorkspaceBridge } from './WorkspaceBridge'
import { WorkspaceMenuBar } from './WorkspaceMenuBar'

type PistolaWorkspaceShellProps = {
  userEmail?: string
  children?: ReactNode
}

export function PistolaWorkspaceShell({ userEmail, children }: PistolaWorkspaceShellProps = {}) {
  const isPreviewMode = useEditor((state) => state.isPreviewMode)
  return (
    <BuiltinNodesBootstrap>
      <div className="relative h-screen w-screen overflow-hidden">
        <DevStoreBridge />
        <WorkspaceBridge />
        <AgentApiBridge />
        <WebMcpSceneTools />
        {isPreviewMode ? null : <OperatorPlanPanel />}
        <WorkspaceMenuBar />
        <ProjectModals />
        {isPreviewMode ? null : <AiAssistantPanel />}
        {isPreviewMode || !userEmail ? null : <AccountBadge email={userEmail} />}
        {children}
        <Editor />
      </div>
    </BuiltinNodesBootstrap>
  )
}
