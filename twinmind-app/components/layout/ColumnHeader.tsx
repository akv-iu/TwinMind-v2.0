import type { ReactNode } from 'react'

export interface ColumnHeaderProps {
  number: number
  title: string
  badge?: ReactNode
  actions?: ReactNode
}

export function ColumnHeader({ number, title, badge, actions }: ColumnHeaderProps) {
  return (
    <div className="flex min-h-[65px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
      <h2 className="flex items-center gap-2.5 text-sm font-medium tracking-[-0.025em] text-ink">
        <span className="font-mono text-[10px] font-normal text-accent-strong">0{number}</span> {title}
      </h2>
      <div className="flex items-center gap-2">
        {badge}
        {actions}
      </div>
    </div>
  )
}
