'use client'

import { useState } from 'react'
import { generateHostedMacPart } from '../lib/mac-part-executor'

export function MacCadPanel() {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const generate = async () => {
    setBusy(true)
    setStatus('Sending MAC job to Pistola Canner…')
    try {
      const result = await generateHostedMacPart(prompt)
      setStatus(`Created MAC body ${result.bodyId}.`)
      setPrompt('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'MAC generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="pointer-events-auto fixed right-4 top-4 z-[80] w-72 rounded-xl border border-emerald-400/25 bg-[#10251f]/95 p-3 text-xs text-emerald-50 shadow-2xl backdrop-blur">
      <div className="font-semibold tracking-wide">MAC solid generator</div>
      <p className="mt-1 text-emerald-100/70">Generate one engineered part through Pistola Canner.</p>
      <textarea
        className="mt-2 min-h-20 w-full resize-y rounded-md border border-emerald-100/15 bg-black/20 p-2 outline-none placeholder:text-emerald-100/35 focus:border-emerald-300/50"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Example: a rounded heart pendant with a 3 mm hole"
      />
      <button
        className="mt-2 w-full rounded-md bg-emerald-400 px-3 py-2 font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || !prompt.trim()}
        onClick={() => void generate()}
        type="button"
      >
        {busy ? 'Generating…' : 'Generate MAC part'}
      </button>
      {status ? <p className="mt-2 text-emerald-100/80">{status}</p> : null}
      <a className="mt-2 block text-emerald-300 underline" href="https://pistolacodex.canner.app/login" target="_blank" rel="noreferrer">
        Sign in to Pistola Canner
      </a>
    </aside>
  )
}
