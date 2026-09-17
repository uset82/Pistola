import { NextResponse } from 'next/server'

import { clearCurrentAuthSession } from '@/lib/auth/session'

export async function POST() {
  try {
    await clearCurrentAuthSession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to sign out.',
      },
      { status: 500 },
    )
  }
}

