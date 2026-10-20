'use client'

import Link from 'next/link'
import { AudioLines, Settings as SettingsIcon } from 'lucide-react'

interface AppHeaderProps {
  onSettingsClick: () => void
}

export function AppHeader({ onSettingsClick }: AppHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-line bg-paper px-5 py-4 sm:px-8">
      <div className="flex items-center gap-6">
        <Link href="/" aria-label="TwinMind home" className="flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-white">
            <AudioLines size={23} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="text-[21px] font-semibold tracking-[-0.9px]">twinmind<span className="text-accent">.</span></span>
        </Link>
        <span className="hidden border-l border-line pl-6 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:block">A little backup for your brain.</span>
      </div>
      <button
        type="button"
        onClick={onSettingsClick}
        aria-label="Open settings"
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-sheet px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <SettingsIcon size={14} aria-hidden="true" />
        Settings
      </button>
    </header>
  )
}
