import type { ReactNode } from 'react'

export interface ThreeColumnLayoutProps {
  left: ReactNode
  middle: ReactNode
  right: ReactNode
}

export function ThreeColumnLayout({ left, middle, right }: ThreeColumnLayoutProps) {
  return (
    <main aria-label="Meeting workspace" className="grid h-full grid-cols-1 gap-4 text-ink lg:grid-cols-[1fr_1.08fr_1fr]">
      <section aria-label="Transcript" className="flex h-[min(38rem,80dvh)] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-sheet lg:h-auto lg:min-h-0">{left}</section>
      <section aria-label="Suggestions" className="flex h-[min(38rem,80dvh)] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-wash/50 lg:h-auto lg:min-h-0">{middle}</section>
      <section aria-label="Chat" className="flex h-[min(38rem,80dvh)] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-sheet lg:h-auto lg:min-h-0">{right}</section>
    </main>
  )
}
