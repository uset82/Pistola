'use client'

import { Geist, Geist_Mono } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'
import { LandingViewport } from './LandingViewport'

const sans = Geist({ subsets: ['latin'], variable: '--font-pistola-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-pistola-mono' })

const GITHUB_URL = 'https://github.com/uset82/Pistola'

type AuthMode = 'signin' | 'signup'

type HowPistolaWorksProps = {
  configured: boolean
  legalOrigin?: string
}

const LOOP = [
  {
    step: '01',
    name: 'describe',
    text: 'Write a prompt or drop a sketch. Say the object, scale, and what it must do.',
  },
  {
    step: '02',
    name: 'interpret',
    text: 'The assistant turns that into a brief: geometry, materials, constraints, assumptions.',
  },
  {
    step: '03',
    name: 'plan',
    text: 'The brief becomes editor steps — scene nodes, sketches, or a CAD generation job.',
  },
  {
    step: '04',
    name: 'execute',
    text: 'Pistola runs those steps in the live workspace. Clear edits apply immediately.',
  },
  {
    step: '05',
    name: 'preview',
    text: 'The 3D scene updates. You see a model you can select, move, and keep editing.',
  },
  {
    step: '06',
    name: 'refine',
    text: 'Keep talking. Change proportions, materials, or regenerate a part until it is usable.',
  },
] as const

const PROMPTS = [
  'Create a futuristic sports car with oversized rear wheels.',
  'Turn this sketch into a clean hard-surface prototype.',
  'Make a 50×50×6 mm plate with a 20 mm central hole.',
]

const FOCUS = ''

