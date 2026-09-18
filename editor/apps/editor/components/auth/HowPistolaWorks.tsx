'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'

type AuthMode = 'signin' | 'signup'

type HowPistolaWorksProps = {
  configured: boolean
}

const LOOP = [
  {
    step: '01',
    name: 'Describe',
    text: 'Write a prompt or drop a sketch. Say the object, scale, and what it must do.',
  },
  {
    step: '02',
    name: 'Interpret',
    text: 'The assistant turns that into a brief: geometry, materials, constraints, assumptions.',
  },
  {
    step: '03',
    name: 'Plan',
    text: 'The brief becomes editor steps — scene nodes, sketches, or a CAD generation job.',
  },
  {
    step: '04',
    name: 'Execute',
    text: 'Pistola runs those steps in the live workspace. Clear edits apply immediately.',
  },
  {
    step: '05',
    name: 'Preview',
    text: 'The 3D scene updates. You see a model you can select, move, and keep editing.',
  },
  {
    step: '06',
    name: 'Refine',
    text: 'Keep talking. Change proportions, materials, or regenerate a part until it is usable.',
  },
] as const

const PROMPTS = [
  'Create a futuristic sports car with oversized rear wheels.',
  'Turn this sketch into a clean hard-surface prototype.',
  'Make a 50×50×6 mm plate with a 20 mm central hole.',
]

