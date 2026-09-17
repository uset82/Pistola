import { NextResponse } from 'next/server'

import { isAuthConfigured } from '@/lib/auth/config'
import { normalizeAuthEmail, validateAuthEmail, validateAuthPassword } from '@/lib/auth/credentials'
import { getAuthUserByEmail } from '@/lib/auth/db'
import { verifyAuthPassword } from '@/lib/auth/password'
import { getAuthBody, unavailableAuthResponse } from '@/lib/auth/route'
import { setCurrentAuthSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return unavailableAuthResponse()
  }

  try {
    const body = await getAuthBody(request)
    const email = typeof body?.email === 'string' ? body.email : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    const emailError = validateAuthEmail(email)
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 })
    }

    const passwordError = validateAuthPassword(password)
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 })
    }

    const user = await getAuthUserByEmail(normalizeAuthEmail(email))
    if (!user || !(await verifyAuthPassword(password, user.password_hash))) {
      return NextResponse.json(
        {
          error: 'Invalid email or password.',
        },
        { status: 401 },
      )
    }

    await setCurrentAuthSession(user.id)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to sign in.',
      },
      { status: 500 },
    )
  }
}

