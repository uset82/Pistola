'use client'

import { Editor } from '@pascal-app/editor'
import type { ReactNode } from 'react'

import { AccountBadge } from './AccountBadge'
import { AiAssistantPanel } from './AiAssistantPanel'
import { DevStoreBridge } from './DevStoreBridge'
import { WorkspaceBridge } from './WorkspaceBridge'

type PistolaWorkspaceShellProps = {
  userEmail?: string
  children?: ReactNode
}

export function PistolaWorkspaceShell({ userEmail, children }: PistolaWorkspaceShellProps = {}) {
  return (
    <div className="relative h-screen w-screen">
      <DevStoreBridge />
      <WorkspaceBridge />
      <AiAssistantPanel />
      {userEmail ? <AccountBadge email={userEmail} /> : null}
      {children}
      <Editor />
    </div>
  )
}