export function HowPistolaWorks({ configured, legalOrigin }: HowPistolaWorksProps) {
  const privacyHref = legalOrigin ? `${legalOrigin.replace(/\/+$/, '')}/privacy` : '/privacy'
  const termsHref = legalOrigin ? `${legalOrigin.replace(/\/+$/, '')}/terms` : '/terms'
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [activePrompt, setActivePrompt] = useState(PROMPTS[0])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
        headers: { 'Content-Type': 'application/json' },
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
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
      setIsPending(false)
    }
  }

  return (
    <main
      className={`pistola-how ${sans.variable} ${mono.variable} min-h-svh bg-[var(--void)] text-[var(--paper)]`}
    >
      <style>{`
        .pistola-how {
          --void: #0c0c0b;
          --steel: #1a1a18;
          --paper: #f3efe6;
          --mute: #9a958c;
          --mark: #c6b59a;
          font-family: var(--font-pistola-sans), ui-sans-serif, system-ui, sans-serif;
        }
        .pistola-how .mono { font-family: var(--font-pistola-mono), ui-monospace, SFMono-Regular, Menlo, monospace; }
        .pistola-how .cta {
          background: var(--paper);
          color: var(--void);
        }
        .pistola-how .cta:hover { background: #faf7f0; }
        .pistola-how :focus-visible {
          outline: 2px solid var(--mark);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .pistola-how * { scroll-behavior: auto !important; }
        }
      `}</style>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[var(--void)] px-5 py-3 sm:px-8">
        <a className={`text-sm font-medium tracking-tight ${FOCUS}`} href="/">
          Pistola
        </a>
        <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-3">
          <a
            aria-label="Collaborate on GitHub"
            className={`mono hidden text-[12px] text-[var(--mute)] hover:text-[var(--paper)] sm:inline ${FOCUS}`}
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            Collaborate
          </a>
          <a
            className={`cta inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium ${FOCUS}`}
            href="/workspace"
          >
            Open workspace
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:py-16">
        <div>
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">
            AI-native 3D editor
          </p>
          <h1 className="mt-4 max-w-xl text-[clamp(2.5rem,5.4vw,4.4rem)] font-medium leading-[0.98] tracking-[-0.045em]">
            Say the object.
            <br />
            Get a model.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-[var(--mute)]">
            A prompt or sketch becomes an editable scene in the live editor. You refine it in place.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              className={`cta inline-flex h-10 items-center rounded-md px-4 text-sm font-medium ${FOCUS}`}
              href="/workspace"
            >
              Open workspace
            </a>
            <a
              aria-label="Collaborate on GitHub"
              className={`inline-flex h-10 items-center rounded-md border border-white/15 px-4 text-sm hover:border-white/30 hover:bg-white/5 ${FOCUS}`}
              href={GITHUB_URL}
              rel="noreferrer"
              target="_blank"
            >
              Collaborate on GitHub
            </a>
          </div>
        </div>
        <LandingViewport caption={activePrompt} />
      </section>

      <section className="border-t border-white/10 px-5 py-14 sm:px-8" id="loop">
        <div className="mx-auto max-w-6xl">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">Pipeline</p>
          <h2 className="mt-3 max-w-xl text-2xl font-medium tracking-tight sm:text-3xl">
            Six commands from prompt to prototype.
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-6">
            {LOOP.map((item) => (
              <li className="bg-[var(--steel)] px-4 py-4" key={item.step}>
                <p className="mono text-[11px] text-[var(--mute)]">{item.step}</p>
                <p className="mono mt-2 text-sm">{item.name}</p>
                <p className="mt-2 text-[13px] leading-5 text-[var(--mute)]">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[16rem_1fr] lg:items-start">
          <div>
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">You say</p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight">Plain language. Real geometry.</h2>
          </div>
          <div className="flex flex-col gap-2" role="list">
            {PROMPTS.map((prompt) => {
              const selected = prompt === activePrompt
              return (
                <button
                  aria-pressed={selected}
                  className={`mono rounded-lg border px-4 py-3 text-left text-[13px] leading-6 ${FOCUS} ${
                    selected
                      ? 'border-white/25 bg-white/[0.06] text-[var(--paper)]'
                      : 'border-white/10 text-[var(--mute)] hover:border-white/20 hover:text-[var(--paper)]'
                  }`}
                  key={prompt}
                  onClick={() => setActivePrompt(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">Inside the system</p>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-medium">Scene editor</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--mute)]">
                Built on Pascal. Walls, levels, items, and CAD bodies live in one scene graph you can
                select and undo.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium">Two CAD engines</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--mute)]">
                FreeCAD for sketches, extrudes, and fillets. Multi-Agent-CAD for standalone mechanical
                parts from a longer brief.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium">IDE control</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--mute)]">
                Cursor, VS Code, or Codex can drive the same workspace through MCP. Your installed
                OpenRouter model powers planning and generation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[var(--steel)] px-5 py-14 sm:px-8" id="collaborate">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">Open source</p>
            <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">Anyone can collaborate.</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--mute)]">
              Open an issue, fork the repo, or send a pull request. The public editor has no account
              wall.
            </p>
            <p className="mono mt-4 text-[13px] text-[var(--mute)]">github.com/uset82/Pistola</p>
          </div>
          <a
            aria-label="Collaborate on GitHub"
            className={`inline-flex h-10 shrink-0 items-center rounded-md border border-white/15 px-4 text-sm hover:border-white/30 hover:bg-white/5 ${FOCUS}`}
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            View the repository
          </a>
        </div>
      </section>

      <section className="border-t border-white/10 px-5 py-14 sm:px-8" id="start">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--mute)]">Start</p>
              <h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">Open a live workspace.</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[var(--mute)]">
                {configured
                  ? 'Sign in to keep a session, or enter the editor and start prompting.'
                  : 'No account wall. The editor is the product.'}
              </p>
            </div>
            <a
              className={`cta inline-flex h-10 items-center rounded-md px-4 text-sm font-medium ${FOCUS}`}
              href="/workspace"
            >
              Enter the editor
            </a>
          </div>

          {configured ? (
            <form className="mt-12 max-w-md space-y-4 border-t border-white/10 pt-8" onSubmit={handleSubmit}>
              <div className="flex gap-4 text-[12px]">
                {(['signin', 'signup'] as const).map((nextMode) => (
                  <button
                    className={`${FOCUS} ${
                      mode === nextMode ? 'text-[var(--paper)]' : 'text-[var(--mute)] hover:text-[var(--paper)]'
                    }`}
                    key={nextMode}
                    onClick={() => {
                      setMode(nextMode)
                      setError(null)
                    }}
                    type="button"
                  >
                    {nextMode === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
              <input
                autoComplete="email"
                className={`h-11 w-full border-b border-white/15 bg-transparent text-sm outline-none placeholder:text-zinc-600 focus:border-[var(--mark)] ${FOCUS}`}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                type="email"
                value={email}
              />
              <input
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className={`h-11 w-full border-b border-white/15 bg-transparent text-sm outline-none placeholder:text-zinc-600 focus:border-[var(--mark)] ${FOCUS}`}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                value={password}
              />
              {mode === 'signup' ? (
                <input
                  autoComplete="new-password"
                  className={`h-11 w-full border-b border-white/15 bg-transparent text-sm outline-none placeholder:text-zinc-600 focus:border-[var(--mark)] ${FOCUS}`}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  type="password"
                  value={confirmPassword}
                />
              ) : null}
              {error ? (
                <p className="text-sm text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                className={`h-10 text-sm text-[var(--paper)] underline-offset-4 hover:underline disabled:opacity-50 ${FOCUS}`}
                disabled={isPending}
                type="submit"
              >
                {isPending ? 'Working…' : mode === 'signin' ? 'Continue' : 'Create account'}
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-6 text-[12px] text-[var(--mute)] sm:px-8">
        <a
          aria-label="Collaborate on GitHub"
          className={`hover:text-[var(--paper)] ${FOCUS}`}
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
        <div className="flex gap-4">
          <a className={`hover:text-[var(--paper)] ${FOCUS}`} href={privacyHref}>
            Privacy
          </a>
          <a className={`hover:text-[var(--paper)] ${FOCUS}`} href={termsHref}>
            Terms
          </a>
        </div>
      </footer>
    </main>
  )
}
