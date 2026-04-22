import type { ReactNode } from 'react'

export interface ThreeColumnLayoutProps {
  left: ReactNode
  middle: ReactNode
  right: ReactNode
}

export function ThreeColumnLayout({ left, middle, right }: ThreeColumnLayoutProps) {
  return (
    <main className="grid h-screen grid-cols-3 divide-x divide-zinc-800 bg-zinc-950 text-zinc-100">
      <section className="flex flex-col overflow-hidden">{left}</section>
      <section className="flex flex-col overflow-hidden">{middle}</section>
      <section className="flex flex-col overflow-hidden">{right}</section>
    </main>
  )
}