export function HowPistolaWorks({ configured }: HowPistolaWorksProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

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
    <main className="pistola-how min-h-svh bg-[#0c0b09] text-[#efe6d6]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;1,400&family=Instrument+Serif:ital@0;1&display=swap');
        .pistola-how { font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif; }
        .pistola-how .display { font-family: 'Instrument Serif', ui-serif, Georgia, serif; }
        @keyframes pistola-rise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pistola-draw {
          from { stroke-dashoffset: 240; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes pistola-glow {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        .pistola-how .rise { animation: pistola-rise 700ms ease both; }
        .pistola-how .filament { animation: pistola-draw 1.6s ease forwards, pistola-glow 3.2s ease-in-out 1.4s infinite; }
        .pistola-how .loop-row { transition: background 180ms ease, color 180ms ease; }
        .pistola-how .loop-row:hover { background: rgba(201, 132, 74, 0.08); }
      `}</style>

      <header className="absolute inset-x-0 top-0 z-10 flex items-end justify-between px-6 pt-6 sm:px-10">
        <p className="text-[11px] uppercase tracking-[0.34em] text-[#c9844a]">Pistola</p>
        <p className="hidden text-[11px] uppercase tracking-[0.22em] text-[#efe6d6]/45 sm:block">
          Idea to prototype
        </p>
      </header>

      <section className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden px-6 pb-16 pt-24 sm:px-10 sm:pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(80% 60% at 70% 20%, rgba(201,132,74,0.16), transparent 58%), linear-gradient(180deg, #14110e 0%, #0c0b09 72%)',
          }}
        />
        <svg
          aria-hidden
          className="pointer-events-none absolute right-[-8%] top-[12%] h-[70vmin] w-[70vmin] text-[#c9844a]"
          fill="none"
          viewBox="0 0 400 400"
        >
          <path
            className="filament"
            d="M40 300 C90 220, 80 120, 160 90 S300 80, 330 160 280 280, 200 310 70 340, 40 300"
            stroke="currentColor"
            strokeDasharray="240"
            strokeDashoffset="240"
            strokeWidth="1.25"
          />
          <path
            d="M160 90 L200 150 L260 130 L240 210 L180 200 Z"
            opacity="0.22"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle cx="200" cy="190" fill="currentColor" opacity="0.7" r="3" />
        </svg>

        <div className="relative max-w-3xl">
          <p className="rise text-[12px] uppercase tracking-[0.28em] text-[#c9844a]">
            How Pistola works
          </p>
          <h1 className="display rise mt-5 text-[clamp(3.4rem,9vw,7.4rem)] leading-[0.86] tracking-[-0.03em] text-[#f4ead8]">
            Say the object.
            <br />
            <span className="italic text-[#c9844a]">Get a model.</span>
          </h1>
          <p
            className="rise mt-8 max-w-md text-[1.05rem] leading-7 text-[#efe6d6]/68"
            style={{ animationDelay: '120ms' }}
          >
            Pistola turns a sentence or sketch into an editable 3D scene. Chat plans. The editor
            builds. You refine in place.
          </p>
          <div className="rise mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: '200ms' }}>
            <Link
              className="inline-flex h-12 items-center rounded-full bg-[#c9844a] px-6 text-sm font-medium text-[#1a110b] transition hover:bg-[#d5975c]"
              href="/workspace"
            >
              Open the workspace
            </Link>
            <a
              className="text-sm text-[#efe6d6]/55 underline-offset-4 transition hover:text-[#efe6d6] hover:underline"
              href="#loop"
            >
              See the loop
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-[#efe6d6]/10 px-6 py-20 sm:px-10" id="loop">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#c9844a]">The loop</p>
        <h2 className="display mt-3 max-w-xl text-4xl leading-[1.05] text-[#f4ead8] sm:text-5xl">
          Six moves from prompt to prototype.
        </h2>
        <ol className="mt-12 divide-y divide-[#efe6d6]/10 border-y border-[#efe6d6]/10">
          {LOOP.map((item) => (
            <li className="loop-row grid gap-3 px-0 py-6 sm:grid-cols-[4.5rem_11rem_1fr] sm:items-baseline" key={item.step}>
              <span className="font-mono text-[11px] tracking-[0.2em] text-[#c9844a]">{item.step}</span>
              <strong className="text-lg font-medium text-[#f4ead8]">{item.name}</strong>
              <p className="max-w-xl text-[0.95rem] leading-7 text-[#efe6d6]/62">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-6 py-20 sm:px-10">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#c9844a]">You say</p>
            <h2 className="display mt-3 text-4xl leading-[1.05] text-[#f4ead8] sm:text-5xl">
              Plain language. Real geometry.
            </h2>
          </div>
          <ul className="space-y-8">
            {PROMPTS.map((prompt) => (
              <li key={prompt}>
                <p className="display text-2xl leading-snug italic text-[#efe6d6]/88 sm:text-3xl">
                  “{prompt}”
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-[#efe6d6]/10 px-6 py-20 sm:px-10">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#c9844a]">Inside the system</p>
        <div className="mt-10 grid gap-x-12 gap-y-14 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[#f4ead8]">
              Scene editor
            </h3>
            <p className="mt-4 text-[0.95rem] leading-7 text-[#efe6d6]/62">
              Built on Pascal. Walls, levels, items, and CAD bodies live in one scene graph you can
              select and undo.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[#f4ead8]">
              Two CAD engines
            </h3>
            <p className="mt-4 text-[0.95rem] leading-7 text-[#efe6d6]/62">
              FreeCAD for sketches, extrudes, and fillets. Multi-Agent-CAD for standalone mechanical
              parts from a longer brief.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-[#f4ead8]">
              IDE control
            </h3>
            <p className="mt-4 text-[0.95rem] leading-7 text-[#efe6d6]/62">
              Cursor, VS Code, or Codex can drive the same workspace through MCP. Your installed
              OpenRouter model powers planning and generation.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-[#efe6d6]/10 px-6 py-20 sm:px-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#c9844a]">Start</p>
            <h2 className="display mt-3 text-4xl text-[#f4ead8] sm:text-5xl">
              Open a live workspace.
            </h2>
            <p className="mt-4 max-w-md text-[0.95rem] leading-7 text-[#efe6d6]/62">
              {configured
                ? 'Sign in to keep a session, or enter the editor and start prompting.'
                : 'No account wall. The editor is the product.'}
            </p>
          </div>
          <Link
            className="inline-flex h-12 items-center rounded-full bg-[#c9844a] px-6 text-sm font-medium text-[#1a110b] transition hover:bg-[#d5975c]"
            href="/workspace"
          >
            Enter the editor
          </Link>
        </div>

        {configured ? (
          <form className="mt-14 max-w-md space-y-4 border-t border-[#efe6d6]/10 pt-10" onSubmit={handleSubmit}>
            <div className="flex gap-4 text-[11px] uppercase tracking-[0.2em]">
              {(['signin', 'signup'] as const).map((nextMode) => (
                <button
                  className={
                    mode === nextMode ? 'text-[#c9844a]' : 'text-[#efe6d6]/40 hover:text-[#efe6d6]'
                  }
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
              className="h-11 w-full border-b border-[#efe6d6]/20 bg-transparent text-sm outline-none placeholder:text-[#efe6d6]/30 focus:border-[#c9844a]"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              type="email"
              value={email}
            />
            <input
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="h-11 w-full border-b border-[#efe6d6]/20 bg-transparent text-sm outline-none placeholder:text-[#efe6d6]/30 focus:border-[#c9844a]"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
            {mode === 'signup' ? (
              <input
                autoComplete="new-password"
                className="h-11 w-full border-b border-[#efe6d6]/20 bg-transparent text-sm outline-none placeholder:text-[#efe6d6]/30 focus:border-[#c9844a]"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                type="password"
                value={confirmPassword}
              />
            ) : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button
              className="h-11 text-sm text-[#c9844a] underline-offset-4 hover:underline disabled:opacity-50"
              disabled={isPending}
              type="submit"
            >
              {isPending ? 'Working…' : mode === 'signin' ? 'Continue' : 'Create account'}
            </button>
          </form>
        ) : null}
      </section>

      <footer className="flex items-center justify-between px-6 py-8 text-[11px] uppercase tracking-[0.18em] text-[#efe6d6]/35 sm:px-10">
        <Link className="hover:text-[#efe6d6]" href="/privacy">
          Privacy
        </Link>
        <Link className="hover:text-[#efe6d6]" href="/terms">
          Terms
        </Link>
      </footer>
    </main>
  )
}
