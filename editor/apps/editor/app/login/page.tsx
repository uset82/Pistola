import { AuthScreen } from '@/components/auth/AuthScreen'
import { isAuthConfigured } from '@/lib/auth/config'
import { getCurrentAuthSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const session = await getCurrentAuthSession()
  if (session) {
    redirect('/workspace')
  }

  return <AuthScreen configured={isAuthConfigured()} />
}
