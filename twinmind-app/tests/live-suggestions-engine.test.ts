import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeCards } from '@/app/api/suggest/route'
import { getBatchOpacity } from '@/components/suggestions/SuggestionBatch'
import { formatCardType } from '@/components/suggestions/SuggestionCard'
import { useStore } from '@/store'
import type { SuggestionCard } from '@/lib/types'

const sampleCards: SuggestionCard[] = [
  { type: 'QUESTION_TO_ASK', preview: 'What is the deadline?' },
  { type: 'TALKING_POINT', preview: 'Mention the budget freeze.' },
  { type: 'ANSWER', preview: 'The migration is complete.' },
]

beforeEach(() => {
  useStore.setState({ batches: [] })
})

describe('normalizeCards', () => {
  it('pads two cards out to three with the fallback card', () => {
    const result = normalizeCards(sampleCards.slice(0, 2))
    expect(result).toHaveLength(3)
    expect(result[2].type).toBe('ANSWER')
    expect(result[2].preview.length).toBeGreaterThan(0)
  })

  it('trims five cards down to three', () => {
    const five = [...sampleCards, ...sampleCards].slice(0, 5)
    const result = normalizeCards(five)
    expect(result).toHaveLength(3)
  })

  it('accepts a wrapped { cards: [...] } object shape', () => {
    const result = normalizeCards({ cards: sampleCards })
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('QUESTION_TO_ASK')
  })

  it('drops items with invalid card types and pads', () => {
    const dirty = [
      { type: 'NONSENSE', preview: 'bad' },
      sampleCards[0],
    ]
    const result = normalizeCards(dirty)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(sampleCards[0])
    expect(result[1].type).toBe('TALKING_POINT')
  })

  it('deduplicates repeated types to preserve type variety', () => {
    const duplicateHeavy = [
      { type: 'QUESTION_TO_ASK', preview: 'q1' },
      { type: 'QUESTION_TO_ASK', preview: 'q2' },
      { type: 'QUESTION_TO_ASK', preview: 'q3' },
    ]
    const result = normalizeCards(duplicateHeavy)
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.type)).toEqual([
      'QUESTION_TO_ASK',
      'TALKING_POINT',
      'ANSWER',
    ])
  })
})

describe('addBatch', () => {
  it('prepends a new batch so the newest is at index 0', () => {
    useStore.getState().addBatch({ timestamp: '04:52:07 PM', cards: sampleCards })
    useStore.getState().addBatch({ timestamp: '04:53:00 PM', cards: sampleCards })
    const batches = useStore.getState().batches
    expect(batches[0].timestamp).toBe('04:53:00 PM')
    expect(batches[0].batchNumber).toBe(2)
    expect(batches[1].batchNumber).toBe(1)
  })
})

describe('getBatchOpacity', () => {
  it('returns full opacity for the newest batch', () => {
    expect(getBatchOpacity(0)).toBe('opacity-100')
  })
  it('returns mid opacity for the second batch', () => {
    expect(getBatchOpacity(1)).toBe('opacity-60')
  })
  it('returns low opacity for older batches', () => {
    expect(getBatchOpacity(2)).toBe('opacity-35')
    expect(getBatchOpacity(7)).toBe('opacity-35')
  })
})

describe('formatCardType', () => {
  it('replaces underscores with spaces', () => {
    expect(formatCardType('QUESTION_TO_ASK')).toBe('QUESTION TO ASK')
    expect(formatCardType('TALKING_POINT')).toBe('TALKING POINT')
    expect(formatCardType('ANSWER')).toBe('ANSWER')
  })
  it('renders FACT_CHECK with a hyphen', () => {
    expect(formatCardType('FACT_CHECK')).toBe('FACT-CHECK')
  })
})
