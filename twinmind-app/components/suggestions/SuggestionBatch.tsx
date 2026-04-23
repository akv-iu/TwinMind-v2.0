'use client'

import { SuggestionCard } from './SuggestionCard'
import type {
  SuggestionBatch as SuggestionBatchType,
  SuggestionCard as SuggestionCardType,
} from '@/lib/types'

export function getBatchOpacity(index: number): string {
  if (index === 0) return 'opacity-100'
  if (index === 1) return 'opacity-60'
  return 'opacity-35'
}

export interface SuggestionBatchProps {
  batch: SuggestionBatchType
  index: number
  onCardClick?: (card: SuggestionCardType) => void
  cardsDisabled?: boolean
}

export function SuggestionBatch({
  batch,
  index,
  onCardClick,
  cardsDisabled,
}: SuggestionBatchProps) {
  return (
    <div className={`${getBatchOpacity(index)} transition-opacity`}>
      <div className="space-y-2 px-4 pt-4">
        {batch.cards.map((card, i) => (
          <SuggestionCard
            key={i}
            card={card}
            disabled={cardsDisabled}
            onClick={onCardClick ? () => onCardClick(card) : undefined}
          />
        ))}
      </div>
      <p className="mb-1 mt-3 text-center text-xs text-zinc-500">
        {'\u2014'} BATCH {batch.batchNumber} {'\u00B7'} {batch.timestamp}
        {batch.degraded ? ' \u00B7 schema-fallback' : ''}
        {batch.repaired ? ' \u00B7 format-repair' : ''}
        {' \u2014'}
      </p>
    </div>
  )
}
