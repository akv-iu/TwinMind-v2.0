'use client'

import type { CardType, SuggestionCard as SuggestionCardType } from '@/lib/types'
import { ArrowUpRight } from 'lucide-react'

const BADGE_STYLES: Record<CardType, string> = {
  QUESTION_TO_ASK: 'bg-accent-soft text-accent-strong border-accent/15',
  TALKING_POINT: 'bg-[#efebf0] text-[#705671] border-[#ddd4df]',
  ANSWER: 'bg-[#e9eee3] text-moss border-[#d6dfcd]',
  FACT_CHECK: 'bg-[#f5edda] text-[#856018] border-[#e8dcbf]',
}

export function formatCardType(type: CardType): string {
  if (type === 'FACT_CHECK') return 'FACT-CHECK'
  return type.replace(/_/g, ' ')
}

export interface SuggestionCardProps {
  card: SuggestionCardType
  onClick?: () => void
  disabled?: boolean
}

export function SuggestionCard({ card, onClick, disabled }: SuggestionCardProps) {
  const interactive = Boolean(onClick) && !disabled
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={disabled}
      className={[
        'group w-full rounded-lg border border-line bg-sheet p-4 text-left transition-colors disabled:opacity-60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        interactive
          ? 'cursor-pointer hover:border-accent/40 hover:bg-paper'
          : 'cursor-default',
      ].join(' ')}
    >
      <span
        className={[
          'mb-3 inline-block rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em]',
          BADGE_STYLES[card.type],
        ].join(' ')}
      >
        {formatCardType(card.type)}
      </span>
      <p className="font-[Georgia,serif] text-[20px] leading-[1.45] tracking-[-0.02em] text-ink">{card.preview}</p>
      <span className="mt-4 flex items-center justify-between border-t border-line/70 pt-3 text-[10px] text-muted">
        Explore in chat <ArrowUpRight size={13} className="text-accent-strong" aria-hidden="true" />
      </span>
    </button>
  )
}
