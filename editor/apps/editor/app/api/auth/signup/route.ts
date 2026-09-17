import { NextResponse } from 'next/server'

import { isAuthConfigured } from '@/lib/auth/config'
import { normalizeAuthEmail, validateAuthEmail, validateAuthPassword } from '@/lib/auth/credentials'
import { createAuthUser } from '@/lib/auth/db'
import { hashAuthPassword } from '@/lib/auth/password'
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

    const normalizedEmail = normalizeAuthEmail(email)
    const passwordHash = await hashAuthPassword(password)
    const user = await createAuthUser(normalizedEmail, passwordHash)

    if (!user) {
      return NextResponse.json({ error: 'Unable to create account.' }, { status: 500 })
    }

    await setCurrentAuthSession(user.id)

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
    })
  } catch (error) {
    const errorCode =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : null

    if (errorCode === '23505') {
      return NextResponse.json(
        {
          error: 'An account with that email already exists.',
        },
        { status: 409 },
      )
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to create account.',
      },
      { status: 500 },
    )
  }
}

