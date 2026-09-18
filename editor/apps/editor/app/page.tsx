import { HowPistolaWorks } from '@/components/auth/HowPistolaWorks'
import { isAuthConfigured } from '@/lib/auth/config'
import { getCurrentAuthSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await getCurrentAuthSession()
  if (session) {
    redirect('/workspace')
  }

  return <HowPistolaWorks configured={isAuthConfigured()} />
}

