'use client'

import type { CardType, SuggestionCard as SuggestionCardType } from '@/lib/types'

const BADGE_STYLES: Record<CardType, string> = {
  QUESTION_TO_ASK: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  TALKING_POINT: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  ANSWER: 'bg-green-500/20 text-green-300 border-green-500/30',
  FACT_CHECK: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
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
        'w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600',
        interactive
          ? 'cursor-pointer hover:bg-zinc-800/50'
          : 'cursor-default',
      ].join(' ')}
    >
      <span
        className={[
          'mb-2 inline-block rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-widest',
          BADGE_STYLES[card.type],
        ].join(' ')}
      >
        {formatCardType(card.type)}
      </span>
      <p className="text-sm leading-relaxed text-zinc-100">{card.preview}</p>
    </button>
  )
}
