import type { ReactNode } from 'react'

export interface ColumnHeaderProps {
  number: number
  title: string
  badge?: ReactNode
  actions?: ReactNode
}

export function ColumnHeader({ number, title, badge, actions }: ColumnHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
        {number}. {title}
      </h2>
      <div className="flex items-center gap-2">
        {badge}
        {actions}
      </div>
    </div>
  )
}
