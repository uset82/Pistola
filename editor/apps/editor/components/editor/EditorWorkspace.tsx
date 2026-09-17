'use client'

import { Editor } from '@pascal-app/editor'

import { AccountBadge } from './AccountBadge'
import { AiAssistantPanel } from './AiAssistantPanel'
import { DevStoreBridge } from './DevStoreBridge'

type EditorWorkspaceProps = {
  userEmail?: string
}

export function EditorWorkspace({ userEmail }: EditorWorkspaceProps = {}) {
  return (
    <div className="relative h-screen w-screen">
      <DevStoreBridge />
      <AiAssistantPanel />
      {userEmail ? <AccountBadge email={userEmail} /> : null}
      <Editor />
    </div>
  )
}

