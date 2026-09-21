'use client'

import { Editor } from '@pascal-app/editor'
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
  return (
    <BuiltinNodesBootstrap>
      <div className="relative h-screen w-screen overflow-hidden">
        <DevStoreBridge />
        <WorkspaceBridge />
        <AgentApiBridge />
        <WebMcpSceneTools />
        <OperatorPlanPanel />
        <WorkspaceMenuBar />
        <ProjectModals />
        <AiAssistantPanel />
        {userEmail ? <AccountBadge email={userEmail} /> : null}
        {children}
        <Editor />
      </div>
    </BuiltinNodesBootstrap>
  )
}
