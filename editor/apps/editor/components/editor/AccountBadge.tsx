'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'

type AccountBadgeProps = {
  email: string
}

export function AccountBadge({ email }: AccountBadgeProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const onSignOut = async () => {
    setIsPending(true)

    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
      })
    } finally {
      startTransition(() => {
        router.replace('/login')
        router.refresh()
      })
    }
  }

  return (
    <div className="pointer-events-auto absolute top-4 right-4 z-[120] flex items-center gap-3 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-white shadow-lg backdrop-blur">
      <div className="min-w-0">
        <div className="font-medium text-[11px] uppercase tracking-[0.18em] text-white/60">
          Signed In
        </div>
        <div className="max-w-[18rem] truncate text-sm">{email}</div>
      </div>
      <button
        className="rounded-full border border-white/15 px-3 py-1 text-xs transition hover:bg-white/10 disabled:opacity-60"
        disabled={isPending}
        onClick={onSignOut}
        type="button"
      >
        {isPending ? 'Signing out...' : 'Sign Out'}
      </button>
    </div>
  )
}
