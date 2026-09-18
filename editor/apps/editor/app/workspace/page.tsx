import { EditorWorkspace } from '@/components/editor/EditorWorkspace'
import { isAuthConfigured, isLocalUnauthenticatedAccessEnabled } from '@/lib/auth/config'
import { getCurrentAuthSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function WorkspacePage() {
  const session = await getCurrentAuthSession()
  if (session) {
    return <EditorWorkspace userEmail={session.user.email} />
  }

  if (!isAuthConfigured() || isLocalUnauthenticatedAccessEnabled()) {
    return <EditorWorkspace />
  }

  redirect('/login')
}
