'use client'

import { Settings as SettingsIcon } from 'lucide-react'

interface AppHeaderProps {
  onSettingsClick: () => void
}

export function AppHeader({ onSettingsClick }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-sm font-semibold tracking-tight text-zinc-100">TwinMind</span>
      </div>
      <button
        type="button"
        onClick={onSettingsClick}
        aria-label="Open settings"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
      >
        <SettingsIcon size={13} />
        Settings
      </button>
    </header>
  )
}
