'use client'

import { useState } from 'react'
import { X, Info } from 'lucide-react'

export function InfraNoticeBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-300/80">
      <div className="flex items-center gap-2 min-w-0">
        <Info size={12} className="shrink-0 text-amber-400/70" />
        <span className="truncate">
          Demo on <span className="font-medium text-amber-300">Vercel Hobby</span> — 10s function limit applies. Occasional timeouts possible under load.
          Production deployment would move to{' '}
          <span className="font-medium text-amber-300">Pro tier</span> for extended limits and SLA.
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss notice"
        className="shrink-0 rounded p-0.5 text-amber-400/50 transition-colors hover:bg-amber-900/40 hover:text-amber-300"
      >
        <X size={12} />
      </button>
    </div>
  )
}
