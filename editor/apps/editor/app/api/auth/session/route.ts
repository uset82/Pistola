import { NextResponse } from 'next/server'

import { isAuthConfigured } from '@/lib/auth/config'
import { getCurrentAuthSession } from '@/lib/auth/session'

export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        authenticated: false,
        configured: false,
      },
      { status: 200 },
    )
  }

  const session = await getCurrentAuthSession()
  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        configured: true,
      },
      { status: 200 },
    )
  }

  return NextResponse.json({
    authenticated: true,
    configured: true,
    user: session.user,
    expiresAt: session.expiresAt.toISOString(),
  })
}

