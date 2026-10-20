'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'

export function InfraNoticeBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-wash px-5 py-2 text-[11px] text-muted sm:px-8">
      <div className="flex items-center gap-2 min-w-0">
        <Info size={13} className="shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-ink">A note on this demo:</span> Vercel Hobby has a 10-second function limit. You may see occasional timeouts under load.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss notice"
        className="flex size-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <X size={12} />
      </button>
    </div>
  )
}
