'use client'

import { PistolaWorkspaceShell } from './PistolaWorkspaceShell'

type EditorWorkspaceProps = {
  userEmail?: string
}

export function EditorWorkspace({ userEmail }: EditorWorkspaceProps = {}) {
  return <PistolaWorkspaceShell userEmail={userEmail} />
}
