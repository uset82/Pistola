'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'

type AuthMode = 'signin' | 'signup'

type AuthScreenProps = {
  configured: boolean
}

const AUTH_COPY: Record<
  AuthMode,
  {
    action: string
    title: string
    subtitle: string
  }
> = {
  signin: {
    action: 'Sign In',
    title: 'Sign in to Pistola',
    subtitle: 'Use the email account you want for this workspace.',
  },
  signup: {
    action: 'Create Account',
    title: 'Create your Pistola account',
    subtitle: 'You can use the same email address you use with OpenAI, but this login is local to Pistola.',
  },
}

export function AuthScreen({ configured }: AuthScreenProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const copy = AUTH_COPY[mode]

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!configured) return

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsPending(true)
    setError(null)

    try {
      const response = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'signin'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'Authentication failed.')
      }

      startTransition(() => {
        router.replace('/workspace')
        router.refresh()
      })
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Authentication failed.',
      )
      setIsPending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,183,77,0.22),_transparent_34%),linear-gradient(180deg,_oklch(0.995_0.005_80),_oklch(0.965_0.01_80))] px-6 py-10 text-foreground">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="inline-flex rounded-full border border-black/10 bg-white/80 px-3 py-1 font-medium text-[11px] uppercase tracking-[0.22em] text-black/70 backdrop-blur">
            Pistola Workspace Access
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl font-barlow text-5xl leading-[0.95] tracking-[-0.04em] text-black sm:text-6xl">
              The editor is now behind a real account.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-black/70 sm:text-lg">
              Create an account with your email and password. If you want, use the same email
              address you use for OpenAI, but the authentication is owned by this app.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-black/10 bg-white/75 p-4 backdrop-blur">
              <div className="font-barlow font-semibold text-black">Local account</div>
              <p className="mt-2 text-sm leading-6 text-black/65">
                Email and password are managed by Pistola, not by OpenAI or ChatGPT.
              </p>
            </div>
            <div className="rounded-3xl border border-black/10 bg-white/75 p-4 backdrop-blur">
              <div className="font-barlow font-semibold text-black">Protected routes</div>
              <p className="mt-2 text-sm leading-6 text-black/65">
                The editor and AI endpoints are only available once a session exists.
              </p>
            </div>
            <div className="rounded-3xl border border-black/10 bg-white/75 p-4 backdrop-blur">
              <div className="font-barlow font-semibold text-black">OpenAI-backed AI</div>
              <p className="mt-2 text-sm leading-6 text-black/65">
                Your account gets you into the app; OpenAI powers the assistant behind it.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white/90 p-6 shadow-[0_24px_90px_-36px_rgba(0,0,0,0.35)] backdrop-blur sm:p-8">
          {configured ? (
            <>
              <div className="mb-6 flex rounded-full bg-black/5 p-1">
                {(['signup', 'signin'] as const).map((nextMode) => (
                  <button
                    className={`flex-1 rounded-full px-4 py-2 font-medium text-sm transition ${
                      mode === nextMode
                        ? 'bg-black text-white shadow-sm'
                        : 'text-black/65 hover:text-black'
                    }`}
                    key={nextMode}
                    onClick={() => {
                      setMode(nextMode)
                      setError(null)
                    }}
                    type="button"
                  >
                    {AUTH_COPY[nextMode].action}
                  </button>
                ))}
              </div>

              <div className="mb-6 space-y-2">
                <h2 className="font-barlow text-3xl tracking-[-0.03em] text-black">
                  {copy.title}
                </h2>
                <p className="text-sm leading-6 text-black/65">{copy.subtitle}</p>
              </div>

              <form className="space-y-4" onSubmit={onSubmit}>
                <label className="block space-y-2">
                  <span className="font-medium text-sm text-black/70">Email</span>
                  <input
                    autoComplete="email"
                    className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none transition focus:border-black/25 focus:ring-4 focus:ring-black/5"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    type="email"
                    value={email}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="font-medium text-sm text-black/70">Password</span>
                  <input
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none transition focus:border-black/25 focus:ring-4 focus:ring-black/5"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    type="password"
                    value={password}
                  />
                </label>

                {mode === 'signup' ? (
                  <label className="block space-y-2">
                    <span className="font-medium text-sm text-black/70">Confirm Password</span>
                    <input
                      autoComplete="new-password"
                      className="h-11 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none transition focus:border-black/25 focus:ring-4 focus:ring-black/5"
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repeat your password"
                      type="password"
                      value={confirmPassword}
                    />
                  </label>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  className="flex h-12 w-full items-center justify-center rounded-2xl bg-black px-4 font-medium text-sm text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending ? 'Working...' : copy.action}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <h2 className="font-barlow text-3xl tracking-[-0.03em] text-black">
                Auth is not configured yet
              </h2>
              <p className="text-sm leading-6 text-black/65">
                Set <code>POSTGRES_URL</code> and <code>BETTER_AUTH_SECRET</code> in{' '}
                <code>apps/editor/.env.local</code>, then restart the app.
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between text-xs text-black/55">
            <Link className="hover:text-black" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-black" href="/terms">
              Terms
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
